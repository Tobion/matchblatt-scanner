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
import { fixturePlan, loadPage } from './helpers';

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

  it('keeps regular players and reports unresolved names', () => {
    const doc = loadPage('click-tt-single-match-report-part-1.html');
    const sections = readLineupSections(doc);
    const plan = fixturePlan({ C: null }, (sheet) => {
      sheet.players.find((p) => p.position === 'C')!.writtenName = 'Zorro';
    });
    expect(nextLineupAction(sections, plan).kind).toBe('assign');
    const { missing } = assignPositions(sections, plan);
    expect(missing).toEqual([{ side: 'home', position: 'C', writtenName: 'Zorro', player: null }]);
    expect(sections[0]!.rows[2]!.positionSelect.value).toBe(NO_SELECTION);
  });
});

describe('step 2: results', () => {
  const page = () => loadPage('click-tt-single-match-report-part-2.html');
  // The saved page has Stuber/Reckel and Ung/Rashiti in the doubles.
  const plan = () => fixturePlan({}, (sheet) => (sheet.guestDoubles = ['Y', 'Z']));

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
        sheet.guestDoubles = ['Y', 'Z'];
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

  it('reads the chosen player per position', () => {
    expect(readChosenPlayers(readResultRows(page()))).toEqual({
      home: { A: 'Stuber, Lukas', B: 'Moser, Herbert', C: 'Reckel, Jim' },
      guest: { X: 'Weber, Andreas', Y: 'Ung, No', Z: 'Rashiti, Aziz' },
    });
  });
});
