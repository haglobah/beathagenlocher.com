// Tally-style decomposition: ten small dots roll up into one bigger
// dot, ten of those into one big dot.
export function dotGroups(count: number) {
  return {
    hundreds: Math.floor(count / 100),
    tens: Math.floor((count % 100) / 10),
    ones: count % 10,
  }
}
