// Handler that always throws. Ported from t/test_handlers/error.pl.

/**
 * @returns {never}
 */
export function handle() {
  throw new Error('some error');
}
