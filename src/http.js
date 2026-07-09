/**
 * A tiny buffered HTTP client built on `node:http` — the Node analog of the
 * Perl library's use of `HTTP::Tiny`. Kept intentionally minimal: only what
 * the Lambda Runtime API client needs (a long-polling GET and a POST with a
 * string body). Streaming responses use `node:http` directly, see
 * {@link module:response-writer}.
 *
 * @module http
 */

import http from 'node:http';
import https from 'node:https';

/**
 * @typedef {object} HttpResponse
 * @property {number} status The HTTP status code.
 * @property {import('node:http').IncomingHttpHeaders} headers Response headers
 *   (lower-cased keys, as Node provides them).
 * @property {string} body The response body decoded as UTF-8.
 * @property {boolean} success Whether the status is a 2xx.
 */

/**
 * @typedef {object} RequestOptions
 * @property {string} [method] HTTP method. Defaults to `GET`.
 * @property {Record<string, string>} [headers] Request headers.
 * @property {string} [body] Request body, sent as UTF-8.
 * @property {number} [timeout] Socket timeout in milliseconds. Omit to disable
 *   (used for the long-poll "next invocation" request).
 */

/**
 * Perform a buffered HTTP request and resolve once the whole response body has
 * been read.
 *
 * @param {string} url
 * @param {RequestOptions} [options]
 * @returns {Promise<HttpResponse>}
 */
export function request(url, options = {}) {
  const { method = 'GET', headers = {}, body, timeout } = options;
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;

    /** @type {Record<string, string|number>} */
    const outHeaders = { ...headers };
    if (body !== undefined && body !== null && outHeaders['content-length'] === undefined) {
      outHeaders['content-length'] = Buffer.byteLength(body, 'utf8');
    }

    const req = lib.request(target, { method, headers: outHeaders }, (res) => {
      /** @type {Buffer[]} */
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        resolve({
          status,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
          success: Math.trunc(status / 100) === 2,
        });
      });
    });

    req.on('error', reject);
    if (timeout !== undefined) {
      req.setTimeout(timeout, () => req.destroy(new Error(`request timed out after ${timeout}ms`)));
    }
    if (body !== undefined && body !== null) {
      req.write(body);
    }
    req.end();
  });
}
