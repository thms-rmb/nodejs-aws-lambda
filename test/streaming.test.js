// Ported from t/14_streaming.t — a handler that returns a function is routed to
// the streaming responder rather than the buffered one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { BootstrapMock } from './helpers/bootstrap-mock.js';
import { Context } from '../src/context.js';

const taskRoot = join(import.meta.dirname, 'handlers');

test('a function-returning handler is routed to lambdaResponseStreaming', async () => {
  const payload = { key1: 1, key2: 2, key3: 3 };
  const dummyContext = new Context({
    deadlineMs: 1000,
    awsRequestId: '8476a536-e9f4-11e8-9739-2dfe598c3fcd',
    invokedFunctionArn: 'arn:aws:lambda:us-east-2:123456789012:function:custom-runtime',
    traceId: 'Root=1-5bef4de7-ad49b0e87f6ef6c87fc2e700;Parent=9a9197af755a6419;Sampled=1',
  });

  let response;
  let context;
  const bootstrap = new BootstrapMock({
    handler: 'streaming.handle',
    runtimeApi: 'example.com',
    taskRoot,
    lambdaNext: () => [payload, dummyContext],
    lambdaResponseStreaming: (r, c) => {
      response = r;
      context = c;
    },
  });

  assert.ok(await bootstrap.handleEvent());
  assert.equal(typeof response, 'function');
  assert.equal(context, dummyContext);
});
