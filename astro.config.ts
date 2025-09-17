// @ts-check
import { defineConfig } from 'astro/config';
import UnoCSS from 'unocss/astro';
import mdx from '@astrojs/mdx';
import wikiLinkPlugin from './src/plugins/portal-wiki-link';
import { getPermalinks } from './src/plugins/portal-wiki-link';
import { slug } from 'github-slugger'
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers'

import sitemap from '@astrojs/sitemap';

import expressiveCode from 'astro-expressive-code';

const permalinks = getPermalinks("src/content/")
      .map((el) => {
        let contentTitle = el.split("/")[1]
        return contentTitle;
      })
      .filter((el) => el)
      .map(el => slug(el));

// https://astro.build/config
export default defineConfig({
  site: 'https://beathagenlocher.com',
  integrations: [
    UnoCSS(),
    sitemap(),
    expressiveCode({
      themes: ['catppuccin-mocha'],
      plugins: [pluginLineNumbers()],
      defaultProps: {
        showLineNumbers: false
      }
    }),
    mdx({
      remarkPlugins: [
        [wikiLinkPlugin, {
          pathFormat: 'obsidian-short',
          permalinks: permalinks,
          wikiLinkResolver: function(theslug: string) {
            return [theslug];
          },
          pageResolver: function(theslug: string) {
            return [theslug];
          },
          hrefTemplate: function(permalink: string) {
            return slug(permalink);
          },
        }],
      ],
      shikiConfig: {
        theme: "catppuccin-latte",
        wrap: true,
      }
    })
  ]
})
