import { GAME_ORDER, MAX_SETS, gameLabel, type Position, type Side } from '../domain/model';
import { normalizeName } from '../domain/names';
import { playerAt, type FillPlan, type GamePlan } from '../domain/plan';
import { formatSet } from '../domain/validate';
import type { ChosenPlayers } from '../domain/learn';
import { collapse, selectedOptionText } from './page';

/** Step 2 "Erfassung": one game row of the result table. */
export interface ResultRow {
  index: number;
  row: HTMLTableRowElement;
  homePlayers: HTMLSelectElement[];
  guestPlayers: HTMLSelectElement[];
  homeFlag: HTMLSelectElement | null;
  guestFlag: HTMLSelectElement | null;
  sets: HTMLInputElement[];
}

/** Values of the wo/ret select next to each player. */
export const FLAG_NONE = '0';
export const FLAG_WALKOVER = '1';
export const FLAG_RETIRED = '2';

export function getResultsForm(doc: Document): HTMLFormElement | null {
  return doc.querySelector<HTMLFormElement>('form[name="form1"]');
}

export function readResultRows(doc: Document): ResultRow[] {
  const form = getResultsForm(doc);
  if (!form) return [];
  const labels = GAME_ORDER.map(gameLabel);
  const rows: ResultRow[] = [];

  for (const row of form.querySelectorAll<HTMLTableRowElement>('table tr')) {
    const cells = [...row.cells];
    const index = labels.indexOf(collapse(cells[0]?.textContent ?? ''));
    if (index < 0 || cells.length < 5) continue;
    rows.push({
      index,
      row,
      homePlayers: [...cells[1]!.querySelectorAll('select')],
      guestPlayers: [...cells[3]!.querySelectorAll('select')],
      homeFlag: row.querySelector<HTMLSelectElement>('select[id$="_home"]'),
      guestFlag: row.querySelector<HTMLSelectElement>('select[id$="_guest"]'),
      sets: [...row.querySelectorAll<HTMLInputElement>('input[type="text"][id^="set"]')].slice(0, MAX_SETS),
    });
  }
  return rows;
}

export interface FieldMark {
  element: HTMLElement;
  message: string;
}

/**
 * Enters set scores and wo/ret flags and checks the pre-selected players.
 * Returns the fields the user should look at.
 */
export function fillResults(rows: ResultRow[], plan: FillPlan): FieldMark[] {
  const marks: FieldMark[] = [];
  for (const row of rows) {
    const game = plan.games[row.index];
    if (!game) continue;
    checkPlayers(row, game, plan, marks);
    fillFlags(row, game);
    fillSets(row, game, marks);
    if (game.issues.length) {
      marks.push({ element: row.row.cells[0]!, message: game.issues.join(' · ') });
    }
  }
  return marks;
}

function expectedPlayers(game: GamePlan, plan: FillPlan, side: Side): ({ player: string | null; written: string } | null)[] {
  if (game.definition.kind === 'doubles') {
    const entries = plan.doubles[side];
    if (!entries) return [null, null];
    return entries.map((e) => ({ player: e.player, written: e.writtenName }));
  }
  const position: Position = side === 'home' ? game.definition.home : game.definition.guest;
  const entry = playerAt(plan, side, position);
  return [entry ? { player: entry.player, written: entry.writtenName } : null];
}

function checkPlayers(row: ResultRow, game: GamePlan, plan: FillPlan, marks: FieldMark[]): void {
  for (const side of ['home', 'guest'] as const) {
    const selects = side === 'home' ? row.homePlayers : row.guestPlayers;
    const expected = expectedPlayers(game, plan, side);
    // click-tt may list the two doubles players in another order than the sheet.
    if (selects.length === 2 && expected.length === 2 && sameSet(selects, expected)) continue;
    selects.forEach((select, i) => {
      const want = expected[i];
      if (!want) {
        marks.push({ element: select, message: 'Spieler auf dem Matchblatt nicht erkannt – bitte prüfen' });
        return;
      }
      if (!want.player) {
        marks.push({ element: select, message: `Matchblatt: „${want.written}“ – Spieler bitte prüfen` });
        return;
      }
      if (normalizeName(selectedOptionText(select)) === normalizeName(want.player)) return;
      const option = [...select.options].find((o) => normalizeName(o.textContent ?? '') === normalizeName(want.player!));
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      marks.push({ element: select, message: `Laut Matchblatt: ${want.player} („${want.written}“)` });
    });
  }
}

function sameSet(selects: HTMLSelectElement[], expected: ({ player: string | null } | null)[]): boolean {
  const chosen = selects.map((s) => normalizeName(selectedOptionText(s))).sort();
  const wanted = expected.map((e) => (e?.player ? normalizeName(e.player) : '?')).sort();
  return chosen.join('|') === wanted.join('|');
}

function fillFlags(row: ResultRow, game: GamePlan): void {
  const flagFor = (side: Side) =>
    game.walkoverLoser === side ? FLAG_WALKOVER : game.retiredSide === side ? FLAG_RETIRED : FLAG_NONE;
  // Set flags before the scores: click-tt skips its plausibility check for wo/ret games.
  if (row.homeFlag) setValue(row.homeFlag, flagFor('home'));
  if (row.guestFlag) setValue(row.guestFlag, flagFor('guest'));
}

function fillSets(row: ResultRow, game: GamePlan, marks: FieldMark[]): void {
  row.sets.forEach((input, i) => {
    const set = game.sets[i];
    if (set?.enter) {
      // click-tt disables the fields of sets 4/5 until needed; it re-enables them on submit.
      input.disabled = false;
      setValue(input, formatSet(set.score));
      if (set.uncertain) marks.push({ element: input, message: 'Schwer lesbar – bitte prüfen' });
    } else {
      setValue(input, '0:0');
      if (set) marks.push({ element: input, message: `Auf dem Matchblatt: ${formatSet(set.score)} (ungültig)` });
    }
  });
}

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  if (element.value === value) return;
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Players chosen in the result table (used to learn name mappings). */
export function readChosenPlayers(rows: ResultRow[]): ChosenPlayers {
  const chosen: ChosenPlayers = { singles: { home: {}, guest: {} }, doubles: { home: [], guest: [] } };
  for (const row of rows) {
    const game = GAME_ORDER[row.index];
    if (!game) continue;
    if (game.kind === 'doubles') {
      chosen.doubles.home = row.homePlayers.filter(isRealPlayerOption).map(selectedOptionText);
      chosen.doubles.guest = row.guestPlayers.filter(isRealPlayerOption).map(selectedOptionText);
      continue;
    }
    const home = row.homePlayers[0];
    const guest = row.guestPlayers[0];
    if (home && isRealPlayerOption(home)) chosen.singles.home[game.home] ??= selectedOptionText(home);
    if (guest && isRealPlayerOption(guest)) chosen.singles.guest[game.guest] ??= selectedOptionText(guest);
  }
  return chosen;
}

function isRealPlayerOption(select: HTMLSelectElement): boolean {
  const text = selectedOptionText(select);
  return text.includes(',') && !/nicht anwesend|sonstiger Spieler/i.test(text);
}
