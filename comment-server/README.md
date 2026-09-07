# comment-server

Paragraph-level comment server for [beathagenlocher.com](https://beathagenlocher.com). Accepts a comment payload, validates it, and emails it via [Resend](https://resend.com).

Built with [Hono](https://hono.dev) on [Bun](https://bun.sh), deployable to [Cloudflare Workers](https://workers.cloudflare.com) via Wrangler.

## Architecture

The HTTP boundary (`app.ts`) parses unknown JSON into a `CommentPayload` before entering the pure delivery core (`core.ts`). Validation is a pure function. The only command sends email; its result becomes a terminal success or failure. `createApp` accepts the email sender and clock so route tests need no credentials or network.

```
POST /comment
  → parseComment : unknown → payload or input error (400)
  → init         : payload → (sending_email, send_email)
  → execute      : send email → email_sent or failed
  → update       : terminal model → JSON response (200 or 502)
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
- `pageUrl`, `paragraphId`, `paragraphText`, and `comment` must be strings
- `pageUrl` starts with `https://beathagenlocher.com/` or `http://localhost:` (development)
- `paragraphId` matches `^p-[a-f0-9]{8}$`
- `email` optional; if present, must be an empty string or look like an email

**Responses**

- `200` — `{ success: true, message }`
- `400` — `{ success: false, message }` (malformed JSON or invalid payload)
- `502` — `{ success: false, message }` (email delivery failure; provider details are private)
- `429` — rate limited (5 requests / minute / IP, in-memory sliding window)

The rate limit is best-effort within each process or Worker isolate; it is not shared across instances.

CORS is restricted to `https://beathagenlocher.com` and development origins: `localhost` or any name below `.localhost`, on any port. `PORT` selects the listening port (default 3007); `just dev` sets it.

## Configuration

`.env`:

```sh
COMMENT_FROM=comments@yourdomain
COMMENT_RECIPIENT=you@yourdomain
RESEND_API_KEY=re_...
```

Startup checks these three values and names any missing variable without printing its value. In Workers, configure secrets through Wrangler; the existing `nodejs_compat` flag and compatibility date support reading them through `process.env`.

## Commands

```sh
bun install          # install deps
bun run dev          # hot-reload server on :3007
bun test             # pure core and HTTP boundary tests
bun run deploy       # wrangler deploy --minify
```

## Files

- `core.ts` — types, parser, `init` / `update`, email builders
- `core.test.ts` — unit tests for the pure core
- `app.ts` / `app.test.ts` — Hono boundary, CORS, rate limiting, delivery and route tests
- `config.ts` — startup environment check
- `index.ts` — Resend adapter and Bun/Workers entrypoint
- `wrangler.jsonc` — Cloudflare Workers config
