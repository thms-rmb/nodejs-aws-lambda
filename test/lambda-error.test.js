// Ported from t/12_lambda_error.t — lambdaError POSTs {errorMessage, errorType}
// (with a UTF-8 message).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { Bootstrap } from '../src/bootstrap.js';
import { Context } from '../src/context.js';
import { startMockRuntime } from './helpers/mock-runtime.js';

const taskRoot = join(import.meta.dirname, 'handlers');

test('lambdaError posts the error message and type', async () => {
  let received;
  const server = await startMockRuntime((req, body, res) => {
    received = { method: req.method, url: req.url, body };
    res.writeHead(200);
    res.end();
  });

  try {
    const bootstrap = new Bootstrap({
      handler: 'echo.handle',
      taskRoot,
      runtimeApi: `127.0.0.1:${server.port}`,
    });

    const context = new Context({
      deadlineMs: 1542409706888,
      awsRequestId: '8476a536-e9f4-11e8-9739-2dfe598c3fcd',
      invokedFunctionArn: 'arn:aws:lambda:us-east-2:123456789012:function:custom-runtime',
    });
    await bootstrap.lambdaError(new Error('some error 😨'), context);

    assert.equal(received.method, 'POST');
    assert.equal(received.url, '/2018-06-01/runtime/invocation/8476a536-e9f4-11e8-9739-2dfe598c3fcd/error');
    assert.deepEqual(JSON.parse(received.body), { errorMessage: 'some error 😨', errorType: 'Error' });
  } finally {
    await server.close();
  }
});
