import { getHighlighter } from 'shiki';
import { visit } from 'unist-util-visit';

export default function rehypeShikiWithLineNumbers() {
  return async (tree) => {
    const { getHighlighter } = await import('shiki')

    const highlighter = await getHighlighter({
      theme: 'github-dark',
    })
    visit(tree, 'element', (node) => {
      if (node.tagName === 'pre' && node.children[0]?.tagName === 'code') {
        const codeNode = node.children[0];
        const codeContent = codeNode.children[0].value;
        const lang = codeNode.properties.className?.[0]?.replace('language-', '') || 'txt';

        const html = highlighter.codeToHtml(codeContent, { lang });

        // Add line wrapper divs with line numbers
        const lines = html
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map(
            (line, i) =>
              `<div class="line"><span class="line-number">${i + 1}</span>${line}</div>`
          )
          .join('\n');

        node.type = 'raw';
        node.value = `<pre class="shiki with-line-numbers">${lines}</pre>`;
        delete node.children;
      }
    });
  };
}

