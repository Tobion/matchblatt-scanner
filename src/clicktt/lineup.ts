import { positionsOf, type Rosters, type Side } from '../domain/model';
import { normalizeName, stripRankPrefix } from '../domain/names';
import { doublesOnlyEntries, doublesPlayers, requiredPlayers, type FillPlan } from '../domain/plan';
import { collapse, findSubmitButton } from './page';

/** Step 1 "Mannschaftsaufstellung": one team block of the lineup form. */
export interface LineupSection {
  side: Side;
  teamName: string;
  rows: LineupRow[];
  /** Multi-select with the remaining club players that can be inserted. */
  list: HTMLSelectElement | null;
  deleteButton: HTMLInputElement | null;
  insertButton: HTMLInputElement | null;
}

export interface LineupRow {
  row: HTMLTableRowElement;
  player: string;
  positionSelect: HTMLSelectElement;
  doublesSelect: HTMLSelectElement | null;
  deleteCheckbox: HTMLInputElement | null;
}

export const NO_SELECTION = 'WONoSelectionString';

export function getLineupForm(doc: Document): HTMLFormElement | null {
  return doc.querySelector<HTMLFormElement>('form[name="playerFormationForm"]');
}

export function readLineupSections(doc: Document): LineupSection[] {
  const form = getLineupForm(doc);
  if (!form) return [];
  const sections: LineupSection[] = [];
  let current: LineupSection | null = null;

  for (const row of form.querySelectorAll<HTMLTableRowElement>('table tr')) {
    const heading = row.querySelector('h2');
    if (heading) {
      current = {
        side: sections.length === 0 ? 'home' : 'guest',
        teamName: collapse(heading.textContent ?? ''),
        rows: [],
        list: null,
        deleteButton: null,
        insertButton: null,
      };
      sections.push(current);
      continue;
    }
    if (!current) continue;

    current.list ??= row.querySelector<HTMLSelectElement>('select[multiple]');
    current.deleteButton ??= findSubmitButton(row, 'Löschen');
    current.insertButton ??= findSubmitButton(row, '<< Einfügen');

    const positionSelect = row.querySelector<HTMLSelectElement>(
      'select[name^="homeSingleFormationPos-"], select[name^="guestSingleFormationPos-"]',
    );
    if (!positionSelect) continue;

    const plainCells = [...row.cells].filter((cell) => !cell.querySelector('select, input'));
    const nameCell = plainCells.find((cell) => (cell.textContent ?? '').includes(','));
    const doublesSelect =
      [...row.querySelectorAll<HTMLSelectElement>('select:not([multiple])')].find((s) => s !== positionSelect) ?? null;

    current.rows.push({
      row,
      player: collapse(nameCell?.textContent ?? ''),
      positionSelect,
      doublesSelect,
      deleteCheckbox: row.querySelector<HTMLInputElement>('input[type="checkbox"]'),
    });
  }
  return sections;
}

export function listEntries(list: HTMLSelectElement | null): { option: HTMLOptionElement; player: string }[] {
  if (!list) return [];
  return [...list.options].map((option) => ({ option, player: stripRankPrefix(collapse(option.textContent ?? '')) }));
}

/** Rosters (lineup + selectable players) of both teams, used as name candidates. */
export function readRosters(sections: LineupSection[]): Rosters | null {
  const home = sections.find((s) => s.side === 'home');
  const guest = sections.find((s) => s.side === 'guest');
  if (!home || !guest) return null;
  const toRoster = (section: LineupSection) => ({
    teamName: section.teamName,
    players: [
      ...section.rows.map((r) => ({ name: r.player, inLineup: true })),
      ...listEntries(section.list).map((e) => ({ name: e.player, inLineup: false })),
    ],
  });
  return { home: toRoster(home), guest: toRoster(guest) };
}

const samePlayer = (a: string, b: string) => normalizeName(a) === normalizeName(b);

export type LineupAction =
  | { kind: 'delete'; side: Side; rows: LineupRow[]; button: HTMLInputElement }
  | { kind: 'insert'; side: Side; options: HTMLOptionElement[]; button: HTMLInputElement }
  | { kind: 'assign' };

/**
 * Next step to bring the lineup in line with the plan. Deleting and inserting
 * players reloads the page, so only one such action is returned at a time.
 */
export function nextLineupAction(sections: LineupSection[], plan: FillPlan): LineupAction {
  for (const section of sections) {
    const required = requiredPlayers(plan, section.side);
    // Only remove players if every sheet name is resolved; otherwise an
    // unresolved name might refer to one of the pre-selected players.
    if (!section.deleteButton || !required.complete) continue;
    const surplus = section.rows.filter((r) => !required.players.some((w) => samePlayer(w, r.player)));
    if (surplus.length && surplus.every((r) => r.deleteCheckbox)) {
      return { kind: 'delete', side: section.side, rows: surplus, button: section.deleteButton };
    }
  }
  for (const section of sections) {
    if (!section.insertButton) continue;
    const missing = requiredPlayers(plan, section.side).players.filter(
      (p) => !section.rows.some((r) => samePlayer(r.player, p)),
    );
    const options = listEntries(section.list)
      .filter((entry) => missing.some((m) => samePlayer(m, entry.player)))
      .map((entry) => entry.option);
    if (options.length) return { kind: 'insert', side: section.side, options, button: section.insertButton };
  }
  return { kind: 'assign' };
}

/** Executes a delete/insert action; submits the form (page reloads). */
export function performReloadingAction(action: Exclude<LineupAction, { kind: 'assign' }>): void {
  if (action.kind === 'delete') {
    for (const row of action.rows) row.deleteCheckbox!.checked = true;
  } else {
    for (const option of action.options) option.selected = true;
  }
  action.button.click();
}

export interface AssignResult {
  /** Sheet players (position, or "Doppel" for doubles-only) not (yet) in the lineup table. */
  missing: { side: Side; position: string; writtenName: string; player: string | null }[];
}

/** Sets single positions and doubles flags of all players in the lineup table. */
export function assignPositions(sections: LineupSection[], plan: FillPlan): AssignResult {
  const result: AssignResult = { missing: [] };
  for (const section of sections) {
    const entries = plan.lineup[section.side];
    const positions = positionsOf(section.side);
    const doubles = doublesPlayers(plan, section.side) ?? [];

    for (const row of section.rows) {
      const entry = entries.find((e) => e.player && samePlayer(e.player, row.player));
      const value = entry ? String(positions.indexOf(entry.position)) : NO_SELECTION;
      setSelectValue(row.positionSelect, value);
      if (row.doublesSelect) {
        const inDoubles = doubles.some((p) => p && samePlayer(p, row.player));
        setSelectValue(row.doublesSelect, inDoubles ? firstRealOptionValue(row.doublesSelect) : NO_SELECTION);
      }
    }
    for (const entry of [...entries, ...doublesOnlyEntries(plan, section.side)]) {
      const present = entry.player && section.rows.some((r) => samePlayer(r.player, entry.player!));
      if (!present) {
        result.missing.push({
          side: section.side,
          position: entry.position ?? 'Doppel',
          writtenName: entry.writtenName,
          player: entry.player,
        });
      }
    }
  }
  return result;
}

function firstRealOptionValue(select: HTMLSelectElement): string {
  return [...select.options].find((o) => o.value !== NO_SELECTION)?.value ?? NO_SELECTION;
}

export function setSelectValue(select: HTMLSelectElement, value: string): void {
  if (select.value === value) return;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}
