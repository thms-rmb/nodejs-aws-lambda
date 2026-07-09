/**
 * Helpers that reproduce the Perl library's error reporting shape. The Perl
 * code uses `"$error"` for the message and `blessed($error) // "Error"` for
 * the type; the JS analog inspects `Error` instances.
 *
 * @module errors
 */

/**
 * The human-readable error message reported to Lambda.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The error type reported to Lambda. For `Error` instances this is the
 * constructor name (e.g. `TypeError`, or a custom subclass name); otherwise
 * it is `"Error"` — matching Perl's `blessed($error) // "Error"`.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function errorType(error) {
  return error instanceof Error ? (error.constructor?.name ?? 'Error') : 'Error';
}
