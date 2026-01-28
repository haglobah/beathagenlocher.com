# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is Beat Hagenlocher's digital garden built with Astro 5, featuring a content-heavy site with essays, notes, knowledge base articles, talks, and a stream. The site implements wiki-style linking between content and uses MDX for rich content authoring.

## Development Commands

```bash
# Setup (first time)
npm clean-install

# Development server (runs both Astro and Bluesky post server in parallel)
just dev

# Development server (Astro only)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run Astro CLI commands
npm run astro -- [command]
```

The development server runs on `localhost:4321`.

## Project Architecture

### Content Collections System

The site is organized around Astro's content collections defined in `src/content/config.ts`:

- **notes** - Personal notes with growth stages (seedling/budding/evergreen)
- **essays** - Long-form articles with featured flags and cover images
- **knowledge** - Knowledge base articles about people, topics, and technologies
- **talks** - Conference talks with metadata about venues and dates
- **stream** - Short-form stream posts
- **quotes** - Quotes from JSON file

Each collection has specific schemas with fields like `title`, `startDate`, `updated`, `topics`, `growthStage`, and `publish` flags.

### Wiki-Style Linking

A custom remark plugin at `src/plugins/portal-wiki-link.js` implements Obsidian-style `[[wiki links]]` between content:

- Supports both regular links `[[target]]` and embeds `![[target]]`
- Allows aliases with pipe syntax `[[target|display text]]`
- Links to headings with hash syntax `[[page#heading]]`
- Image embedding with dimensions `![[image.png|400x300]]`
- Resolves permalinks by slugifying filenames and matching against all content
- Renders broken links with a `.new` class for styling
- Custom Astro components: `<innerlink>` for valid links, `<innerlinkempty>` for broken links

The `getPermalinks()` function scans `src/content/` to build a list of valid link targets.

### Styling & UI

- **UnoCSS** (configured in `uno.config.ts`) for utility-first CSS with:
  - Custom fluid typography system using `unocss-preset-fluid`
  - Custom color palette (space-cadet, cornflower, sienna)
  - Web fonts: Fira Sans, Inter, Noto Serif, Fira Code, IBM Plex Serif
  - Responsive breakpoints with custom `xs` at 520px
- **Astro components** for consistent UI elements (Badge, Button, Callout, etc.)
- **Solid.js** integration for interactive components
- **Expressive Code** for syntax highlighting with line numbers

### Routing & Pages

- **Dynamic routing** via `src/pages/[...slug].astro` handles all content collections
- Maps collection entries to URLs using their IDs
- Renders content through `PostLayout.astro` wrapper
- Custom MDX components defined in `src/components/mdxcomponents.ts`

### Search & Navigation

- **Command Palette** (CommandPalette.astro) provides quick navigation
- Search index generated at `src/pages/api/search-index.json.ts`
- Uses Fuse.js for fuzzy search capabilities
- Global keyboard shortcuts for command palette access

### Layout Structure

- **Layout.astro** - Base layout with SEO, analytics (Umami, PostHog), and footer
- **PostLayout.astro** - Content wrapper for articles with frontmatter display
- Reading progress bar component for long-form content

### Content Utilities

Key functions in `src/content/content.ts`:
- `sortByUpdated()`, `sortByStartDate()` - Sort content by dates
- `publishedNotes`, `draftNotes`, etc. - Pre-filtered collections
- `getTopics()` - Extract and count topics across collections

### Analytics & Tracking

The site includes:
- Umami (privacy-friendly analytics)
- PostHog (product analytics and session recording)
- Custom OG image generation at `/og/[...slug].png`

## Development Environment

Uses Nix flakes for reproducible development environment (defined in `flake.nix`):
- Node.js 24
- Bun runtime
- TypeScript language server
- Just command runner
- Playwright for testing

Activate with direnv or `nix develop`.

## Content Authoring

Content files are MDX in `src/content/[collection]/` with frontmatter:

```mdx
---
title: "My Title"
startDate: 2025-01-27
updated: 2025-01-27
topics: ["programming", "web"]
growthStage: "budding"
publish: true
---

Content with [[wiki links]] to other pages...
```

Use `publish: false` to keep content in draft state.

## Special Files

- **Justfile** - Task runner commands using Just
- **.envrc** - Direnv configuration for Nix shell
- **uno.config.ts** - UnoCSS configuration with custom design tokens
- **public/** - Static assets (CSS, CNAME for GitHub Pages)
- **bsky-post-server/** - Separate Bun server for Bluesky post handling

## Building & Deployment

The site builds to `dist/` and is deployed to `beathagenlocher.com` (indicated by `public/CNAME`). The build process:
1. Collects all content from collections
2. Generates static pages for each content entry
3. Creates search index JSON
4. Bundles assets and applies UnoCSS

## Important Notes

- Wiki links are resolved at build time by matching slugified titles
- Content must be explicitly published via `publish: true` in frontmatter
- Growth stages track content maturity: seedling → budding → evergreen
- The site supports both light and dark syntax themes (Catppuccin variants)
