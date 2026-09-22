import type { ExpressiveCodePlugin } from '@expressive-code/core'
import { visit } from 'unist-util-visit'

// Code blocks only permit phrasing content. Keep Expressive Code's classes and
// layout while replacing its line/gutter divs with valid inline elements.
export function validCodeMarkup(): ExpressiveCodePlugin {
  return {
    name: 'valid-code-markup',
    baseStyles: ({ cssVar }) => `
      .copy button > span {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: ${cssVar('frames.inlineButtonBackground')};
        opacity: ${cssVar('frames.inlineButtonBackgroundIdleOpacity')};
        transition: inherit;
      }
      .copy button:hover > span, .copy button:focus-visible > span {
        opacity: ${cssVar('frames.inlineButtonBackgroundHoverOrFocusOpacity')};
      }
      .copy button:active > span {
        opacity: ${cssVar('frames.inlineButtonBackgroundActiveOpacity')};
      }
    `,
    hooks: {
      postprocessRenderedBlockGroup: ({ renderData }) => {
        visit(renderData.groupAst, 'element', (node) => {
          if (node.tagName !== 'button') return
          visit(node, 'element', (child) => {
            if (child.tagName === 'div') child.tagName = 'span'
          })
        })
      },
      postprocessRenderedLine: ({ renderData }) => {
        visit(renderData.lineAst, 'element', (node) => {
          if (node.tagName === 'div') node.tagName = 'span'
        })
      },
    },
  }
}
