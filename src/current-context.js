/**
 * The context of the invocation currently being handled.
 *
 * This mirrors the Perl library's global `$AWS::Lambda::context`, which is
 * localized for the duration of each handler call. A handler can read it via
 * {@link getCurrentContext} instead of receiving it as an argument.
 *
 * @module current-context
 */

/** @type {import('./context.js').Context | undefined} */
let current;

/**
 * Return the {@link Context} of the invocation currently being handled, or
 * `undefined` when no invocation is in flight.
 *
 * @returns {import('./context.js').Context | undefined}
 */
export function getCurrentContext() {
  return current;
}

/**
 * Set the current invocation context. Internal: called by `Bootstrap` around
 * each handler invocation.
 *
 * @param {import('./context.js').Context | undefined} context
 * @returns {void}
 */
export function _setCurrentContext(context) {
  current = context;
}
