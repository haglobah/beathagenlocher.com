// @ts-check
import { defineConfig } from 'astro/config';
import UnoCSS from 'unocss/astro';
import mdx from '@astrojs/mdx';
import wikiLinkPlugin from './src/plugins/portal-wiki-link';
import { getPermalinks } from './src/plugins/portal-wiki-link';
import { slug } from 'github-slugger'

import sitemap from '@astrojs/sitemap';

const permalinks = (await getPermalinks("src/content/"))
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
    mdx({
      remarkPlugins: [
        [wikiLinkPlugin, {
          pathFormat: 'obsidian-short',
          permalinks: permalinks,
          wikiLinkResolver: function(theslug) {
            return [theslug];
          },
          pageResolver: function(theslug) {
            return [theslug];
          },
          hrefTemplate: function(permalink) {
            return slug(permalink);
          },
        }],
      ],
      syntaxHighlight: 'shiki',
      shikiConfig: {
        theme: "catppuccin-mocha",
        wrap: true,
        transformers: [
          {
            preprocess(code) {
              console.log(code)
              console.log(code.options)
              if (code.endsWith('\n')) {
                code = code.slice(0, -1)
              }

              return code
            },
          }],
      }
    })]
})
