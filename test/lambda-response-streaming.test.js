// Ported from t/15_lambda_response_streaming.t — the streaming writer sends the
// chunked body with the streaming header, and multiple write() calls reassemble
// into the full body on the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { Bootstrap } from '../src/bootstrap.js';
import { Context } from '../src/context.js';
import { startMockRuntime } from './helpers/mock-runtime.js';

const taskRoot = join(import.meta.dirname, 'handlers');

test('lambdaResponseStreaming streams chunks with the streaming response mode', async () => {
  let received;
  const server = await startMockRuntime((req, body, res) => {
    received = {
      method: req.method,
      url: req.url,
      mode: req.headers['lambda-runtime-function-response-mode'],
      body,
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });

  try {
    const bootstrap = new Bootstrap({
      handler: 'streaming.handle',
      taskRoot,
      runtimeApi: `127.0.0.1:${server.port}`,
    });

    /** @type {import('../src/bootstrap.js').StreamingHandler} */
    const response = (responder) => {
      const writer = responder('application/json');
      writer.write('{"key1":"a","key2":"b",');
      writer.write('"key3":"c"}');
      writer.close();
    };
    const context = new Context({
      deadlineMs: 1542409706888,
      awsRequestId: '8476a536-e9f4-11e8-9739-2dfe598c3fcd',
      invokedFunctionArn: 'arn:aws:lambda:us-east-2:123456789012:function:custom-runtime',
    });
    await bootstrap.lambdaResponseStreaming(response, context);

    assert.equal(received.method, 'POST');
    assert.equal(received.url, '/2018-06-01/runtime/invocation/8476a536-e9f4-11e8-9739-2dfe598c3fcd/response');
    assert.equal(received.mode, 'streaming');
    assert.equal(received.body, '{"key1":"a","key2":"b","key3":"c"}');
  } finally {
    await server.close();
  }
});
