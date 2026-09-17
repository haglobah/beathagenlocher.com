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
