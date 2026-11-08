/**
 * Read access to the click-tt (nuLiga) result entry pages. click-tt generates
 * most form field names per session, so elements are located via page
 * structure and visible labels instead of names.
 */

export type EntryStep = 'lineup' | 'results' | 'review';

const STEP_LABELS: Record<string, EntryStep> = {
  Mannschaftsaufstellung: 'lineup',
  Erfassung: 'results',
  Kontrolle: 'review',
};

export function detectStep(doc: Document): EntryStep | null {
  const selected = doc.querySelector('ol.progress li.progress-selected');
  const label = selected?.textContent?.trim() ?? '';
  return STEP_LABELS[label] ?? null;
}

/** Identifies the match (league, teams, date) so stored data is applied to the right one. */
export function matchKey(doc: Document): string | null {
  const heading = doc.querySelector('#content-row1 h1');
  if (!heading) return null;
  return collapse(heading.textContent ?? '');
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function findSubmitButton(root: ParentNode, valuePrefix: string): HTMLInputElement | null {
  const buttons = [...root.querySelectorAll<HTMLInputElement>('input[type="submit"]')];
  return buttons.find((b) => b.value.trim().startsWith(valuePrefix) && !b.disabled) ?? null;
}

export function selectedOptionText(select: HTMLSelectElement): string {
  return collapse(select.selectedOptions[0]?.textContent ?? '');
}
