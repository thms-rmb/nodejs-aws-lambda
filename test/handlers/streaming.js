// Streaming echo handler — returns a responder function. Ported from
// t/test_handlers/streaming.pl.
import { getCurrentContext } from '../../src/index.js';

/**
 * @param {*} payload
 * @param {import('../../src/context.js').Context} context
 * @returns {import('../../src/bootstrap.js').StreamingHandler}
 */
export function handle(payload, context) {
  if (!payload) throw new Error('payload is empty');
  if (!context) throw new Error('context is empty');
  if (getCurrentContext() !== context) throw new Error('current context is invalid');
  if (!process.env._X_AMZN_TRACE_ID) throw new Error('trace_id is empty');
  return (responder) => {
    const writer = responder('application/json');
    writer.write(JSON.stringify(payload));
    writer.close();
  };
}
