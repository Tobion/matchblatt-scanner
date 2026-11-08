import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Rosters } from '../src/domain/model';
import { buildFillPlan, type FillPlan } from '../src/domain/plan';
import { sheetSchema, type RecognizedDoublesPlayer, type RecognizedSheet } from '../src/recognition/schema';

const root = resolve(dirname(import.meta.filename), '..') + '/';

/** Parses a saved click-tt page (scripts are not executed). */
export function loadPage(name: string): Document {
  const html = readFileSync(`${root}fixtures/${name}`, 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Manual transcription of fixtures/example_filled_matchresult.jpg. */
export function exampleSheet(): RecognizedSheet {
  return sheetSchema.parse(JSON.parse(readFileSync(`${root}test/data/example-sheet.json`, 'utf8')));
}

/** Example sheet mapped onto the players of the saved click-tt pages. */
export function fixturePlan(
  matches: Partial<Record<'A' | 'B' | 'C' | 'X' | 'Y' | 'Z', string | null>> = {},
  adjust: (sheet: RecognizedSheet) => void = () => {},
): FillPlan {
  const defaults = {
    A: 'Stuber, Lukas',
    B: 'Moser, Herbert',
    C: 'Reckel, Jim',
    X: 'Weber, Andreas',
    Y: 'Ung, No',
    Z: 'Rashiti, Aziz',
  };
  const sheet = exampleSheet();
  for (const player of sheet.players) {
    player.rosterMatch = player.position in matches ? matches[player.position]! : defaults[player.position];
  }
  adjust(sheet);
  return buildFillPlan(sheet, fixtureRosters());
}

export function fixtureRosters(): Rosters {
  const names = (list: string[], inLineup: boolean) => list.map((name) => ({ name, inLineup }));
  return {
    home: {
      teamName: 'Pinguin Zürich III',
      players: [
        ...names(['Stuber, Lukas', 'Moser, Herbert', 'Reckel, Jim'], true),
        ...names(['Schäfer, Christian', 'Strobel, Jonas', 'Dolder, Markus'], false),
      ],
    },
    guest: {
      teamName: 'Dietikon-Weiningen II',
      players: [
        ...names(['Weber, Andreas', 'Ung, No', 'Rashiti, Aziz'], true),
        ...names(['Kiritharan, Gishok', 'Krasniqi, Regjep'], false),
      ],
    },
  };
}

/** Doubles entries: a position letter or a doubles-only player given as [writtenName, rosterMatch]. */
export function doubles(...players: (string | [string, string | null])[]): RecognizedDoublesPlayer[] {
  return players.map((p) =>
    typeof p === 'string'
      ? { position: p as RecognizedDoublesPlayer['position'], writtenName: '', rosterMatch: null, nameUncertain: false }
      : { position: null, writtenName: p[0], rosterMatch: p[1], nameUncertain: false },
  );
}
