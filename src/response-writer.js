/**
 * Node.js port of `AWS::Lambda::ResponseWriter`.
 *
 * Writes a Lambda response-streaming body to the Runtime API using HTTP/1.1
 * chunked transfer encoding. The Perl version hand-frames chunks and trailers
 * on top of `HTTP::Tiny` internals; Node's `http.ClientRequest` performs chunk
 * framing and trailer emission natively, so this implementation delegates to
 * it.
 *
 * @module response-writer
 */

import http from 'node:http';
import https from 'node:https';

import { errorMessage, errorType } from './errors.js';

/**
 * @typedef {object} ResponseWriterArgs
 * @property {string} responseUrl The Runtime API invocation-response URL.
 *   Required.
 * @property {string} [contentType] Default content type. Defaults to
 *   `application/json`.
 */

/**
 * @typedef {object} StreamingResult
 * @property {number} status The HTTP status code returned by the Runtime API.
 * @property {import('node:http').IncomingHttpHeaders} headers Response headers.
 * @property {string} body The response body decoded as UTF-8.
 * @property {boolean} success Whether the status is a 2xx.
 */

export class ResponseWriter {
  /**
   * @param {ResponseWriterArgs} args
   */
  constructor(args) {
    if (!args || !args.responseUrl) {
      throw new Error('response_url is required');
    }

    /** @type {string} */
    this.responseUrl = args.responseUrl;
    /** @type {string} */
    this.contentType = args.contentType ?? 'application/json';
    /** @type {import('node:http').ClientRequest | undefined} */
    this.request = undefined;
    /** @type {boolean} */
    this.closed = false;
    /** @type {Promise<import('node:http').IncomingMessage> | undefined} */
    this._responsePromise = undefined;
  }

  /**
   * Open the chunked POST request to the Runtime API and send the request
   * headers. Internal: called by `Bootstrap.lambdaResponseStreaming`.
   *
   * @param {string} [contentType]
   * @returns {void}
   */
  _request(contentType = this.contentType) {
    const target = new URL(this.responseUrl);
    const lib = target.protocol === 'https:' ? https : http;
    const req = lib.request(target, {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'transfer-encoding': 'chunked',
        trailer: 'Lambda-Runtime-Function-Error-Type, Lambda-Runtime-Function-Error-Body',
        'lambda-runtime-function-response-mode': 'streaming',
      },
    });

    this.request = req;
    this._responsePromise = new Promise((resolve, reject) => {
      req.on('response', resolve);
      req.on('error', reject);
    });
  }

  /**
   * Write a chunk of the response body. Empty data is a no-op.
   *
   * @param {string|Buffer} data
   * @returns {boolean} `true` once the chunk has been queued.
   */
  write(data) {
    if (this.closed) {
      throw new Error('write failed: already closed');
    }
    if (data === undefined || data === null || data.length === 0) {
      return true;
    }
    this.request?.write(data);
    return true;
  }

  /**
   * Finish the response by writing the terminating chunk. Idempotent.
   *
   * @returns {void}
   */
  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.request?.end();
  }

  /**
   * Abort the stream by attaching error trailers, then finish the request.
   * Used when the handler throws after streaming has started. Idempotent.
   *
   * @param {unknown} error
   * @returns {void}
   */
  _closeWithError(error) {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.request?.addTrailers({
      'Lambda-Runtime-Function-Error-Type': errorType(error),
      'Lambda-Runtime-Function-Error-Body': Buffer.from(errorMessage(error), 'utf8').toString('base64'),
    });
    this.request?.end();
  }

  /**
   * Close the request if needed and read the Runtime API's response.
   *
   * @returns {Promise<StreamingResult>}
   */
  async _handleResponse() {
    if (!this.closed) {
      this.close();
    }
    const res = await /** @type {Promise<import('node:http').IncomingMessage>} */ (this._responsePromise);
    /** @type {Buffer[]} */
    const chunks = [];
    for await (const chunk of res) {
      chunks.push(chunk);
    }
    const status = res.statusCode ?? 0;
    return {
      status,
      headers: res.headers,
      body: Buffer.concat(chunks).toString('utf8'),
      success: Math.trunc(status / 100) === 2,
    };
  }
}
