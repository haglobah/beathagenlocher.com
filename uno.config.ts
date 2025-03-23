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
        '2xs': [3.125, 2.75],
        xs: [3.75, 3.89],
        sm: [4.5, 5.5],
        md: [5.4, 7.7775],
        lg: [6.48, 10.9975],
        xl: [7.775, 15.55],
        '2xl': [9.33, 21.9875],
        '3xl': [11.1975, 31.09],
        '4xl': [11.1975, 31.09],
      },
      commentHelpers: false,
    }),
  ],
  // ...
})
