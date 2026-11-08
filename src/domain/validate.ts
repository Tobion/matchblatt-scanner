import { POINTS_TO_WIN_SET, SETS_TO_WIN, type SetScore, type Side } from './model';

/** Table tennis set rule: 11 points with a lead of 2; after 10:10 exactly 2 ahead. */
export function isValidSet(score: SetScore): boolean {
  const { home, guest } = score;
  if (!Number.isInteger(home) || !Number.isInteger(guest) || home < 0 || guest < 0) return false;
  const max = Math.max(home, guest);
  const diff = Math.abs(home - guest);
  if (max < POINTS_TO_WIN_SET) return false;
  if (max === POINTS_TO_WIN_SET) return diff >= 2;
  return diff === 2;
}

export function setWinner(score: SetScore): Side {
  return score.home > score.guest ? 'home' : 'guest';
}

export interface GameInput {
  sets: SetScore[];
  walkoverLoser: Side | null;
  retiredSide: Side | null;
  /** Values of the "Sätze" column on the sheet, if readable. */
  setsWonHome: number | null;
  setsWonGuest: number | null;
}

export interface GameAnalysis {
  /** Index into `sets` of every set that violates the set rule. */
  invalidSets: number[];
  /** Index of sets that were played after the game was already decided. */
  surplusSets: number[];
  winner: Side | null;
  setsWonHome: number;
  setsWonGuest: number;
  /** Human-readable problems (German, shown to the user). */
  issues: string[];
}

export function analyzeGame(game: GameInput): GameAnalysis {
  const analysis: GameAnalysis = {
    invalidSets: [],
    surplusSets: [],
    winner: null,
    setsWonHome: 0,
    setsWonGuest: 0,
    issues: [],
  };

  if (game.walkoverLoser) {
    analysis.winner = game.walkoverLoser === 'home' ? 'guest' : 'home';
    return analysis;
  }

  game.sets.forEach((set, index) => {
    if (analysis.winner) {
      analysis.surplusSets.push(index);
      return;
    }
    if (!isValidSet(set)) {
      analysis.invalidSets.push(index);
      return;
    }
    if (setWinner(set) === 'home') analysis.setsWonHome++;
    else analysis.setsWonGuest++;
    if (analysis.setsWonHome === SETS_TO_WIN) analysis.winner = 'home';
    if (analysis.setsWonGuest === SETS_TO_WIN) analysis.winner = 'guest';
  });

  if (analysis.invalidSets.length) {
    const list = analysis.invalidSets.map((i) => `${i + 1}. Satz ${formatSet(game.sets[i]!)}`).join(', ');
    analysis.issues.push(`Ungültiges Satzresultat: ${list}`);
  }
  if (analysis.surplusSets.length) {
    analysis.issues.push('Mehr Sätze als nötig eingetragen');
  }
  if (game.retiredSide) {
    // A retired game ends early; the opponent of the retiring side wins.
    analysis.winner = game.retiredSide === 'home' ? 'guest' : 'home';
  } else if (!analysis.winner && !analysis.invalidSets.length) {
    analysis.issues.push('Spiel unvollständig (kein Spieler hat 3 Sätze gewonnen)');
  }

  const sheetHasSetCount = game.setsWonHome !== null && game.setsWonGuest !== null;
  if (
    sheetHasSetCount &&
    !analysis.invalidSets.length &&
    !game.retiredSide &&
    (game.setsWonHome !== analysis.setsWonHome || game.setsWonGuest !== analysis.setsWonGuest)
  ) {
    analysis.issues.push(
      `Sätze-Spalte (${game.setsWonHome}:${game.setsWonGuest}) passt nicht zu den Satzresultaten (${analysis.setsWonHome}:${analysis.setsWonGuest})`,
    );
  }
  return analysis;
}

export function formatSet(score: SetScore): string {
  return `${score.home}:${score.guest}`;
}
