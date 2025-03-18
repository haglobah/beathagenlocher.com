// @ts-check
import { defineConfig } from 'astro/config';
import UnoCSS from 'unocss/astro';
import mdx from '@astrojs/mdx';
import wikiLinkPlugin from '@portaljs/remark-wiki-link';
import { getPermalinks } from '@portaljs/remark-wiki-link';

import GitHubSlugger from 'github-slugger'

const slugger = new GitHubSlugger()

const permalinks = (await getPermalinks("src/content/"))
      .map((el) => {
        let contentTitle = el.split("/")[1]
        return contentTitle;
      })
      .filter((el) => el)
      .map(el => slugger.slug(el));

// https://astro.build/config
export default defineConfig({
  site: 'https://beathagenlocher.com',
  integrations: [UnoCSS(),
    mdx({
      remarkPlugins: [
        [wikiLinkPlugin, {
          pathFormat: 'obsidian-short',
          permalinks: permalinks,
          wikiLinkResolver: function(slug) {
            return [slug];
          },
          pageResolver: function(slug) {
            return [slug];
          },
          hrefTemplate: function(permalink) {
            return slugger.slug(permalink);
          },
        }],
      ]
    }
  )],
})
