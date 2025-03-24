import {
  defineConfig,
  transformerDirectives,
  presetWind,
  presetWebFonts,
  presetIcons,
 } from 'unocss'
import { presetFluid } from 'unocss-preset-fluid'

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
  transformers: [transformerDirectives()],
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
    }),
    presetWind(),
    presetFluid({
      maxWidth: 1440,
      minWidth: 320,
      extendMaxWidth: null,
      extendMinWidth: null,
      remBase: 4,
      useRemByDefault: false,
      ranges: {
        // Got by doing {320px, 4.5px, 1.125}, {1440px, 5.5px, 1.414} on https://utopia.fyi
        '4xl': [9.12, 43.96],
        '3xl': [8.11, 31.09],
        '2xl': [7.21, 21.9875],
        xl: [6.41, 15.55],
        lg: [5.70, 10.9975],
        md: [5.06, 7.7775],
        sm: [4.5, 5.5],
        xs: [3.75, 3.89],
        '2xs': [3.125, 2.75],
      },
      commentHelpers: false,
    }),
  ],
  // ...
})
