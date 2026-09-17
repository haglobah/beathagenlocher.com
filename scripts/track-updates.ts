import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { deriveContentHistory } from './content-history'

if (process.argv.length > 2) throw new Error('track-updates is read-only and accepts no arguments.')

const root = fileURLToPath(new URL('../', import.meta.url))
const readJSON = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const { baselineCommit } = readJSON('../src/data/content-history-baseline.json')
const historicalEvents = readJSON('../src/data/content-updates.json')
console.log(
  JSON.stringify(await deriveContentHistory({ root, baselineCommit, historicalEvents }), null, 2),
)
