#!/usr/bin/env node

/**
 * Scans git history for new content and significant updates, adds them to content-updates.json
 *
 * Usage: node scripts/track-updates.js [--since=30] [--threshold=10] [--dry-run]
 *
 * Options:
 *   --since=N      Look back N days (default: 30)
 *   --threshold=N  Minimum lines changed to be "significant" for updates (default: 10)
 *   --dry-run      Show what would be added without writing
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { slug } from 'github-slugger'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const UPDATES_FILE = join(ROOT, 'src/data/content-updates.json')
const CONTENT_DIR = 'src/content'

/**
 * Unquote and unescape git's quoted filenames
 * Git quotes paths with special characters and escapes them as octal (e.g., \342\200\224 for em dash)
 */
function unquoteGitPath(path) {
  if (!path.startsWith('"') || !path.endsWith('"')) {
    return path
  }
  // Remove surrounding quotes
  let unquoted = path.slice(1, -1)
  // Unescape octal sequences (e.g., \342\200\224 -> UTF-8 bytes -> character)
  unquoted = unquoted.replace(/\\([0-7]{3})/g, (_, octal) => {
    return String.fromCharCode(parseInt(octal, 8))
  })
  // Convert the Latin-1 string (byte values) to proper UTF-8
  return Buffer.from(unquoted, 'latin1').toString('utf-8')
}

// Collections to track (excludes stream itself)
const TRACKED_COLLECTIONS = ['notes', 'essays', 'talks']

// Parse CLI args
const args = process.argv.slice(2)
const getArg = (name, defaultVal) => {
  const arg = args.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.split('=')[1] : defaultVal
}
const dryRun = args.includes('--dry-run')
const sinceDays = parseInt(getArg('since', '30'), 10)
const threshold = parseInt(getArg('threshold', '10'), 10)

/**
 * Extract title from MDX frontmatter
 */
function extractTitle(filePath) {
  const fullPath = join(ROOT, filePath)
  if (!existsSync(fullPath)) return null

  const content = readFileSync(fullPath, 'utf-8')
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return null

  const frontmatter = match[1]
  const titleMatch = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m)
  return titleMatch ? titleMatch[1] : null
}

/**
 * Get the creation date of a file (first commit)
 */
function getFileCreationDate(filePath) {
  try {
    const result = execSync(`git log --follow --format="%aI" --diff-filter=A -- "${filePath}"`, {
      cwd: ROOT,
      encoding: 'utf-8',
    }).trim()
    return result ? new Date(result) : null
  } catch {
    return null
  }
}

/**
 * Get newly created content files from git history
 */
function getNewContent() {
  const since = new Date()
  since.setDate(since.getDate() - sinceDays)

  // Get commits that added new content files
  const logOutput = execSync(
    `git log --since="${since.toISOString()}" --pretty=format:"%H|%aI|%s" --diff-filter=A --name-only -- "${CONTENT_DIR}/**/*.mdx"`,
    { cwd: ROOT, encoding: 'utf-8' },
  )

  const newItems = []
  const chunks = logOutput.split('\n\n').filter(Boolean)

  for (const chunk of chunks) {
    const lines = chunk.split('\n').filter(Boolean)
    if (lines.length < 2) continue

    const [commitInfo, ...files] = lines
    const [hash, dateStr] = commitInfo.split('|')
    const commitDate = new Date(dateStr)

    for (let file of files) {
      // Handle git's quoted paths for special characters
      file = unquoteGitPath(file)

      // Only track specific collections
      const collectionMatch = file.match(
        new RegExp(`^${CONTENT_DIR}/(${TRACKED_COLLECTIONS.join('|')})/(.+)\\.mdx$`),
      )
      if (!collectionMatch) continue

      const collection = collectionMatch[1]
      const link = slug(collectionMatch[2])

      const title = extractTitle(file)
      if (!title) continue

      newItems.push({
        type: 'new',
        file,
        slug: link,
        collection,
        title,
        date: commitDate.toISOString(),
        commitHash: hash.slice(0, 7),
      })
    }
  }

  return newItems
}

/**
 * Get significant updates from git history
 */
function getSignificantUpdates() {
  const since = new Date()
  since.setDate(since.getDate() - sinceDays)

  // Get commits that touched content files
  const logOutput = execSync(
    `git log --since="${since.toISOString()}" --pretty=format:"%H|%aI|%s" --name-only -- "${CONTENT_DIR}/**/*.mdx"`,
    { cwd: ROOT, encoding: 'utf-8' },
  )

  const updates = []
  const chunks = logOutput.split('\n\n').filter(Boolean)

  for (const chunk of chunks) {
    const lines = chunk.split('\n').filter(Boolean)
    if (lines.length < 2) continue

    const [commitInfo, ...files] = lines
    const [hash, dateStr, message] = commitInfo.split('|')
    const commitDate = new Date(dateStr)

    // Skip commits that look like typo fixes
    if (/fix(es|ed)?\s*(typo|spelling|grammar)/i.test(message)) continue

    for (let file of files) {
      // Handle git's quoted paths for special characters
      file = unquoteGitPath(file)

      // Only track specific collections
      const collectionMatch = file.match(
        new RegExp(`^${CONTENT_DIR}/(${TRACKED_COLLECTIONS.join('|')})/(.+)\\.mdx$`),
      )
      if (!collectionMatch) continue

      const collection = collectionMatch[1]
      const link = slug(collectionMatch[2])

      // Get lines changed in this commit for this file
      try {
        const stat = execSync(`git show --numstat --format="" ${hash} -- "${file}"`, {
          cwd: ROOT,
          encoding: 'utf-8',
        }).trim()

        if (!stat) continue

        const [added, removed] = stat.split('\t').map((n) => parseInt(n, 10) || 0)
        const totalChanged = added + removed

        if (totalChanged < threshold) continue

        // Check if this is the initial commit for this file
        const creationDate = getFileCreationDate(file)
        if (creationDate) {
          const hoursSinceCreation =
            (commitDate.getTime() - creationDate.getTime()) / (1000 * 60 * 60)
          // Skip if commit is within 24h of file creation (likely initial work)
          if (hoursSinceCreation < 24) continue
        }

        const title = extractTitle(file)
        if (!title) continue

        updates.push({
          type: 'update',
          file,
          slug: link,
          collection,
          title,
          date: commitDate.toISOString(),
          linesChanged: totalChanged,
          commitHash: hash.slice(0, 7),
        })
      } catch {
        // Skip files we can't get stats for
        continue
      }
    }
  }

  return updates
}

/**
 * Main
 */
function main() {
  console.log(
    `Scanning git history (last --since=${sinceDays} days, threshold: --threshold=${threshold} lines)...\n`,
  )

  // Load existing entries
  let existing = []
  if (existsSync(UPDATES_FILE)) {
    existing = JSON.parse(readFileSync(UPDATES_FILE, 'utf-8'))
  }

  // Get new content and updates
  const newContent = getNewContent()
  const newUpdates = getSignificantUpdates()

  // Filter out duplicates (same type + slug + date combo)
  const existingKeys = new Set(existing.map((u) => `${u.type}|${u.slug}|${u.date}`))
  const toAddNew = newContent.filter((u) => !existingKeys.has(`${u.type}|${u.slug}|${u.date}`))
  const toAddUpdates = newUpdates.filter((u) => !existingKeys.has(`${u.type}|${u.slug}|${u.date}`))

  if (toAddNew.length === 0 && toAddUpdates.length === 0) {
    console.log('No new content or significant updates found.')
    return
  }

  if (toAddNew.length > 0) {
    console.log(`Found ${toAddNew.length} new content item(s):\n`)
    for (const item of toAddNew) {
      console.log(`  + ${item.title} (${item.collection})`)
      console.log(`    created on ${item.date.split('T')[0]}`)
      console.log(`    commit: ${item.commitHash}\n`)
    }
  }

  if (toAddUpdates.length > 0) {
    console.log(`Found ${toAddUpdates.length} significant update(s):\n`)
    for (const update of toAddUpdates) {
      console.log(`  ~ ${update.title} (${update.collection})`)
      console.log(`    ${update.linesChanged} lines changed on ${update.date.split('T')[0]}`)
      console.log(`    commit: ${update.commitHash}\n`)
    }
  }

  if (dryRun) {
    console.log('Dry run - no changes written.')
    return
  }

  // Merge and sort by date (newest first)
  const merged = [...existing, ...toAddNew, ...toAddUpdates].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )

  // Write back
  writeFileSync(UPDATES_FILE, JSON.stringify(merged, null, 2) + '\n')
  console.log(`Updated ${UPDATES_FILE}`)
}

main()
