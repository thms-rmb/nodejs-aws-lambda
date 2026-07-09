// Ported from t/10_lambda_next.t — lambdaNext against a real mock Runtime API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { Bootstrap } from '../src/bootstrap.js';
import { startMockRuntime } from './helpers/mock-runtime.js';

const taskRoot = join(import.meta.dirname, 'handlers');

test('lambdaNext fetches and parses the next event and its headers', async () => {
  let requested;
  const server = await startMockRuntime((req, _body, res) => {
    requested = { method: req.method, url: req.url };
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Lambda-Runtime-Aws-Request-Id': '8476a536-e9f4-11e8-9739-2dfe598c3fcd',
      'Lambda-Runtime-Deadline-Ms': '1542409706888',
      'Lambda-Runtime-Invoked-Function-Arn': 'arn:aws:lambda:us-east-2:123456789012:function:custom-runtime',
      'Lambda-Runtime-Trace-Id': 'Root=1-5bef4de7-ad49b0e87f6ef6c87fc2e700;Parent=9a9197af755a6419;Sampled=1',
      'Lambda-Runtime-Aws-Tenant-Id': 'tenant-1234',
    });
    res.end('{"key1":"a", "key2":"b", "key3":"c"}');
  });

  try {
    const bootstrap = new Bootstrap({
      handler: 'echo.handle',
      taskRoot,
      runtimeApi: `127.0.0.1:${server.port}`,
    });

    const [payload, context] = await bootstrap.lambdaNext();

    assert.equal(requested.method, 'GET');
    assert.equal(requested.url, '/2018-06-01/runtime/invocation/next');
    assert.deepEqual(payload, { key1: 'a', key2: 'b', key3: 'c' });
    assert.equal(context.awsRequestId, '8476a536-e9f4-11e8-9739-2dfe598c3fcd');
    assert.equal(context.invokedFunctionArn, 'arn:aws:lambda:us-east-2:123456789012:function:custom-runtime');
    assert.equal(context.traceId, 'Root=1-5bef4de7-ad49b0e87f6ef6c87fc2e700;Parent=9a9197af755a6419;Sampled=1');
    assert.equal(context.tenantId, 'tenant-1234');
  } finally {
    await server.close();
  }
});
