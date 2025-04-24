import Ol from './components/OuterLink.astro';
import Il from './components/InnerLink.astro';
import I from './components/InnerAutoLink.astro';
import InnerLinkEmpty from './components/InnerLinkEmpty.astro';
import Par from './components/Par.astro';
import Heading from './components/Heading.astro';
import Heading2 from './components/Heading2.astro';
import Heading3 from './components/Heading3.astro';
import List from './components/List.astro';
import OrderedList from './components/OrderedList.astro';
import ListItem from './components/ListItem.astro';
import CodeBlock from './components/CodeBlock.astro';
import BlockQuote from './components/BlockQuote.astro';

export const components = {
    a: Ol,
    I,
    Il,
    innerlink: Il,
    innerlinkempty: InnerLinkEmpty,
    h1: Heading,
    h2: Heading2,
    h3: Heading3,
    ul: List,
    ol: OrderedList,
    li: ListItem,
    pre: CodeBlock,
    blockquote: BlockQuote,
    p: Par
}
