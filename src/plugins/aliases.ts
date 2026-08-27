import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { slug } from 'github-slugger'

/**
 * Collect slugified `aliases` frontmatter entries from all content files.
 * Runs at config time (before astro:content exists), so it reads the
 * filesystem directly. Aliases are old slugs/titles of renamed content;
 * [...slug].astro builds redirect stubs for them.
 */
export function getContentAliases(contentDir: string): string[] {
  const files = fs
    .readdirSync(contentDir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(md|mdx)$/.test(d.name))
    .map((d) => path.join(d.parentPath, d.name))

  return files.flatMap((file) => {
    const { data } = matter(fs.readFileSync(file, 'utf-8'))
    if (data.aliases === undefined) return []
    if (
      !Array.isArray(data.aliases) ||
      data.aliases.some((a: unknown) => typeof a !== 'string')
    ) {
      throw new Error(`${file}: 'aliases' must be an array of strings`)
    }
    return data.aliases.map((a: string) => slug(a))
  })
}
