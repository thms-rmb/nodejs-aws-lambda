// Node port of t/lib/BootstrapMock.pm: a Bootstrap subclass whose five network
// methods delegate to injected callbacks, defaulting to throwing "unexpected
// call of <name>". This is the seam for the mocked unit tests.
import { Bootstrap } from '../../src/bootstrap.js';

/**
 * @param {string} name
 * @returns {() => never}
 */
const unexpected = (name) => () => {
  throw new Error(`unexpected call of ${name}`);
};

export class BootstrapMock extends Bootstrap {
  /**
   * @param {import('../../src/bootstrap.js').BootstrapArgs & {
   *   lambdaNext?: Function,
   *   lambdaResponse?: Function,
   *   lambdaResponseStreaming?: Function,
   *   lambdaError?: Function,
   *   lambdaInitError?: Function,
   * }} args
   */
  constructor(args = {}) {
    super(args);
    this._mocks = {
      lambdaNext: args.lambdaNext ?? unexpected('lambda_next'),
      lambdaResponse: args.lambdaResponse ?? unexpected('lambda_response'),
      lambdaResponseStreaming: args.lambdaResponseStreaming ?? unexpected('lambda_response_streaming'),
      lambdaError: args.lambdaError ?? unexpected('lambda_error'),
      lambdaInitError: args.lambdaInitError ?? unexpected('lambda_init_error'),
    };
  }

  /** @param {...*} args */
  async lambdaNext(...args) {
    return this._mocks.lambdaNext(...args);
  }

  /** @param {...*} args */
  async lambdaResponse(...args) {
    return this._mocks.lambdaResponse(...args);
  }

  /** @param {...*} args */
  async lambdaResponseStreaming(...args) {
    return this._mocks.lambdaResponseStreaming(...args);
  }

  /** @param {...*} args */
  async lambdaError(...args) {
    return this._mocks.lambdaError(...args);
  }

  /** @param {...*} args */
  async lambdaInitError(...args) {
    return this._mocks.lambdaInitError(...args);
  }
}
