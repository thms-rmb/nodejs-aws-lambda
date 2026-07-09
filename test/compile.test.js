// Ported from t/00_compile.t — the static imports below are the load smoke
// test; if any module fails to parse/load, this file fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as index from '../src/index.js';
import { Bootstrap, bootstrap } from '../src/bootstrap.js';
import { Context } from '../src/context.js';
import { ResponseWriter } from '../src/response-writer.js';
import { getCurrentContext } from '../src/current-context.js';
import { request } from '../src/http.js';
import { errorMessage, errorType } from '../src/errors.js';

test('modules load and expose their public API', () => {
  assert.equal(typeof index.Bootstrap, 'function');
  assert.equal(typeof index.bootstrap, 'function');
  assert.equal(typeof index.Context, 'function');
  assert.equal(typeof index.ResponseWriter, 'function');
  assert.equal(typeof index.getCurrentContext, 'function');

  assert.equal(typeof Bootstrap, 'function');
  assert.equal(typeof bootstrap, 'function');
  assert.equal(typeof Context, 'function');
  assert.equal(typeof ResponseWriter, 'function');
  assert.equal(typeof getCurrentContext, 'function');
  assert.equal(typeof request, 'function');
  assert.equal(typeof errorMessage, 'function');
  assert.equal(typeof errorType, 'function');
});
