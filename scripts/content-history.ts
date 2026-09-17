import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { format } from 'prettier'
import { slug } from 'github-slugger'

export interface ContentEvent {
  type: 'new' | 'update'
  file: string
  slug: string
  collection: string
  title: string
  date: string
  commitHash: string
  linesChanged?: number
}

export interface ContentHistoryOptions {
  root: string
  baselineCommit: string
  historicalEvents?: ContentEvent[]
}

export interface ContentHistory {
  updatedByFile: Record<string, string>
  events: ContentEvent[]
}

interface Document {
  source: string
  data: Record<string, unknown>
  body: string
  canonical?: Promise<string>
}
interface FileState {
  document: Document
  updated?: string
  everPublished: boolean
}

const tracked = (file: string) => /^src\/content\/(notes|essays)\/.+\.mdx$/.test(file)
const parse = (source: string): Document => {
  const { data, content } = matter(source)
  return { source, data, body: content }
}
const published = (document: Document) => document.data.publish === true
function date(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const parsed = new Date(value as string)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid content date: ${String(value)}`)
  return parsed.toISOString()
}
function stable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(stable)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    )
  }
  return value
}
async function canonical(document: Document, file: string): Promise<string> {
  document.canonical ??= (async () => {
    const { updated: _updated, ...metadata } = document.data
    try {
      // Fix the options rather than reading local config. Prose wrapping, quotes,
      // and list markers normalize; fenced code stays verbatim (no embedded formatter).
      const body = await format(document.body, {
        parser: 'mdx',
        proseWrap: 'always',
        printWidth: 100,
        singleQuote: true,
        semi: false,
        embeddedLanguageFormatting: 'off',
      })
      return JSON.stringify(stable(metadata)) + '\n' + body
    } catch (cause) {
      throw new Error(`Cannot compare content formatting in ${file}`, { cause })
    }
  })()
  return document.canonical
}
function refreshEvent(event: ContentEvent, file: string, document: Document): ContentEvent {
  const relative = file.replace(/^src\/content\//, '').replace(/\.mdx$/, '')
  const [collection, ...parts] = relative.split('/')
  return {
    ...event,
    file,
    collection,
    slug: parts.map((part) => slug(part)).join('/'),
    title: String(document.data.title ?? event.title),
  }
}

/**
 * Derive dates and stream announcements without changing source files.
 * The migration commit freezes pre-automation dates at their frontmatter values.
 * Later changes use committer timestamps along HEAD's first-parent history, so a
 * merged branch is published when its merge lands. Working edits never get a
 * wall-clock timestamp; they only affect final visibility/title of existing events.
 */
export async function deriveContentHistory({
  root,
  baselineCommit,
  historicalEvents = [],
}: ContentHistoryOptions): Promise<ContentHistory> {
  const git = (...args: string[]) =>
    execFileSync('git', ['--literal-pathspecs', ...args], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  if (git('rev-parse', '--is-shallow-repository').trim() === 'true') {
    throw new Error(
      'Cannot derive content history from a shallow repository. Fetch full history (fetch-depth: 0).',
    )
  }
  if (!/^[a-f\d]{40,64}$/i.test(baselineCommit))
    throw new Error('Content history baseline must be a full Git commit hash.')
  let baseline: string
  try {
    baseline = git('rev-parse', '--verify', `${baselineCommit}^{commit}`).trim()
    git('merge-base', '--is-ancestor', baseline, 'HEAD')
  } catch (cause) {
    throw new Error(
      'Content history baseline is missing or is not an ancestor of HEAD. Fetch its full Git history.',
      { cause },
    )
  }
  const firstParent = git('rev-list', '--first-parent', 'HEAD').trim().split('\n')
  const baselineIndex = firstParent.indexOf(baseline)
  if (baselineIndex < 0)
    throw new Error('Content history baseline must be on the first-parent history of HEAD.')
  const commits = firstParent.slice(0, baselineIndex).reverse()
  const states = new Map<string, FileState>()
  for (const file of git(
    'ls-tree',
    '-r',
    '--name-only',
    '-z',
    baseline,
    '--',
    'src/content/notes',
    'src/content/essays',
  )
    .split('\0')
    .filter(tracked)) {
    const document = parse(git('show', `${baseline}:${file}`))
    states.set(file, {
      document,
      updated: date(document.data.updated ?? document.data.startDate),
      everPublished: published(document),
    })
  }
  // Mutable copies allow historic paths to follow renames without rewriting seed data.
  const seed = historicalEvents.map((event) => ({ ...event }))
  const generated: ContentEvent[] = []
  let parent = baseline
  for (const commit of commits) {
    const committedAt = date(git('show', '-s', '--format=%cI', commit).trim())!
    const quiet = git('show', '-s', '--format=%(trailers:key=Stream,valueonly)', commit)
      .split('\n')
      .some((value) => value.trim().toLowerCase() === 'quiet')
    const changes = git(
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      parent,
      commit,
      '--',
      'src/content',
    ).split('\0')
    for (let index = 0; index < changes.length - 1; ) {
      const status = changes[index++]
      const oldFile = changes[index++]
      const file = status.startsWith('R') || status.startsWith('C') ? changes[index++] : oldFile
      if (status.startsWith('R')) {
        const previous = states.get(oldFile)
        states.delete(oldFile)
        if (previous && tracked(file)) states.set(file, previous)
        for (const event of [...seed, ...generated]) if (event.file === oldFile) event.file = file
      }
      if (!tracked(file)) continue
      if (status === 'D') {
        states.delete(file)
        continue
      }
      const document = parse(git('show', `${commit}:${file}`))
      const previous = states.get(file)
      const changed =
        !previous ||
        (previous.document.source !== document.source &&
          (await canonical(previous.document, file)) !== (await canonical(document, file)))
      const firstPublication = published(document) && !previous?.everPublished
      states.set(file, {
        document,
        updated: changed ? committedAt : previous?.updated,
        everPublished: Boolean(previous?.everPublished || published(document)),
      })
      if (published(document) && (firstPublication || (changed && !quiet))) {
        generated.push(
          refreshEvent(
            {
              type: firstPublication ? 'new' : 'update',
              file,
              slug: '',
              collection: '',
              title: '',
              date: committedAt,
              commitHash: commit.slice(0, 7),
            },
            file,
            document,
          ),
        )
      }
    }
    parent = commit
  }
  const updatedByFile: Record<string, string> = {}
  for (const [file, state] of states) {
    if (state.updated && existsSync(join(root, file))) updatedByFile[file] = state.updated
  }
  // Group generated events by final path and UTC date. Keep first publication's
  // original timestamp; for updates use the last update that day. Preserve seeds.
  const daily = new Map<string, ContentEvent>()
  for (const event of generated) {
    const key = `${event.file}\0${event.date.slice(0, 10)}`
    if (daily.get(key)?.type !== 'new') daily.set(key, event)
  }
  const workingDocuments = new Map<string, Document | null>()
  const events: ContentEvent[] = []
  for (const event of [...seed, ...daily.values()]) {
    let document = workingDocuments.get(event.file)
    if (document === undefined) {
      const fullPath = join(root, event.file)
      document = existsSync(fullPath) ? parse(readFileSync(fullPath, 'utf8')) : null
      workingDocuments.set(event.file, document)
    }
    if (document && published(document)) events.push(refreshEvent(event, event.file, document))
  }
  events.sort(
    (a, b) =>
      b.date.localeCompare(a.date) || a.file.localeCompare(b.file) || a.type.localeCompare(b.type),
  )
  return { updatedByFile, events }
}
