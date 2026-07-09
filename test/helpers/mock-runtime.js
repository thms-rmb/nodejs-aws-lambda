// A tiny HTTP server used as a mock Lambda Runtime API — the Node analog of the
// Perl tests' Test::TCP + HTTP::Server::PSGI / Starman harness. Node's http
// server reassembles chunked request bodies natively.
import http from 'node:http';

/**
 * @callback MockHandler
 * @param {import('node:http').IncomingMessage} req
 * @param {string} body The fully-buffered request body, decoded as UTF-8.
 * @param {import('node:http').ServerResponse} res
 * @returns {void}
 */

/**
 * @typedef {object} MockServer
 * @property {number} port The ephemeral port the server is listening on.
 * @property {() => Promise<void>} close Stop the server.
 */

/**
 * Start a mock Runtime API server on an ephemeral loopback port.
 *
 * @param {MockHandler} handler
 * @returns {Promise<MockServer>}
 */
export function startMockRuntime(handler) {
  const server = http.createServer((req, res) => {
    /** @type {Buffer[]} */
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => handler(req, Buffer.concat(chunks).toString('utf8'), res));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        port,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
