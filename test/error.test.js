// Ported from t/02_error.t — handler throws, error is reported, loop continues.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { BootstrapMock } from './helpers/bootstrap-mock.js';

const taskRoot = join(import.meta.dirname, 'handlers');

test('a throwing handler is reported via lambdaError and handleEvent is falsy', async () => {
  let error;
  const bootstrap = new BootstrapMock({
    handler: 'error.handle',
    runtimeApi: 'example.com',
    taskRoot,
    lambdaNext: () => [{ key1: 1, key2: 2, key3: 3 }, undefined],
    lambdaError: (e) => {
      error = e;
    },
    // lambdaResponse is intentionally left as the "unexpected call" default.
  });

  assert.ok(!(await bootstrap.handleEvent()));
  assert.match(String(error?.message ?? error), /some error/);
});
