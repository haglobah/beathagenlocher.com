const WORDS_PER_MINUTE = 200

// Estimate from the raw MDX body: drop what a reader never sees (imports,
// exports, tags) and count tokens that carry at least one letter or digit.
export function readingMinutes(body: string, wordsPerMinute = WORDS_PER_MINUTE): number {
  const prose = body
    .replace(/^(import|export)\b.*$/gm, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
  const words = prose.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length
  return Math.max(1, Math.ceil(words / wordsPerMinute))
}

// The minutes as a row of on/off dots: the binary digits, most significant
// first, padded with leading zeros so short reads line up with long ones.
export function binaryDots(minutes: number, minWidth = 4): boolean[] {
  return Math.max(0, Math.floor(minutes))
    .toString(2)
    .padStart(minWidth, '0')
    .split('')
    .map((bit) => bit === '1')
}

// Eight bits as two rows of four, high nibble on top. Reads past 255 minutes
// grow by whole rows so the grid stays rectangular.
export function binaryRows(minutes: number, rowWidth = 4, minRows = 2): boolean[][] {
  const bits = binaryDots(minutes, rowWidth * minRows)
  const width = Math.ceil(bits.length / rowWidth) * rowWidth
  const padded = [...Array<boolean>(width - bits.length).fill(false), ...bits]
  return Array.from({ length: width / rowWidth }, (_, row) =>
    padded.slice(row * rowWidth, (row + 1) * rowWidth),
  )
}
