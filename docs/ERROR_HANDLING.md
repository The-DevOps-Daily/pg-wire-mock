# Error handling and enhanced error responses

This document describes pg-wire-mock's enhanced PostgreSQL-compliant error handling. It explains the runtime behavior, public API, examples, testing, configuration, and troubleshooting guidance.

## Overview

pg-wire-mock now produces structured, PostgreSQL-wire-protocol-compliant error responses. The implementation adds a small, easy-to-use API for building rich Postgres-style errors (including severity, SQLSTATE, message, detail, hint, position, context, and optional debug fields). The goal is to make errors useful for client debugging while remaining backward-compatible for clients that only read the message and code.

Key features:

- Full support for PostgreSQL wire `ErrorResponse` fields (S, C, M, D, H, P, p, q, W, s, t, c, d, n, F, L, R)
- Centralized `ERROR_CODES` and `ERROR_MESSAGES` in `src/protocol/constants.js`
- `PostgresError` class that preserves wire fields
- `ErrorFactory` convenience helpers for common error types
- Development-mode enhancements: file/line/routine and stack traces for faster debugging
- Unit tests and examples to make adoption straightforward

## Files and components

- `src/utils/errorHandler.js` — Core implementation and API exports: `PostgresError`, `ErrorFactory`, `wrapError`, `formatErrorForLogging`, `isDevelopmentMode`.
- `src/protocol/constants.js` — Central constants: `ERROR_CODES`, `ERROR_MESSAGES`, `ERROR_SEVERITY`, and `MESSAGE_TYPES`.
- `src/handlers/queryHandlers.js` — Example usage: handlers now throw `PostgresError` from `ErrorFactory` so the message layer can serialize them into wire `ErrorResponse` messages.
- `__tests__/errorHandler.test.js` — Unit tests that cover creation, wrapping, logging formatting, and development-mode behavior.

## PostgresError: supported fields

`PostgresError` models the fields used by PostgreSQL's wire `ErrorResponse`. The single-letter field names are used when the message builder serializes the response.

- `S` — Severity (e.g. `ERROR`, `NOTICE`, `FATAL`)
- `C` — SQLSTATE code (5-character string, see `ERROR_CODES`)
- `M` — Primary human-readable message
- `D` — Detail (optional)
- `H` — Hint (optional)
- `P` — Position (optional) — character position in query where the error occurred
- `p` — Internal position (optional)
- `q` — Query (optional) — original query text being processed
- `W` — Where (optional) — context (function, stack frame)
- `s` — Schema name (optional)
- `t` — Table name (optional)
- `c` — Column name (optional)
- `d` — Data type name (optional)
- `n` — Constraint name (optional)
- `F` — File (optional, development mode) — source file where error originated
- `L` — Line (optional, development mode) — source line where error originated
- `R` — Routine (optional, development mode) — function/routine name

Create an instance by passing an object with any of the fields above. The message builder will include present fields in the wire `ErrorResponse`.

Example:

```js
const { PostgresError } = require('../src/utils/errorHandler');
const { ERROR_CODES } = require('../src/protocol/constants');

throw new PostgresError({
  S: 'ERROR',
  C: ERROR_CODES.SYNTAX_ERROR,
  M: 'Unterminated string',
  H: 'Close all single quotes or use escape sequences',
  P: 16,
  q: "SELECT 'unterminated",
});
```

## ErrorFactory (convenience helpers)

`ErrorFactory` provides a set of small functions to build common Postgres errors. Each helper returns a `PostgresError` instance.

Common helpers include:

- `emptyQuery()`
- `unterminatedString({ q, P })`
- `unterminatedIdentifier({ q, P })`
- `invalidArrayFormat({ q })`
- `syntaxError(message, context)`
- `undefinedColumn(columnName)`

Usage inside a handler:

```js
const { ErrorFactory } = require('../src/utils/errorHandler');

function validateQuery(query) {
  if (!query || query.trim() === '') {
    throw ErrorFactory.emptyQuery({ q: query });
  }
}
```

Custom fields may be added to provide extra context (`P`, `q`, `W`, `s`, `t`, `c`, etc.).

## How errors become wire responses

1. Handler throws a `PostgresError` (or any error wrapped via `wrapError`).
2. Message processing layer detects `PostgresError` and uses `src/protocol/messageBuilders.js` to serialize fields into a wire `ErrorResponse` (backend message type `E`).
3. Client receives a structured error with fields accessible via the wire protocol.

The `formatErrorForLogging()` helper returns a cleaned object suitable for structured logs and includes stack trace information in development mode.

## Development mode and debugging

Enable development-mode behavior to get richer debug fields and stack traces.

Set either:

```bash
NODE_ENV=development node server.js
# or
PG_MOCK_LOG_LEVEL=debug node server.js
```

In development mode the error handling utilities may populate `F`, `L`, `R` and include a captured stack trace in the logs (not sent over the wire unless configured).

## API reference

Exports from `src/utils/errorHandler.js`:

- `class PostgresError` — constructor accepts an object with wire fields.
- `const ErrorFactory` — object with convenience builder methods.
- `function wrapError(err, context)` — preserves original error and augments with Postgres fields.
- `function formatErrorForLogging(err)` — returns a plain object with message, code, severity and optional stack trace.
- `function isDevelopmentMode()` — returns boolean indicating dev-mode.

Wire constants used in error creation:

- `ERROR_CODES` — SQLSTATE codes in `src/protocol/constants.js`
- `ERROR_MESSAGES` — standard message templates used by `ErrorFactory`
- `ERROR_SEVERITY` — standard severities (ERROR, FATAL, NOTICE)

## Examples and common cases

- Empty query

```js
throw ErrorFactory.emptyQuery({ q: '' });
```

- Unterminated string with position

```js
throw ErrorFactory.unterminatedString({ q: "SELECT 'x", P: 8 });
```

- Invalid array format

```js
throw ErrorFactory.invalidArrayFormat({ q: "SELECT '{1,2'::int4[]" });
```

## Testing

- Unit tests: `__tests__/errorHandler.test.js` — covers factory methods, wrapping, and logging formatting.
- Run full test suite:

```bash
npm test
```

- Run only error tests:

```bash
npm test -- __tests__/errorHandler.test.js
```

All tests passed at the time this document was authored.

## Troubleshooting

Common issues and resolutions:

- "Error fields missing in response" — ensure handler throws `PostgresError` (not a plain `Error`) or that `wrapError()` is used to convert errors before reaching message builder.
- "No position in syntax errors" — pass `P` (position) to the factory when parsing fails.
- "Too verbose logs in production" — set `NODE_ENV=production` or `PG_MOCK_LOG_LEVEL=info` to disable stack traces.

## Migration notes

- Existing handlers that threw plain `Error` objects will continue to work, but to get structured wire fields they must throw `PostgresError` or be wrapped.
- Centralize messages in `ERROR_MESSAGES` to keep wording consistent across handlers.
