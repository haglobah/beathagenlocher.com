# comment-server

Paragraph-level comment server for [beathagenlocher.com](https://beathagenlocher.com). Accepts a comment payload, validates it, and emails it via [Resend](https://resend.com).

Built with [Hono](https://hono.dev) on [Bun](https://bun.sh), deployable to [Cloudflare Workers](https://workers.cloudflare.com) via Wrangler.

## Architecture

The core (`core.ts`) is an Elm-style `Model` / `Msg` / `Cmd` loop with pure state transitions and validation. The runtime (`index.ts`) interprets `Cmd`s into effects (Resend API calls), dispatches the resulting `Msg`s back through `update`, and turns the terminal `Model` into an HTTP response.

```
POST /comment
  → init        : payload → (validating, validate_payload)
  → execute     : run validation / send email
  → update      : (model, msg) → (model', cmd')
  → respond     : terminal model → JSON response
```

## API

### `POST /comment`

```json
{
  "pageUrl": "https://beathagenlocher.com/some-page",
  "paragraphId": "p-1a2b3c4d",
  "paragraphText": "The paragraph being commented on.",
  "comment": "Reader's comment, up to 5000 chars.",
  "email": "optional@example.com"
}
```

**Validation**

- `comment` required, non-empty, ≤ 5000 chars
- `paragraphId` matches `^p-[a-f0-9]{8}$`
- `email` optional; if present, must look like an email

**Responses**

- `200` — `{ success: true, message }`
- `400` — `{ success: false, message }` (validation or send failure)
- `429` — rate limited (5 requests / minute / IP, in-memory sliding window)

CORS is restricted to `https://beathagenlocher.com` and `http://localhost:4321`.

## Configuration

`.env`:

```sh
COMMENT_FROM=comments@yourdomain
COMMENT_RECIPIENT=you@yourdomain
RESEND_API_KEY=re_...
```

## Commands

```sh
bun install          # install deps
bun run dev          # hot-reload server on :3007
bun test             # run core.test.ts
bun run deploy       # wrangler deploy --minify
```

## Files

- `core.ts` — types, validation, `init` / `update`, email builders
- `core.test.ts` — unit tests for the pure core
- `index.ts` — Hono app, CORS, rate limiting, effect interpreter
- `wrangler.jsonc` — Cloudflare Workers config
