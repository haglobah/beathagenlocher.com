import Ol from './OuterLink.astro'
import Il from './InnerLink.astro'
import I from './InnerAutoLink.astro'
import InnerLinkEmpty from './InnerLinkEmpty.astro'
import Par from './Par.astro'
import Heading from './Heading.astro'
import Heading2 from './Heading2.astro'
import Heading3 from './Heading3.astro'
import List from './List.astro'
import OrderedList from './OrderedList.astro'
import ListItem from './ListItem.astro'
import ListMarker from './ListMarker.astro'
import CodeSideEffect from './CodeSideEffect.astro' // Produces a side effect: Adds the <code></code> styling.
import BlockQuote from './BlockQuote.astro'
import References from './References.astro'
import ReferenceLink from './ReferenceLink.astro'
import Draft from './Draft.astro'
import OrbitArea from './OrbitArea.astro'
import OrbitPrompt from './OrbitPrompt.astro'
import Callout from './Callout.astro'
import Spoiler from './Spoiler.astro'

export const components = {
  I,
  Il,
  ListMarker,
  References,
  ReferenceLink,
  Draft,
  OrbitArea,
  OrbitPrompt,
  Callout,
  Spoiler,

  a: Ol,
  innerlink: Il,
  innerlinkempty: InnerLinkEmpty,
  h1: Heading,
  h2: Heading2,
  h3: Heading3,
  ul: List,
  ol: OrderedList,
  li: ListItem,
  blockquote: BlockQuote,
  p: Par,
}
