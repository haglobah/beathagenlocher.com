// @ts-check
import { defineConfig } from 'astro/config'
import { visualizer } from 'rollup-plugin-visualizer'
import UnoCSS from 'unocss/astro'
import mdx from '@astrojs/mdx'
import solidJs from '@astrojs/solid-js'
import wikiLinkPlugin from './src/plugins/portal-wiki-link'
import { getPermalinks } from './src/plugins/portal-wiki-link'
import { slug } from 'github-slugger'
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers'

import sitemap from '@astrojs/sitemap'

import expressiveCode from 'astro-expressive-code'

const permalinks = getPermalinks('src/content/')
  .map((el) => {
    let contentTitle = el.split('/')[1]
    return contentTitle
  })
  .filter((el) => el)
  .map((el) => slug(el))

// https://astro.build/config
export default defineConfig({
  devToolbar: { enabled: false },
  site: 'https://beathagenlocher.com',
  vite: {
    plugins: [
      visualizer({
        emitFile: true,
        filename: 'stats.html',
      }),
    ],
  },
  integrations: [
    solidJs(),
    UnoCSS(),
    sitemap(),
    expressiveCode({
      themes: ['catppuccin-mocha'],
      plugins: [pluginLineNumbers()],
      defaultProps: {
        showLineNumbers: false,
      },
    }),
    mdx({
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
      shikiConfig: {
        theme: 'catppuccin-latte',
        wrap: true,
      },
    }),
  ],
})
