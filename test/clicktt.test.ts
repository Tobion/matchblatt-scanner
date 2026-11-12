import { describe, expect, it } from 'vitest';
import {
  assignPositions,
  NO_SELECTION,
  nextLineupAction,
  readLineupSections,
  readRosters,
} from '../src/clicktt/lineup';
import { detectStep, matchKey } from '../src/clicktt/page';
import { fillResults, readChosenPlayers, readResultRows } from '../src/clicktt/results';
import { buildFillPlan, type FillPlan } from '../src/domain/plan';
import { doubles, exampleSheet, fixturePlan, loadPage } from './helpers';

describe('page detection', () => {
  it('detects the entry steps and the match', () => {
    expect(detectStep(loadPage('click-tt-single-match-report-part-1.html'))).toBe('lineup');
    expect(detectStep(loadPage('click-tt-single-match-report-part-2.html'))).toBe('results');
    expect(matchKey(loadPage('click-tt-single-match-report-part-1.html'))).toBe(
      matchKey(loadPage('click-tt-single-match-report-part-2.html')),
    );
  });
});

describe('step 1: lineup', () => {
  it('reads both teams with lineup and selectable players', () => {
    const sections = readLineupSections(loadPage('click-tt-single-match-report-part-1.html'));
    expect(sections.map((s) => [s.side, s.teamName])).toEqual([
      ['home', 'Pinguin Zürich III'],
      ['guest', 'Dietikon-Weiningen II'],
    ]);
    expect(sections[0]!.rows.map((r) => r.player)).toEqual(['Stuber, Lukas', 'Moser, Herbert', 'Reckel, Jim']);
    expect(sections.every((s) => s.rows.every((r) => r.doublesSelect && r.deleteCheckbox))).toBe(true);
    expect(sections.every((s) => s.deleteButton && s.insertButton && s.list)).toBe(true);

    const rosters = readRosters(sections)!;
    expect(rosters.home.players).toHaveLength(3 + 23);
    expect(rosters.home.players[3]).toEqual({ name: 'Schäfer, Christian', inLineup: false });
    expect(rosters.guest.players.map((p) => p.name)).toContain('Kiritharan, Gishok');
  });

  it('removes a regular player before inserting the substitute', () => {
    const doc = loadPage('click-tt-single-match-report-part-1.html');
    const plan = fixturePlan({ C: 'Schäfer, Christian' });

    const remove = nextLineupAction(readLineupSections(doc), plan);
    expect(remove.kind).toBe('delete');
    if (remove.kind !== 'delete') return;
    expect(remove.side).toBe('home');
    expect(remove.rows.map((r) => r.player)).toEqual(['Reckel, Jim']);
    expect(remove.button.value).toBe('Löschen');

    // Simulate the page after click-tt removed the player.
    remove.rows[0]!.row.remove();
    const insert = nextLineupAction(readLineupSections(doc), plan);
    expect(insert.kind).toBe('insert');
    if (insert.kind !== 'insert') return;
    expect(insert.options.map((o) => o.textContent)).toEqual(['4.1 Schäfer, Christian']);
    expect(insert.button.value).toBe('<< Einfügen');
  });

  it('assigns single positions and doubles', () => {
    const doc = loadPage('click-tt-single-match-report-part-1.html');
    const sections = readLineupSections(doc);
    const plan = fixturePlan();
    expect(nextLineupAction(sections, plan).kind).toBe('assign');

    const { missing } = assignPositions(sections, plan);
    expect(missing).toEqual([]);
    const values = (side: 0 | 1) =>
      sections[side]!.rows.map((r) => [r.positionSelect.selectedOptions[0]!.textContent, r.doublesSelect!.value]);
    expect(values(0)).toEqual([
      ['A', '0'],
      ['B', NO_SELECTION],
      ['C', '0'],
    ]);
    expect(values(1)).toEqual([
      ['X', '0'],
      ['Y', NO_SELECTION],
      ['Z', '0'],
    ]);
  });

  it('inserts a doubles-only player and marks him for doubles only', () => {
    const doc = loadPage('click-tt-single-match-report-part-1.html');
    const plan = fixturePlan({}, (sheet) => {
      sheet.homeDoubles = doubles('A', ['Christian', 'Schäfer, Christian']);
    });
    expect(plan.doubles.home!.map((e) => [e.position, e.player])).toEqual([
      ['A', 'Stuber, Lukas'],
      [null, 'Schäfer, Christian'],
    ]);

    const insert = nextLineupAction(readLineupSections(doc), plan);
    expect(insert.kind).toBe('insert');
    if (insert.kind !== 'insert') return;
    expect(insert.options.map((o) => o.textContent)).toEqual(['4.1 Schäfer, Christian']);

    // Simulate the page after click-tt inserted the player as fourth row.
    const sections = readLineupSections(doc);
    const reckel = sections[0]!.rows[2]!.row;
    const copy = reckel.cloneNode(true) as HTMLTableRowElement;
    copy.querySelector('select')!.name = 'homeSingleFormationPos-3';
    [...copy.cells].find((c) => c.textContent === 'Reckel, Jim')!.textContent = 'Schäfer, Christian';
    copy.querySelectorAll('td[rowspan]').forEach((c) => c.remove());
    reckel.after(copy);

    const updated = readLineupSections(doc);
    expect(nextLineupAction(updated, plan).kind).toBe('assign');
    expect(assignPositions(updated, plan).missing).toEqual([]);
    expect(updated[0]!.rows.map((r) => [r.player, r.positionSelect.value, r.doublesSelect!.value])).toEqual([
      ['Stuber, Lukas', '0', '0'],
      ['Moser, Herbert', '1', NO_SELECTION],
      ['Reckel, Jim', '2', NO_SELECTION],
      ['Schäfer, Christian', NO_SELECTION, '0'],
    ]);
  });

  it('reports a doubles-only player that is not in the list', () => {
    const doc = loadPage('click-tt-single-match-report-part-1.html');
    const sections = readLineupSections(doc);
    const plan = fixturePlan({}, (sheet) => {
      sheet.homeDoubles = doubles('A', ['Zorro', null]);
    });
    expect(nextLineupAction(sections, plan).kind).toBe('assign');
    expect(assignPositions(sections, plan).missing).toEqual([
      { side: 'home', position: 'Doppel', writtenName: 'Zorro', player: null, alternatives: [] },
    ]);
  });

  it('keeps regular players and reports unresolved names', () => {
    const doc = loadPage('click-tt-single-match-report-part-1.html');
    const sections = readLineupSections(doc);
    const plan = fixturePlan({ C: null }, (sheet) => {
      sheet.players.find((p) => p.position === 'C')!.writtenName = 'Zorro';
    });
    expect(nextLineupAction(sections, plan).kind).toBe('assign');
    const { missing } = assignPositions(sections, plan);
    expect(missing).toEqual([{ side: 'home', position: 'C', writtenName: 'Zorro', player: null, alternatives: [] }]);
    expect(sections[0]!.rows[2]!.positionSelect.value).toBe(NO_SELECTION);
  });

  it('does not pick a player for an ambiguous name', () => {
    const doc = loadPage('click-tt-single-match-report-part-1.html');
    const sections = readLineupSections(doc);
    // The selection list contains "Dolder, Markus" and "Gabriel, Markus".
    const sheet = exampleSheet();
    const matches = { A: 'Stuber, Lukas', B: 'Moser, Herbert', C: null, X: 'Weber, Andreas', Y: 'Ung, No', Z: 'Rashiti, Aziz' };
    for (const player of sheet.players) player.rosterMatch = matches[player.position];
    sheet.players.find((p) => p.position === 'C')!.writtenName = 'Markus';
    // Even a learned mapping must not pick one of them.
    const plan = buildFillPlan(sheet, readRosters(sections)!, { 'pinguin zurich iii': { markus: 'Dolder, Markus' } });

    expect(plan.lineup.home[2]).toMatchObject({ player: null, alternatives: ['Dolder, Markus', 'Gabriel, Markus'] });
    expect(nextLineupAction(sections, plan).kind).toBe('assign');
    expect(assignPositions(sections, plan).missing).toEqual([
      { side: 'home', position: 'C', writtenName: 'Markus', player: null, alternatives: ['Dolder, Markus', 'Gabriel, Markus'] },
    ]);
    expect(sections[0]!.rows[2]!.positionSelect.value).toBe(NO_SELECTION);
  });
});

describe('step 2: results', () => {
  const page = () => loadPage('click-tt-single-match-report-part-2.html');
  // The saved page has Stuber/Reckel and Ung/Rashiti in the doubles.
  const plan = () => fixturePlan({}, (sheet) => (sheet.guestDoubles = doubles('Y', 'Z')));

  it('finds all ten games', () => {
    const rows = readResultRows(page());
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rows[6]!.homePlayers).toHaveLength(2);
    expect(rows.every((r) => r.sets.length === 5 && r.homeFlag && r.guestFlag)).toBe(true);
  });

  it('enters set scores and walkovers', () => {
    const rows = readResultRows(page());
    const marks = fillResults(rows, plan());
    expect(marks).toEqual([]);

    const sets = (i: number) => rows[i]!.sets.map((s) => s.value);
    expect(sets(0)).toEqual(['11:5', '11:3', '11:13', '11:3', '0:0']);
    expect(sets(8)).toEqual(['18:16', '11:5', '11:2', '0:0', '0:0']);
    expect(sets(2)).toEqual(['0:0', '0:0', '0:0', '0:0', '0:0']);
    expect([rows[2]!.homeFlag!.value, rows[2]!.guestFlag!.value]).toEqual(['0', '1']);
    expect([rows[0]!.homeFlag!.value, rows[0]!.guestFlag!.value]).toEqual(['0', '0']);
  });

  it('marks players that differ from the sheet', () => {
    const rows = readResultRows(page());
    const marks = fillResults(rows, fixturePlan()); // sheet says X+Z play doubles
    expect(marks.map((m) => m.message)).toEqual(['Laut Matchblatt: Weber, Andreas („Pavel“)']);
  });

  it('marks invalid and uncertain set scores', () => {
    const rows = readResultRows(page());
    const marks = fillResults(
      rows,
      fixturePlan({}, (sheet) => {
        sheet.guestDoubles = doubles('Y', 'Z');
        sheet.games[0]!.sets[1] = { home: 11, guest: 10, uncertain: false };
        sheet.games[4]!.sets[0]!.uncertain = true;
      }),
    );
    expect(rows[0]!.sets[1]!.value).toBe('0:0');
    expect(marks.map((m) => m.message)).toEqual([
      'Auf dem Matchblatt: 11:10 (ungültig)',
      expect.stringContaining('Ungültiges Satzresultat'),
      'Schwer lesbar – bitte prüfen',
      'Schwer lesbar: 11:5',
    ]);
  });

  it('reads the chosen players', () => {
    expect(readChosenPlayers(readResultRows(page()))).toEqual({
      singles: {
        home: { A: 'Stuber, Lukas', B: 'Moser, Herbert', C: 'Reckel, Jim' },
        guest: { X: 'Weber, Andreas', Y: 'Ung, No', Z: 'Rashiti, Aziz' },
      },
      doubles: { home: ['Stuber, Lukas', 'Reckel, Jim'], guest: ['Ung, No', 'Rashiti, Aziz'] },
    });
  });

  it('accepts doubles players in a different order than on the sheet', () => {
    const marks = fillResults(
      readResultRows(page()),
      fixturePlan({}, (sheet) => {
        sheet.homeDoubles = doubles('C', 'A');
        sheet.guestDoubles = doubles('Z', 'Y');
      }),
    );
    expect(marks).toEqual([]);
  });

  it('accepts a player chosen in step 1 for an ambiguous name', () => {
    const rows = readResultRows(page());
    const ambiguous = (sheetPlan: FillPlan, alternatives: string[]) => {
      const entry = sheetPlan.lineup.home.find((e) => e.position === 'C')!;
      Object.assign(entry, { player: null, uncertain: true, alternatives });
      // The doubles entry of position C refers to the same singles player.
      Object.assign(sheetPlan.doubles.home![1]!, { player: null, uncertain: true, alternatives });
      return sheetPlan;
    };
    // The saved page has "Reckel, Jim" at C (also in the doubles).
    expect(fillResults(rows, ambiguous(plan(), ['Gabriel, Jim', 'Reckel, Jim']))).toEqual([]);

    const marks = fillResults(readResultRows(page()), ambiguous(plan(), ['Gabriel, Jim', 'Weber, Jim']));
    expect(marks.map((m) => m.message)).toContain(
      'Matchblatt: „Tobias“ passt auf mehrere Spieler (Gabriel, Jim / Weber, Jim) – bitte Spieler wählen',
    );
  });

  it('expects a doubles-only player in the doubles row', () => {
    const rows = readResultRows(page());
    const marks = fillResults(
      rows,
      fixturePlan({}, (sheet) => {
        sheet.homeDoubles = doubles('A', ['Christian', 'Schäfer, Christian']);
        sheet.guestDoubles = doubles('Y', 'Z');
      }),
    );
    // The saved page has Reckel in the doubles; Schäfer is not selectable there yet.
    expect(marks.map((m) => [m.element === rows[6]!.homePlayers[1], m.message])).toEqual([
      [true, 'Laut Matchblatt: Schäfer, Christian („Christian“)'],
    ]);
  });
});
