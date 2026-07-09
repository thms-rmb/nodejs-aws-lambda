/**
 * Node.js port of `AWS::Lambda::Context`.
 *
 * @module context
 */

/**
 * @typedef {object} ContextArgs
 * @property {number|string} deadlineMs The date (in Unix epoch milliseconds)
 *   by which the function must exit. Required.
 * @property {string} [awsRequestId] The identifier of the invocation request.
 * @property {string} [invokedFunctionArn] The ARN used to invoke the function.
 * @property {string} [traceId] The AWS X-Ray tracing header.
 * @property {string} [tenantId] The tenant id for the function.
 */

/**
 * The Lambda context object, passed to the handler as its second argument.
 *
 * Per-invocation fields come from the response headers of the "next
 * invocation" call; the remaining accessors read process environment
 * variables that Lambda sets once per execution environment.
 */
export class Context {
  /**
   * @param {ContextArgs} args
   */
  constructor(args = /** @type {ContextArgs} */ ({})) {
    if (args.deadlineMs === undefined || args.deadlineMs === null) {
      throw new Error('deadline_ms is required');
    }

    /**
     * The date (in Unix epoch milliseconds) by which the function must exit.
     * @type {number}
     */
    this.deadlineMs = Number(args.deadlineMs);

    /**
     * The ARN used to invoke the function.
     * @type {string}
     */
    this.invokedFunctionArn = args.invokedFunctionArn ?? '';

    /**
     * The identifier of the invocation request.
     * @type {string}
     */
    this.awsRequestId = args.awsRequestId ?? '';

    /**
     * The AWS X-Ray tracing header.
     * @type {string|undefined}
     */
    this.traceId = args.traceId;

    /**
     * The tenant id for the function.
     * @type {string|undefined}
     */
    this.tenantId = args.tenantId;
  }

  /**
   * The number of milliseconds left before the execution times out.
   *
   * @returns {number}
   */
  getRemainingTimeInMillis() {
    return this.deadlineMs - Date.now();
  }

  /**
   * The name of the Lambda function (`AWS_LAMBDA_FUNCTION_NAME`).
   *
   * @returns {string}
   * @throws {Error} if the environment variable is not set.
   */
  get functionName() {
    return required('AWS_LAMBDA_FUNCTION_NAME', 'function_name');
  }

  /**
   * The version of the function (`AWS_LAMBDA_FUNCTION_VERSION`).
   *
   * @returns {string}
   * @throws {Error} if the environment variable is not set.
   */
  get functionVersion() {
    return required('AWS_LAMBDA_FUNCTION_VERSION', 'function_version');
  }

  /**
   * The amount of memory configured on the function, in MB
   * (`AWS_LAMBDA_FUNCTION_MEMORY_SIZE`).
   *
   * @returns {number}
   * @throws {Error} if the environment variable is not set.
   */
  get memoryLimitInMb() {
    return Number(required('AWS_LAMBDA_FUNCTION_MEMORY_SIZE', 'memory_limit_in_mb'));
  }

  /**
   * The log group for the function (`AWS_LAMBDA_LOG_GROUP_NAME`).
   *
   * @returns {string}
   * @throws {Error} if the environment variable is not set.
   */
  get logGroupName() {
    return required('AWS_LAMBDA_LOG_GROUP_NAME', 'log_group_name');
  }

  /**
   * The log stream for the function instance (`AWS_LAMBDA_LOG_STREAM_NAME`).
   *
   * @returns {string}
   * @throws {Error} if the environment variable is not set.
   */
  get logStreamName() {
    return required('AWS_LAMBDA_LOG_STREAM_NAME', 'log_stream_name');
  }

  /**
   * Cognito identity information. Not implemented (matches the Perl port).
   *
   * @returns {undefined}
   */
  get identity() {
    return undefined; // TODO
  }

  /**
   * Client context sent by the mobile SDK. Not implemented (matches the Perl
   * port).
   *
   * @returns {undefined}
   */
  get clientContext() {
    return undefined; // TODO
  }
}

/**
 * Read a required environment variable, throwing with the Perl-compatible
 * "<label> is not found" message when it is absent.
 *
 * @param {string} name
 * @param {string} label
 * @returns {string}
 */
function required(name, label) {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${label} is not found`);
  }
  return value;
}
