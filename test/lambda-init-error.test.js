// Ported from t/13_lambda_init_error.t — lambdaInitError POSTs to /init/error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { Bootstrap } from '../src/bootstrap.js';
import { startMockRuntime } from './helpers/mock-runtime.js';

const taskRoot = join(import.meta.dirname, 'handlers');

test('lambdaInitError posts the error message and type to /init/error', async () => {
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

    await bootstrap.lambdaInitError(new Error('some error 😨'));

    assert.equal(received.method, 'POST');
    assert.equal(received.url, '/2018-06-01/runtime/init/error');
    assert.deepEqual(JSON.parse(received.body), { errorMessage: 'some error 😨', errorType: 'Error' });
  } finally {
    await server.close();
  }
});
