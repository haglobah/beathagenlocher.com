// @ts-check
import { defineConfig } from 'astro/config';
import UnoCSS from 'unocss/astro';
import mdx from '@astrojs/mdx';
import remarkObsidian from 'remark-obsidian';

// https://astro.build/config
export default defineConfig({
  site: 'https://beathagenlocher.com',
  integrations: [
    UnoCSS(),
    mdx({
      remarkPlugins: [remarkObsidian]
    }),
  ],
})
