/**
 * Matching of handwritten (usually first) names on the sheet to click-tt
 * player names in the format "Lastname, Firstname".
 */

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

/** Strips click-tt rank/status prefixes like "4.1 ", "E " or "S " from list entries. */
export function stripRankPrefix(entry: string): string {
  return entry.replace(/^\s*(?:\d+\.\d+|[A-Z])\s+(?=\S+,)/, '').trim();
}

export function splitRosterName(name: string): { lastName: string; firstName: string } {
  const [lastName = '', firstName = ''] = name.split(',').map((part) => part.trim());
  return { lastName, firstName };
}

/** Jaro-Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - window); j < Math.min(b.length, i + window + 1); j++) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = bMatched[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Similarity of a handwritten name to one click-tt roster name. */
export function nameSimilarity(written: string, rosterName: string): number {
  const w = normalizeName(written);
  if (!w) return 0;
  const { lastName, firstName } = splitRosterName(rosterName);
  const first = normalizeName(firstName);
  const last = normalizeName(lastName);
  const full = `${first} ${last}`.trim();

  if (w === first || w === full || w === `${last} ${first}`.trim()) return 1;
  // Nicknames are often a prefix of the first name ("Dani" → "Daniel").
  if (first && w.length >= 3 && (first.startsWith(w) || w.startsWith(first))) return 0.92;
  // "Firstname L." style.
  const [wFirst, wRest] = w.split(' ');
  if (wRest && wFirst === first && last.startsWith(wRest)) return 0.97;
  return Math.max(jaroWinkler(w, first), jaroWinkler(w, last) - 0.05, jaroWinkler(w, full));
}

export interface NameMatch {
  name: string;
  score: number;
}

export function rankCandidates(written: string, candidates: readonly string[]): NameMatch[] {
  return candidates
    .map((name) => ({ name, score: nameSimilarity(written, name) }))
    .sort((a, b) => b.score - a.score);
}

const MIN_SCORE = 0.85;
const MIN_MARGIN = 0.08;
const CONFIDENT_SCORE = 0.95;

/** Returns the clearly best candidate or null if none or several fit. */
export function bestCandidate(
  written: string,
  candidates: readonly string[],
): { name: string; uncertain: boolean } | null {
  const [best, second] = rankCandidates(written, candidates);
  if (!best || best.score < MIN_SCORE) return null;
  if (second && best.score - second.score < MIN_MARGIN) return null;
  return { name: best.name, uncertain: best.score < CONFIDENT_SCORE };
}
