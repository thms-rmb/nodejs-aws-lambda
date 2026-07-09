// Ported from t/03_init_error.t. In Perl the handler module returns a false
// value so `require` fails; the Node equivalent is a module that throws at
// import time (see test/handlers/init-error.js). Either way _init reports an
// initialization error and handleEvent short-circuits before lambdaNext.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { BootstrapMock } from './helpers/bootstrap-mock.js';

const taskRoot = join(import.meta.dirname, 'handlers');

test('a handler module that fails to load is reported via lambdaInitError', async () => {
  let error;
  const bootstrap = new BootstrapMock({
    handler: 'init-error.handle',
    runtimeApi: 'example.com',
    taskRoot,
    lambdaInitError: (e) => {
      error = e;
    },
    // lambdaNext is intentionally left as the "unexpected call" default.
  });

  assert.ok(!(await bootstrap.handleEvent()));
  assert.match(String(error?.message ?? error), /init handler failed to load/);
});
