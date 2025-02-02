import {
  defineConfig,
  presetWind,
  presetWebFonts,
  presetIcons,
 } from 'unocss'

export default defineConfig({
  cli: {
    entry: [
      {
        patterns: [
          '**/*.html', '*.html',
          '**/*.md', '*.md',
          '**/*.mdx', '*.mdx',
          '**/*.astro', '*.astro',
        ],
        outFile: 'public/uno.css'
      }
    ], // CliEntryItem | CliEntryItem[]
  },
  shortcuts: [],
  theme: {
    colors: {
      'space-cadet': '#282D3F',
      cornflower: {
        light: '#97b6f0',
        DEFAULT: '#6E98E8',
      },
      sienna: {
        light: '#ecb1a2',
        DEFAULT: '#DC755C',
      },
    },
  },
  extendTheme: (theme) => {
    return {
      ...theme,
      breakpoints: {
        xs: '520px',
        ...theme.breakpoints
      }
    }
  },
  presets: [
    presetIcons(),
    presetWebFonts({
      provider: 'google',
      fonts: {
        sans: 'Fira Sans:100,200,300,400,500,600,700,800,900:italic',
        inter: 'Inter:100,200,300,400,500,600,700,800,900:italic',
        noto: 'Noto Serif:100,200,300,400,500,600,700,800,900:italic',
        mono: 'Fira Code:100,200,300,400,500,600,700,800,900:italic',
        serif: 'IBM Plex Serif:100,200,300,400,500,600,700,800,900:italic'
      },
    },
  ),
    presetWind(),
  ],
  // ...
})
