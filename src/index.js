/**
 * Node.js port of the Perl `AWS::Lambda` distribution: a client for the AWS
 * Lambda custom-runtime (the OS-only `provided.*` runtime family).
 *
 * @example
 * // handler.js, deployed with a `bootstrap` entry point
 * export function handle(payload, context) {
 *   return { ok: true, requestId: context.awsRequestId };
 * }
 *
 * @module aws-lambda
 */

export { Bootstrap, bootstrap } from './bootstrap.js';
export { Context } from './context.js';
export { ResponseWriter } from './response-writer.js';
export { getCurrentContext } from './current-context.js';
