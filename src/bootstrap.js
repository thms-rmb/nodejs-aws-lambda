/**
 * Node.js port of `AWS::Lambda::Bootstrap` — the AWS Lambda custom-runtime
 * event loop. It loads the handler, then repeatedly fetches the next
 * invocation from the Runtime API, invokes the handler, and posts the
 * response or error.
 *
 * @module bootstrap
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Context } from './context.js';
import { ResponseWriter } from './response-writer.js';
import { request } from './http.js';
import { errorMessage, errorType } from './errors.js';
import { _setCurrentContext } from './current-context.js';

const API_VERSION = '2018-06-01';

/** Handler-file extensions tried, in order, when resolving `_HANDLER`. */
const HANDLER_EXTENSIONS = ['.js', '.mjs', '.cjs'];

/**
 * A Lambda handler function. May be `async`. Returning a function selects
 * {@link https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html response streaming}.
 *
 * @callback Handler
 * @param {*} payload The invocation event, JSON-decoded.
 * @param {Context} context The invocation {@link Context}.
 * @returns {*|Promise<*>|StreamingHandler|Promise<StreamingHandler>}
 */

/**
 * A response-streaming handler: the value a {@link Handler} returns when it
 * wants to stream. It receives a `responder` and writes the body via the
 * {@link ResponseWriter} the responder returns.
 *
 * @callback StreamingHandler
 * @param {(contentType?: string) => ResponseWriter} responder
 * @returns {void|Promise<void>}
 */

/**
 * @typedef {object} BootstrapArgs
 * @property {string} [handler] The handler in `file.function` form. Falls back
 *   to `_HANDLER`.
 * @property {string} [runtimeApi] The Runtime API host:port. Falls back to
 *   `AWS_LAMBDA_RUNTIME_API`.
 * @property {string} [taskRoot] The directory containing the handler file.
 *   Falls back to `LAMBDA_TASK_ROOT`.
 * @property {number|string} [maxWorkers] Number of concurrent invocation loops
 *   to run. Falls back to `AWS_LAMBDA_MAX_CONCURRENCY`, then `0`.
 */

export class Bootstrap {
  /**
   * @param {BootstrapArgs} [args]
   */
  constructor(args = {}) {
    const envHandler = args.handler ?? process.env._HANDLER;
    if (envHandler === undefined) {
      throw new Error('$_HANDLER is not found');
    }
    const runtimeApi = args.runtimeApi ?? process.env.AWS_LAMBDA_RUNTIME_API;
    if (runtimeApi === undefined) {
      throw new Error('$AWS_LAMBDA_RUNTIME_API is not found');
    }
    const taskRoot = args.taskRoot ?? process.env.LAMBDA_TASK_ROOT;
    if (taskRoot === undefined) {
      throw new Error('$LAMBDA_TASK_ROOT is not found');
    }
    const maxWorkers = args.maxWorkers ?? process.env.AWS_LAMBDA_MAX_CONCURRENCY ?? 0;
    if (!/^\d+$/.test(String(maxWorkers))) {
      throw new Error(`max_workers must be a non-negative integer, got: ${maxWorkers}`);
    }

    // Split "file.function" on the first dot, matching Perl's split(/[.]/, ..., 2).
    const dot = envHandler.indexOf('.');
    /** @type {string} The handler file name, without extension. */
    this.file = dot === -1 ? envHandler : envHandler.slice(0, dot);
    /** @type {string|undefined} The exported handler function name. */
    this.functionName = dot === -1 ? undefined : envHandler.slice(dot + 1);

    /** @type {string} */
    this.taskRoot = taskRoot;
    /** @type {string} */
    this.runtimeApi = runtimeApi;
    /** @type {string} */
    this.apiVersion = API_VERSION;
    /** @type {string} */
    this.nextEventUrl = `http://${runtimeApi}/${API_VERSION}/runtime/invocation/next`;
    /** @type {number} */
    this.maxWorkers = Number(maxWorkers);
    /** @type {Handler|undefined} The resolved handler function. */
    this.function = undefined;
    /** @type {boolean} Set by SIGTERM/SIGHUP to stop the worker loops. */
    this._stop = false;
  }

  /**
   * Import the handler module and resolve the exported function, once. On
   * failure, report an initialization error, install a no-op, and return
   * `null` so the caller can stop.
   *
   * @returns {Promise<Handler|null>}
   */
  async _init() {
    if (this.function) {
      return this.function;
    }
    try {
      const module = await this._importHandler();
      const fn = this.functionName === undefined ? undefined : module[this.functionName];
      if (typeof fn !== 'function') {
        throw new Error(`handler ${this.functionName} is not found`);
      }
      this.function = fn;
      return fn;
    } catch (error) {
      await this.lambdaInitError(error);
      this.function = () => {};
      return null;
    }
  }

  /**
   * Dynamically import the handler file, resolving its extension.
   *
   * @returns {Promise<Record<string, unknown>>}
   */
  async _importHandler() {
    const base = join(this.taskRoot, this.file);
    let file = `${base}.js`;
    for (const ext of HANDLER_EXTENSIONS) {
      if (existsSync(base + ext)) {
        file = base + ext;
        break;
      }
    }
    return import(pathToFileURL(file).href);
  }

  /**
   * Handle a single invocation: fetch the next event, invoke the handler, and
   * post the response, streaming response, or error.
   *
   * @returns {Promise<boolean|undefined>} `true` on a normal response,
   *   otherwise a falsy value.
   */
  async handleEvent() {
    if (!(await this._init())) {
      return undefined;
    }
    const [payload, context] = await this.lambdaNext();

    let result;
    const previousTraceId = process.env._X_AMZN_TRACE_ID;
    try {
      if (context?.traceId === undefined) {
        delete process.env._X_AMZN_TRACE_ID;
      } else {
        process.env._X_AMZN_TRACE_ID = context.traceId;
      }
      _setCurrentContext(context);
      result = await /** @type {Handler} */ (this.function)(payload, context);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : error}\n`);
      await this.lambdaError(error, context);
      return undefined;
    } finally {
      _setCurrentContext(undefined);
      if (previousTraceId === undefined) {
        delete process.env._X_AMZN_TRACE_ID;
      } else {
        process.env._X_AMZN_TRACE_ID = previousTraceId;
      }
    }

    if (typeof result === 'function') {
      await this.lambdaResponseStreaming(result, context);
    } else {
      await this.lambdaResponse(result, context);
    }
    return true;
  }

  /**
   * Fetch the next invocation and build its {@link Context} from the response
   * headers.
   *
   * @returns {Promise<[unknown, Context]>} `[payload, context]`.
   */
  async lambdaNext() {
    const response = await request(this.nextEventUrl);
    if (!response.success) {
      throw new Error(`failed to retrieve the next event: ${response.status}`);
    }
    const h = response.headers;
    const payload = JSON.parse(response.body);
    const context = new Context({
      deadlineMs: /** @type {string} */ (h['lambda-runtime-deadline-ms']),
      awsRequestId: /** @type {string} */ (h['lambda-runtime-aws-request-id']),
      invokedFunctionArn: /** @type {string} */ (h['lambda-runtime-invoked-function-arn']),
      traceId: /** @type {string} */ (h['lambda-runtime-trace-id']),
      tenantId: /** @type {string} */ (h['lambda-runtime-aws-tenant-id']),
    });
    return [payload, context];
  }

  /**
   * Post a buffered handler response to the Runtime API.
   *
   * @param {unknown} response The handler's return value.
   * @param {Context} context
   * @returns {Promise<void>}
   */
  async lambdaResponse(response, context) {
    const url = `http://${this.runtimeApi}/${this.apiVersion}/runtime/invocation/${context.awsRequestId}/response`;
    const result = await request(url, { method: 'POST', body: JSON.stringify(response) });
    if (!result.success) {
      throw new Error(`failed to response of execution: ${result.status}`);
    }
  }

  /**
   * Stream a handler response to the Runtime API.
   *
   * @param {StreamingHandler} response The streaming callback the handler
   *   returned.
   * @param {Context} context
   * @returns {Promise<void>}
   */
  async lambdaResponseStreaming(response, context) {
    const url = `http://${this.runtimeApi}/${this.apiVersion}/runtime/invocation/${context.awsRequestId}/response`;
    /** @type {ResponseWriter|undefined} */
    let writer;
    try {
      await response((contentType) => {
        writer = new ResponseWriter({ responseUrl: url, contentType });
        writer._request(contentType);
        return writer;
      });
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : error}\n`);
      if (writer) {
        writer._closeWithError(error);
      } else {
        await this.lambdaError(error, context);
      }
    }
    if (writer) {
      const result = await writer._handleResponse();
      if (!result.success) {
        throw new Error(`failed to response of execution: ${result.status}`);
      }
    }
  }

  /**
   * Report an invocation error to the Runtime API.
   *
   * @param {unknown} error
   * @param {Context} context
   * @returns {Promise<void>}
   */
  async lambdaError(error, context) {
    const url = `http://${this.runtimeApi}/${this.apiVersion}/runtime/invocation/${context.awsRequestId}/error`;
    const result = await request(url, {
      method: 'POST',
      body: JSON.stringify({ errorMessage: errorMessage(error), errorType: errorType(error) }),
    });
    if (!result.success) {
      throw new Error(`failed to send error of execution: ${result.status}`);
    }
  }

  /**
   * Report an initialization error to the Runtime API.
   *
   * @param {unknown} error
   * @returns {Promise<void>}
   */
  async lambdaInitError(error) {
    const url = `http://${this.runtimeApi}/${this.apiVersion}/runtime/init/error`;
    const result = await request(url, {
      method: 'POST',
      body: JSON.stringify({ errorMessage: errorMessage(error), errorType: errorType(error) }),
    });
    if (!result.success) {
      throw new Error(`failed to send error of execution: ${result.status}`);
    }
  }

  /**
   * The inner invocation loop. Runs until {@link Bootstrap#_stop} is set.
   *
   * @returns {Promise<void>}
   */
  async _handleEvents() {
    while (!this._stop) {
      await this.handleEvent();
    }
  }

  /**
   * Initialize the handler and process events. With `maxWorkers > 0`, run that
   * many concurrent invocation loops (the Node analog of Perl's
   * `Parallel::Prefork`), stopping on SIGTERM/SIGHUP.
   *
   * @returns {Promise<void>}
   */
  async handleEvents() {
    if (!(await this._init())) {
      return;
    }
    if (this.maxWorkers > 0) {
      const stop = () => {
        this._stop = true;
      };
      process.on('SIGTERM', stop);
      process.on('SIGHUP', stop);
      try {
        await Promise.all(Array.from({ length: this.maxWorkers }, () => this._handleEvents()));
      } finally {
        process.removeListener('SIGTERM', stop);
        process.removeListener('SIGHUP', stop);
      }
    } else {
      await this._handleEvents();
    }
  }
}

/**
 * Construct a {@link Bootstrap} for `handler` and run its event loop. The
 * convenience entry point used by the `bootstrap` executable.
 *
 * @param {string} [handler] The handler in `file.function` form. Falls back to
 *   `_HANDLER`.
 * @returns {Promise<void>}
 */
export async function bootstrap(handler) {
  const instance = new Bootstrap({ handler });
  await instance.handleEvents();
}
