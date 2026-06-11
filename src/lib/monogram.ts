/**
 * Deterministic hue-hash for company monogram tiles.
 *
 * Returns an `oklch(...)` color with fixed lightness (0.48) and chroma (0.15)
 * and a hue derived from a hash of the whole name. The fixed, mid lightness
 * keeps white text legible on the tile in both light and dark themes.
 * L=0.48 (vs 0.52) lifts WCAG contrast of white text across the hue wheel —
 * yellow-green hues (~80-145) dip lowest at constant OKLCH L.
 * Reference look from the mockup: `oklch(0.5 0.13 <hue>)`.
 */
export function monogramColor(name: string): string {
  // FNV-1a-style string hash over the whole name. Deterministic and well spread.
  let hash = 2166136261
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  // Unsigned, then fold to a hue in [0, 360).
  const hue = (hash >>> 0) % 360
  return `oklch(0.48 0.15 ${hue})`
}
