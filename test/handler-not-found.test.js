// Ported from t/04_handler_not_found.t — the module loads but the named export
// is missing, so _init reports an initialization error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { BootstrapMock } from './helpers/bootstrap-mock.js';

const taskRoot = join(import.meta.dirname, 'handlers');

test('a missing handler function is reported via lambdaInitError', async () => {
  let error;
  const bootstrap = new BootstrapMock({
    handler: 'echo.handle_not_found',
    runtimeApi: 'example.com',
    taskRoot,
    lambdaInitError: (e) => {
      error = e;
    },
  });

  assert.ok(!(await bootstrap.handleEvent()));
  assert.match(String(error?.message ?? error), /handler handle_not_found is not found/);
});
