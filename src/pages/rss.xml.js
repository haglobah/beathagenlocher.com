import rss, { pagesGlobToRssItems } from '@astrojs/rss';

export async function GET(context) {
  return rss({
    title: 'Astro Learner | Blog',
    description: 'My journey learning Astro',
    site: context.site,
    items: await pagesGlobToRssItems(
      import.meta.glob([
        '../content/notes/**/*.mdx',
        '../content/essays/**/*.mdx',
        '../content/talks/**/*.mdx',
        '../content/knowledge/**/*.mdx',
      ])
    ),
    customData: `<language>en-us</language>`,
  });
}
