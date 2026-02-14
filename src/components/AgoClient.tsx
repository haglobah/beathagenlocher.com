import { createEffect, createSignal } from 'solid-js'
import TimeAgo from 'javascript-time-ago'
import en from 'javascript-time-ago/locale/en'

TimeAgo.setDefaultLocale(en.locale)
TimeAgo.addLocale(en)

interface AgoClientProps {
  when: Date | number
  format?: string
}

export default function AgoClient(props: AgoClientProps) {
  const [ago, setAgo] = createSignal<string | null>(null)

  const updateAgo = () => {
    if (props.when) {
      const timeAgo = new TimeAgo('en-US')
      setAgo(timeAgo.format(props.when, props.format))
    }
  }

  createEffect(() => {
    updateAgo()
    const interval = setInterval(updateAgo, 1000)
    return () => clearInterval(interval)
  })

  return <span class="font-mono text-cornflower">{ago()}</span>
}
