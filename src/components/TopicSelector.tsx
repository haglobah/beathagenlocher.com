import { For, Show } from 'solid-js'

export interface TopicSelectorProps {
  filteredTopics: () => string[]
  selectedTopicIndex: () => number
  topicCounts: () => Map<string, number>
  onTopicSelect: (topic: string) => void
}

export default function TopicSelector(props: TopicSelectorProps) {
  return (
    <Show when={props.filteredTopics().length > 0} fallback={<div class="text-zinc-500 text-sm px-4 py-3">No topics found</div>}>
      <div id="topic-selector" class="rounded-t-lg bg-zinc-950">
        <div class="text-xs pt-4 px-4 text-zinc-500 uppercase mb-2">
          Select Topic (<span class="font-mono text-cornflower bg-zinc-900">TAB</span>,{' '}
          <span class="i-heroicons:arrow-up-20-solid text-cornflower inline-block size-[1.2em]"></span>
          ,{' '}
          <span class="i-heroicons:arrow-down-20-solid text-cornflower inline-block size-[1.2em]"></span>
          )
        </div>
        <div id="topic-selector-items" class="flex flex-wrap p-4 gap-2 max-h-32 overflow-y-auto">
          <For each={props.filteredTopics()}>
            {(topic, index) => {
              const isSelected = () => index() === props.selectedTopicIndex()
              const count = () => props.topicCounts().get(topic) || 0

              return (
                <div
                  class="f-text-xs cursor-pointer transition-all"
                  onClick={() => props.onTopicSelect(topic)}
                >
                  <span
                    class={`flex rounded-full px-[0.9em] py-[0.5em] font-medium leading-5 ${
                      isSelected()
                        ? 'bg-sienna-mid/30 text-white hover:bg-sienna-mid/40 shadow-[0_0_12px_rgba(119,158,203,0.5)]'
                        : 'bg-sienna-mid/10 text-sienna-mid hover:bg-sienna-mid/20'
                    }`}
                  >
                    {topic}
                    <span class="ml-2 text-zinc-500">{count()}</span>
                  </span>
                </div>
              )
            }}
          </For>
        </div>
      </div>
    </Show>
  )
}
