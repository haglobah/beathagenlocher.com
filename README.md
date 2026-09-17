# beathagenlocher.com

Welcome to my digital gardens' repository!

Built with—well, just take a look here: https://beathagenlocher.com/me#colophon

| Command                   | Action                                              |
| :------------------------ | :-------------------------------------------------- |
| `npm install`             | Installs dependencies                               |
| `just dev`                | Starts Astro and both Bun servers, see `just ports` |
| `just proxy`              | Serves `http://beathagenlocher.com.localhost`       |
| `npm run dev`             | Starts local dev server at `localhost:4321`         |
| `npm run build`           | Build your production site to `./dist/`             |
| `npm run preview`         | Preview your build locally, before deploying        |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check`    |
| `npm run astro -- --help` | Get help using the Astro CLI                        |

Run `npm run check`, `npm test` (requires Bun), and `npm run build` before submitting changes. The checks cover Astro and TypeScript diagnostics; tests cover the pure state transitions, parsers, and browser boundaries.

## Local URLs

`just dev` derives the ports for Astro and the two Bun servers from the checkout's name with [portless](https://github.com/haglobah/portless) (in the dev shell), so several worktrees run at the same time without conflicts. A checkout gets one block of three consecutive ports; if the block is busy the next free one is used. Ports are bound strictly: a busy port fails instead of moving.

Names come from portless's small reverse proxy, which this project runs on port 8099. It maps `<name>.localhost` to the port that a running server registered as a file in `~/.local/state/portless/routes`. Browsers resolve every name below `.localhost` to loopback by themselves, so no DNS, hosts file, or port 80 permission is needed. `just ports` prints the names:

| Name                                                 | Server         |
| ---------------------------------------------------- | -------------- |
| `http://beathagenlocher.com.localhost:8099`          | Astro          |
| `http://bsky.beathagenlocher.com.localhost:8099`     | Bluesky server |
| `http://comments.beathagenlocher.com.localhost:8099` | Comment server |

A linked worktree gets its branch as prefix, for example `http://fix-header.beathagenlocher.com.localhost:8099`, and different ports, so worktrees run side by side behind the same proxy.

The proxy's lifetime follows the servers. The first server that starts brings it up, detached, and it exits by itself a few seconds after the last server stops. Its log is `~/.local/state/portless/proxy-8099.log`. A 404 from the proxy lists the registered names; a 502 means a server registered its name but is not answering, which happens after a hard kill. Starting the server again replaces the stale entry. `just proxy` runs the proxy in the foreground for debugging. Another project can use portless with its own port.

## Automatic content dates and stream announcements

Astro derives `updated` for notes and essays from Git whenever `npm run dev`, `npm run check`, or `npm run build` starts. Layouts, sorting, and other collection consumers receive the effective date. There is no manual generation step and no file is rewritten. `npm run track-updates` (requires Bun) prints the derived dates and announcements for inspection.

Existing frontmatter dates and `src/data/content-updates.json` form the migration baseline, pinned by `src/data/content-history-baseline.json`. Keep this baseline fixed. Later meaningful committed changes use the commit's committer date. Git's first-parent history makes a merged change take effect when its merge lands. Full Git history is required; shallow checkouts fail with an instruction to fetch it. Deployment fetches full history automatically.

A note or essay's first publication adds a “New” entry to the stream. Later published changes add an “Updated” entry. Announcements are grouped into one entry per document per UTC day; first publication takes precedence that day. Deleted and unpublished content is excluded, including historical announcements. Existing announcements retain their dates; links and titles follow the current Astro entries.

Formatting-only changes, pure renames, and edits solely to the `updated` field do not advance the date or create announcements. Formatting detection normalizes MDX with Prettier; fenced code remains significant. To update a date without announcing an edit, add a Git commit trailer after a blank line:

```text
Fix a small typo

Stream: quiet
```

The trailer applies to all updated notes and essays in that commit. First publications are still announced. Draft edits update the date but produce no announcement.

Uncommitted edits do not advance committed dates or create announcements. New uncommitted documents use their frontmatter `updated`, falling back to `startDate`, so `updated` can be omitted. Restart the dev server after committing to refresh its history snapshot. RSS remains unchanged; automatic announcements appear in the website's stream only.
