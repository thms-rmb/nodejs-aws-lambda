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

## License

MIT (matching the upstream Perl distribution by ICHINOSE Shogo).
