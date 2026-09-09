// @ts-check
import { defineConfig } from 'astro/config'
import { visualizer } from 'rollup-plugin-visualizer'
import UnoCSS from 'unocss/astro'
import mdx from '@astrojs/mdx'
import { unified } from '@astrojs/markdown-remark'
import solidJs from '@astrojs/solid-js'
import wikiLinkPlugin from './src/plugins/portal-wiki-link'
import { getPermalinks } from './src/plugins/portal-wiki-link'
import { getContentAliases } from './src/plugins/aliases'
import { slug } from 'github-slugger'
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers'

import sitemap from '@astrojs/sitemap'

import expressiveCode from 'astro-expressive-code'

// Old slugs of renamed content; they get redirect stub pages, so wiki links
// pointing at old names still resolve, but the stubs stay out of the sitemap.
const aliasSlugs = getContentAliases('src/content/')
const aliasUrls = new Set(
  aliasSlugs.map((el) => `https://beathagenlocher.com/${el}/`),
)

const permalinks = getPermalinks('src/content/')
  .map((el) => {
    let contentTitle = el.split('/').pop()
    return contentTitle
  })
  .filter((el) => el)
  .map((el) => slug(el))
  .concat(aliasSlugs)

// https://astro.build/config
export default defineConfig({
  devToolbar: { enabled: false },
  site: 'https://beathagenlocher.com',
  // `just dev` derives PORT per checkout (portless, see the Justfile). A busy port
  // must fail, not silently move: other servers are told this exact port.
  server: { port: Number(process.env.PORT ?? 4321) },
  vite: {
    server: { strictPort: true },
    plugins: [
      visualizer({
        emitFile: true,
        filename: 'stats.html',
      }),
    ],
  },
  // Astro 7 defaults to the `satteri` processor, which does not run remark
  // plugins. The wiki link plugin needs the unified pipeline; MDX inherits it.
  markdown: {
    processor: unified({
      remarkPlugins: [
        [
          wikiLinkPlugin,
          {
            pathFormat: 'obsidian-short',
            permalinks: permalinks,
            wikiLinkResolver: function (theslug: string) {
              return [theslug]
            },
            pageResolver: function (theslug: string) {
              return [theslug]
            },
            hrefTemplate: function (permalink: string) {
              return slug(permalink)
            },
          },
        ],
      ],
    }),
    shikiConfig: {
      theme: 'catppuccin-latte',
      wrap: true,
    },
  },
  integrations: [
    solidJs(),
    UnoCSS(),
    sitemap({
      filter: (page) => !aliasUrls.has(page),
    }),
    expressiveCode({
      themes: ['catppuccin-mocha'],
      plugins: [pluginLineNumbers()],
      defaultProps: {
        showLineNumbers: false,
      },
    }),
    mdx(),
  ],
})
