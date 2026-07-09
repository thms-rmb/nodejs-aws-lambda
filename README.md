# nodejs-aws-lambda

A Node.js port of the Perl [`AWS::Lambda`](https://metacpan.org/dist/AWS-Lambda)
custom-runtime client (v0.9.0). It implements the
[AWS Lambda Runtime API](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-custom.html)
so a plain JavaScript handler can run on the OS-only `provided.*` runtime family.

- **Zero runtime dependencies** — built only on Node's `node:http`, `JSON`, etc.
- **Plain ESM** — no bundler, no build step.
- **JSDoc-typed** — full editor IntelliSense.
- Buffered **and** streaming responses.

This port covers the runtime core (`Bootstrap`, `Context`, `ResponseWriter`,
the `bootstrap` entry point). The Perl `AWS::Lambda::PSGI` web adapter and the
`AL`/`AL2`/`AL2023` layer-ARN tables are intentionally out of scope.

## Handler

`_HANDLER` uses the `file.function` format. Given `_HANDLER=handler.handle` and
`LAMBDA_TASK_ROOT` pointing at your code, the runtime imports `handler.js`
(`.mjs`/`.cjs` also resolved) and calls its exported `handle`:

```js
// handler.js
import { getCurrentContext } from '@thms-rmb/nodejs-aws-lambda';

export function handle(payload, context) {
  // context is a Context instance (also available via getCurrentContext()).
  return { echo: payload, requestId: context.awsRequestId };
}
```

The handler receives `(payload, context)` and may be `async`. Its return value
is JSON-encoded and posted as the response. Throwing reports an invocation
error and continues the loop.

### Streaming responses

Return a function to stream the response
([response streaming](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html)):

```js
export function handle(payload, context) {
  return async (responder) => {
    const writer = responder('application/json');
    writer.write('{"foo":');
    writer.write('"bar"}');
    writer.close();
  };
}
```

## The `bootstrap` entry point

`bin/bootstrap` is the executable Lambda invokes. It starts the event loop and
reads the handler from `_HANDLER` (or its first CLI argument). Programmatically:

```js
import { bootstrap, Bootstrap } from '@thms-rmb/nodejs-aws-lambda';

await bootstrap('handler.handle');            // convenience
// or, for full control:
await new Bootstrap({ handler: 'handler.handle' }).handleEvents();
```

## Context

`Context` exposes the per-invocation fields from the Runtime API headers
(`awsRequestId`, `invokedFunctionArn`, `traceId`, `tenantId`, `deadlineMs`),
`getRemainingTimeInMillis()`, and environment-backed accessors (`functionName`,
`functionVersion`, `memoryLimitInMb`, `logGroupName`, `logStreamName`).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `_HANDLER` | `file.function` of the handler. |
| `AWS_LAMBDA_RUNTIME_API` | `host:port` of the Runtime API. |
| `LAMBDA_TASK_ROOT` | Directory containing the handler file. |
| `AWS_LAMBDA_MAX_CONCURRENCY` | Optional; number of concurrent invocation loops (values > 1 have [gotchas](#concurrency-and-its-gotchas)). |
| `_X_AMZN_TRACE_ID` | Set by the runtime per invocation from the trace header. |

## Testing

```sh
npm test        # node --test over test/*.test.js — zero dependencies
```

## Notable differences from the Perl original

- **Async throughout.** `node:http` is non-blocking, so `handleEvent`,
  `lambdaNext`, etc. are `async`; handlers may be `async`.
- **Concurrency.** `AWS_LAMBDA_MAX_CONCURRENCY > 0` runs N concurrent async
  invocation loops (stopped by `SIGTERM`/`SIGHUP`) instead of Perl's
  `Parallel::Prefork`. This changes the isolation guarantees — see
  [Concurrency and its gotchas](#concurrency-and-its-gotchas) below.
- **Streaming.** `ResponseWriter` uses `node:http` chunked encoding and native
  trailers rather than hand-framing chunks.

## Concurrency and its gotchas

By default (`AWS_LAMBDA_MAX_CONCURRENCY` unset or `0`) the runtime handles **one
invocation at a time** — this is classic Lambda behavior and has **no gotchas**;
everything below applies only when you set concurrency above 1.

Setting `AWS_LAMBDA_MAX_CONCURRENCY > 1` (used by
[Lambda Managed Instances](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-custom.html))
runs that many concurrent invocation loops. **The Perl original forks a separate
OS process per worker, so every invocation gets its own memory, environment, and
current context for free.** This port instead runs concurrent `async` loops in a
**single process and thread**, so that per-process isolation does not exist.

What that means in practice:

| Behavior | Concurrency > 1 |
|----------|-----------------|
| Fetching, invoking, and responding to N invocations in parallel | ✅ works |
| Response routing — each result posted to the correct request ID | ✅ works (payload and `context` are passed as **arguments**) |
| Reading the `context` **argument** inside your handler | ✅ always correct |
| `getCurrentContext()` after your handler `await`s | ⚠️ may return another concurrent invocation's context |
| `process.env._X_AMZN_TRACE_ID` after your handler `await`s | ⚠️ may hold another concurrent invocation's trace id |

The reason: `getCurrentContext()` and `_X_AMZN_TRACE_ID` are **process-global
ambient state**. They are set correctly just before your handler runs, but once
an `async` handler yields at an `await`, another worker can run and overwrite
them. Synchronous handlers (and any code that reads these before its first
`await`) are unaffected.

**Guidance when running with concurrency > 1:**

- Use the `context` **argument** your handler receives, not `getCurrentContext()`.
- Don't rely on `_X_AMZN_TRACE_ID` being pinned to your invocation across
  `await`s. (`process.env` is inherently process-wide; there is no per-async
  environment, which is also why the AWS X-Ray SDK propagates trace context
  itself rather than trusting that variable alone.)

If you need a correct per-invocation `getCurrentContext()` under concurrency,
`node:async_hooks`' `AsyncLocalStorage` is the zero-dependency way to add it.

## Releasing

**Versioning policy.** The `major.minor.patch` numbers mirror the upstream Perl
[`AWS::Lambda`](https://metacpan.org/dist/AWS-Lambda) release this port tracks
(currently `0.9.0`). Changes that are specific to this port and do **not**
correspond to a new upstream release are published as **prereleases toward the
next patch** — e.g. after `0.9.0`, port tweaks ship as `0.9.1-1`, `0.9.1-2`, …
(a prerelease sorts *before* `0.9.1`, so it correctly reads as "on the way to
the next version"). A clean `X.Y.Z` with no prerelease suffix is reserved for a
release that faithfully matches upstream `X.Y.Z`.

The publish workflow maps this to npm [dist-tags](https://docs.npmjs.com/cli/v10/commands/npm-dist-tag)
automatically: a prerelease version (one containing a `-`) is published under
`next`; a clean version is published under `latest`.

**Cutting a release.** Version tags drive publishing — the
[`publish` workflow](.github/workflows/publish.yml) runs on any `v*` tag push:

```sh
npm version 0.9.1-1 --no-git-tag-version   # or edit package.json by hand
git commit -am "Release 0.9.1-1"
git tag v0.9.1-1
git push && git push --tag
```

The workflow verifies the tag matches `package.json`, runs the tests, and
publishes. It uses npm **trusted publishing (OIDC)** — there is no `NPM_TOKEN`
secret, and [provenance](https://docs.npmjs.com/generating-provenance-statements)
is attached automatically.

**One-time trusted-publishing setup** (on [npmjs.com](https://www.npmjs.com)):
because the trusted-publisher setting lives under an existing package's
settings, publish once manually to create the package —
`npm publish` locally (this reads `publishConfig.access: public`) — then in the
package's **Settings → Trusted Publisher** add a GitHub Actions publisher with
repository `thms-rmb/nodejs-aws-lambda` and workflow filename `publish.yml`.
Every subsequent release then flows through the tag-push workflow with no token.

## License

MIT (matching the upstream Perl distribution by ICHINOSE Shogo).
