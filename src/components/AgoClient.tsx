import { createEffect, createSignal, onCleanup } from 'solid-js'
import TimeAgo, { type FormatStyleName } from 'javascript-time-ago'
import en from 'javascript-time-ago/locale/en'

TimeAgo.setDefaultLocale(en.locale)
TimeAgo.addLocale(en)

interface AgoClientProps {
  when: Date | number
  format?: FormatStyleName
}

export default function AgoClient(props: AgoClientProps) {
  const [ago, setAgo] = createSignal<string | null>(null)

  const timeAgo = new TimeAgo('en-US')
  const updateAgo = () => setAgo(timeAgo.format(props.when, props.format))

  createEffect(() => {
    updateAgo()
    const interval = setInterval(updateAgo, 1000)
    onCleanup(() => clearInterval(interval))
  })

  return <span class="font-mono f-text-xs tabular-nums whitespace-nowrap text-cornflower">{ago()}</span>
}
