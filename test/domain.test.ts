import { describe, expect, it } from 'vitest';
import { bestCandidate, nameSimilarity, normalizeName, stripRankPrefix } from '../src/domain/names';
import { buildFillPlan } from '../src/domain/plan';
import { analyzeGame, isValidSet } from '../src/domain/validate';
import type { Rosters } from '../src/domain/model';
import { exampleSheet } from './helpers';

describe('isValidSet', () => {
  it.each([
    [11, 5, true],
    [5, 11, true],
    [11, 9, true],
    [11, 0, true],
    [14, 12, true],
    [18, 16, true],
    [11, 10, false],
    [12, 9, false],
    [13, 10, false],
    [10, 8, false],
    [0, 0, false],
  ])('%i:%i → %s', (home, guest, valid) => {
    expect(isValidSet({ home, guest })).toBe(valid);
  });
});

describe('analyzeGame', () => {
  const base = { walkoverLoser: null, retiredSide: null, setsWonHome: null, setsWonGuest: null };

  it('determines the winner after three won sets', () => {
    const result = analyzeGame({ ...base, sets: [{ home: 11, guest: 5 }, { home: 11, guest: 13 }, { home: 11, guest: 3 }, { home: 11, guest: 3 }] });
    expect(result.winner).toBe('home');
    expect(result.issues).toEqual([]);
  });

  it('flags sets after the game was decided', () => {
    const result = analyzeGame({ ...base, sets: [{ home: 11, guest: 5 }, { home: 11, guest: 5 }, { home: 11, guest: 5 }, { home: 11, guest: 5 }] });
    expect(result.surplusSets).toEqual([3]);
  });

  it('flags incomplete games and set column mismatches', () => {
    const result = analyzeGame({ ...base, setsWonHome: 3, setsWonGuest: 0, sets: [{ home: 11, guest: 5 }, { home: 11, guest: 5 }] });
    expect(result.winner).toBeNull();
    expect(result.issues).toHaveLength(2);
  });

  it('awards walkovers to the opponent', () => {
    expect(analyzeGame({ ...base, walkoverLoser: 'guest', sets: [] }).winner).toBe('home');
  });
});

describe('names', () => {
  it('normalizes umlauts and case', () => {
    expect(normalizeName('Schäfer,  Christian')).toBe('schafer christian');
  });

  it('strips click-tt rank prefixes', () => {
    expect(stripRankPrefix('4.1 Schäfer, Christian')).toBe('Schäfer, Christian');
    expect(stripRankPrefix('E Arnhold, Kathrin')).toBe('Arnhold, Kathrin');
    expect(stripRankPrefix('Ung, No')).toBe('Ung, No');
  });

  it('matches first names and nicknames', () => {
    expect(nameSimilarity('Tim', 'Meier, Tim')).toBe(1);
    expect(nameSimilarity('Oli', 'Frei, Oliver')).toBeGreaterThan(0.9);
    expect(bestCandidate('Tobias', ['Meier, Tim', 'Schultze, Tobias', 'Keller, Thomas'])).toEqual({
      name: 'Schultze, Tobias',
      uncertain: false,
    });
  });

  it('refuses ambiguous matches', () => {
    expect(bestCandidate('Marc', ['Meier, Marc', 'Huber, Marc'])).toBeNull();
    expect(bestCandidate('Zorro', ['Meier, Marc', 'Huber, Marc'])).toBeNull();
  });
});

describe('buildFillPlan with the example sheet', () => {
  const rosters: Rosters = {
    home: {
      teamName: 'Pinguin Zürich',
      players: ['Muster, Daniel', 'Meier, Tim', 'Schultze, Tobias', 'Keller, Thomas'].map((name) => ({ name, inLineup: true })),
    },
    guest: {
      teamName: 'Buchs ZH',
      players: ['Novak, Pavel', 'Frei, Fabian', 'Oliveira, Oliver', 'Brunner, Peter'].map((name) => ({ name, inLineup: true })),
    },
  };

  it('resolves names, doubles and games without issues', () => {
    const sheet = exampleSheet();
    sheet.players.find((p) => p.position === 'A')!.rosterMatch = 'Muster, Daniel';
    const plan = buildFillPlan(sheet, rosters);

    expect(plan.lineup.home.map((e) => e.player)).toEqual(['Muster, Daniel', 'Meier, Tim', 'Schultze, Tobias']);
    expect(plan.lineup.guest.map((e) => e.player)).toEqual(['Novak, Pavel', 'Frei, Fabian', 'Oliveira, Oliver']);
    expect(plan.doubles).toEqual({ home: ['A', 'C'], guest: ['X', 'Z'] });
    expect(plan.warnings).toEqual([]);
    expect(plan.games.flatMap((g) => g.issues)).toEqual([]);
    expect(plan.games[2]).toMatchObject({ walkoverLoser: 'guest', sets: [] });
  });

  it('uses learned names before anything else', () => {
    const plan = buildFillPlan(exampleSheet(), rosters, { 'pinguin zurich': { dane: 'Keller, Thomas' } });
    expect(plan.lineup.home[0]).toMatchObject({ player: 'Keller, Thomas', uncertain: false });
  });

  it('does not enter invalid set scores and reports total mismatches', () => {
    const sheet = exampleSheet();
    sheet.games[1]!.sets[0] = { home: 11, guest: 10, uncertain: false };
    sheet.totalHome = 6;
    sheet.totalGuest = 4;
    const plan = buildFillPlan(sheet, rosters);

    expect(plan.games[1]!.sets[0]).toMatchObject({ enter: false });
    expect(plan.games[1]!.issues.join()).toContain('Ungültiges Satzresultat');
    expect(plan.warnings.join()).not.toContain('Total'); // game 2 is incomplete now
  });

  it('reports a total that contradicts the games', () => {
    const sheet = exampleSheet();
    sheet.totalHome = 6;
    sheet.totalGuest = 4;
    expect(buildFillPlan(sheet, rosters).warnings.join()).toContain('Total auf dem Matchblatt (6:4)');
  });
});
