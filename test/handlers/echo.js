// Echo handler — returns the payload. Ported from t/test_handlers/echo.pl.
import { getCurrentContext } from '../../src/index.js';

/**
 * @param {*} payload
 * @param {import('../../src/context.js').Context} context
 * @returns {*}
 */
export function handle(payload, context) {
  if (!payload) throw new Error('payload is empty');
  if (!context) throw new Error('context is empty');
  if (getCurrentContext() !== context) throw new Error('current context is invalid');
  if (!process.env._X_AMZN_TRACE_ID) throw new Error('trace_id is empty');
  return payload;
}
