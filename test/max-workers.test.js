// Ported from t/16_max_workers.t. Perl uses Parallel::Prefork and stops the
// manager with SIGTERM; the Node port runs `maxWorkers` concurrent async loops.
// The adapted assertion: handleEvents launches that many loops and resolves
// cleanly (here _handleEvents is overridden to resolve immediately, standing in
// for the Perl test's redefinition that sleeps then signals TERM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { Bootstrap } from '../src/bootstrap.js';

const taskRoot = join(import.meta.dirname, 'handlers');

test('handleEvents with maxWorkers runs N concurrent loops and resolves', async () => {
  const bootstrap = new Bootstrap({
    handler: 'echo.handle',
    taskRoot,
    runtimeApi: 'example.com',
    maxWorkers: 5,
  });

  let started = 0;
  bootstrap._handleEvents = async () => {
    started += 1;
  };

  await bootstrap.handleEvents();

  assert.equal(started, 5);
});
