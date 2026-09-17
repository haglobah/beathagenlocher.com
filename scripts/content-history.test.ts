import { afterEach, describe, expect, test } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deriveContentHistory } from './content-history'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'content-history-'))
  roots.push(root)
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('init', '-q')
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@example.com')
  function write(path: string, body = 'Hello world.', publish = true, updated = '2020-01-02') {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(
      join(root, path),
      `---\ntitle: Example\nstartDate: 2020-01-01\nupdated: ${updated}\npublish: ${publish}\n---\n\n${body}\n`,
    )
  }
  function commit(date: string, message = 'Edit content') {
    git('add', '.')
    execFileSync('git', ['commit', '-qm', message, '--allow-empty'], {
      cwd: root,
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    })
    return git('rev-parse', 'HEAD')
  }
  return { root, git, write, commit }
}
const note = 'src/content/notes/An example.mdx'
const baselineDate = '2024-01-01T12:00:00Z'
const editDate = '2024-02-01T12:00:00Z'

describe('Git content history', () => {
  test('preserves baseline frontmatter and derives committed updates without mutating dirty content', async () => {
    const r = repository()
    r.write(note)
    const baselineCommit = r.commit(baselineDate)
    expect((await deriveContentHistory({ ...r, baselineCommit })).updatedByFile[note]).toBe(
      '2020-01-02T00:00:00.000Z',
    )
    r.write(note, 'A meaningful one-line change.')
    r.commit(editDate)
    r.write(note, 'Uncommitted work.')
    const result = await deriveContentHistory({ ...r, baselineCommit })
    expect(result.updatedByFile[note]).toBe('2024-02-01T12:00:00.000Z')
    expect(result.events.map((e) => [e.type, e.file, e.date])).toEqual([
      ['update', note, '2024-02-01T12:00:00.000Z'],
    ])
    expect(await deriveContentHistory({ ...r, baselineCommit })).toEqual(result)
    expect(r.git('diff')).toContain('Uncommitted work.')
  })

  test('ignores formatting and updated-only edits but detects code whitespace changes', async () => {
    const r = repository()
    r.write(note, '*Hello* world.\n\n- One\n- Two')
    const baselineCommit = r.commit(baselineDate)
    r.write(note, '_Hello_ world.\n\n* One\n* Two', true, '2024-02-01')
    r.commit(editDate)
    const result = await deriveContentHistory({ ...r, baselineCommit })
    expect(result.events).toEqual([])
    expect(result.updatedByFile[note]).toBe('2020-01-02T00:00:00.000Z')
    r.write(note, '```text\n a\n```')
    r.commit('2024-02-02T12:00:00Z')
    r.write(note, '```text\n  a\n```')
    r.commit('2024-02-03T12:00:00Z')
    expect((await deriveContentHistory({ ...r, baselineCommit })).events).toHaveLength(2)
  })

  test('draft edits get dates; first publication is new; daily grouping favors new; quiet keeps date', async () => {
    const r = repository()
    r.write(note, 'Draft.', false)
    const baselineCommit = r.commit(baselineDate)
    r.write(note, 'Still a draft.', false)
    r.commit(editDate)
    expect((await deriveContentHistory({ ...r, baselineCommit })).events).toEqual([])
    expect((await deriveContentHistory({ ...r, baselineCommit })).updatedByFile[note]).toBe(
      '2024-02-01T12:00:00.000Z',
    )
    r.write(note, 'Still a draft.', true)
    r.commit('2024-02-02T12:00:00Z')
    r.write(note, 'Published and revised.', true)
    r.commit('2024-02-02T13:00:00Z')
    r.write(note, 'Published and corrected.', true)
    r.commit('2024-02-03T12:00:00Z', 'Small correction\n\nStream: quiet')
    const result = await deriveContentHistory({ ...r, baselineCommit })
    expect(result.events.map((e) => e.type)).toEqual(['new'])
    expect(result.updatedByFile[note]).toBe('2024-02-03T12:00:00.000Z')
  })

  test('quiet initial publication is new and republication is an update', async () => {
    const r = repository()
    r.commit(baselineDate)
    const baselineCommit = r.git('rev-parse', 'HEAD')
    r.write(note)
    r.commit(editDate, 'Publish\n\nStream: quiet')
    expect(
      (await deriveContentHistory({ ...r, baselineCommit })).events.map((e) => e.type),
    ).toEqual(['new'])
    r.write(note, 'Hidden temporarily.', false)
    r.commit('2024-02-02T12:00:00Z')
    r.write(note, 'Hidden temporarily.', true)
    r.commit('2024-02-03T12:00:00Z')
    expect(
      (await deriveContentHistory({ ...r, baselineCommit })).events.map((e) => e.type),
    ).toEqual(['update', 'new'])
  })

  test('renames preserve dates and seed events, including spaces, unicode, shell metacharacters', async () => {
    const r = repository()
    r.write(note)
    const baselineCommit = r.commit(baselineDate)
    const renamed = 'src/content/notes/Über [abc] $(echo oops) `thing`.mdx'
    r.git('mv', note, renamed)
    r.commit(editDate)
    const historicalEvents = [
      {
        type: 'new' as const,
        file: note,
        slug: 'an-example',
        collection: 'notes',
        title: 'Old title',
        date: '2020-01-01T00:00:00.000Z',
        commitHash: 'seed',
      },
    ]
    const result = await deriveContentHistory({ ...r, baselineCommit, historicalEvents })
    expect(result.updatedByFile[renamed]).toBe('2020-01-02T00:00:00.000Z')
    expect(result.updatedByFile[note]).toBeUndefined()
    expect(result.events).toHaveLength(1)
    expect(result.events[0].file).toBe(renamed)
    expect(result.events[0].title).toBe('Example')
  })

  test('filters unpublished/deleted historical seed events, preserves talks and never announces drafts', async () => {
    const r = repository()
    const talk = 'src/content/talks/Example.mdx'
    r.write(note)
    r.write(talk)
    const baselineCommit = r.commit(baselineDate)
    const historicalEvents = [note, talk, 'src/content/notes/Missing.mdx'].map((file) => ({
      type: 'new' as const,
      file,
      slug: 'example',
      collection: file.split('/')[2],
      title: 'Example',
      date: '2020-01-01T00:00:00Z',
      commitHash: 'seed',
    }))
    r.write(note, 'Now hidden.', false)
    r.write('src/content/notes/Draft.mdx', 'Draft.', false)
    r.commit(editDate)
    expect(
      (await deriveContentHistory({ ...r, baselineCommit, historicalEvents })).events.map(
        (e) => e.file,
      ),
    ).toEqual([talk])
  })

  test('rejects missing migration history and shallow repositories', async () => {
    const r = repository()
    r.write(note)
    const baselineCommit = r.commit(baselineDate)
    await rejects(deriveContentHistory({ ...r, baselineCommit: 'f'.repeat(40) }), /baseline/)
    writeFileSync(join(r.root, '.git/shallow'), `${baselineCommit}\n`)
    await rejects(deriveContentHistory({ ...r, baselineCommit }), /shallow/)
  })
})
