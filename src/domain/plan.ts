import type { RecognizedSheet } from '../recognition/schema';
import {
  GAME_ORDER,
  GUEST_POSITIONS,
  HOME_POSITIONS,
  type GameDefinition,
  type Position,
  type Rosters,
  type SetScore,
  type Side,
} from './model';
import { bestCandidate, normalizeName } from './names';
import { analyzeGame, formatSet, isValidSet } from './validate';

/**
 * Everything needed to fill the click-tt forms, derived from the recognized
 * sheet plus the rosters read from the page. Plain JSON so it can be stored
 * between page loads.
 */
export interface FillPlan {
  /** Team names as shown in click-tt. */
  teamNames: Record<Side, string>;
  lineup: Record<Side, LineupEntry[]>;
  /** Positions of the doubles players, null if not determinable. */
  doubles: Record<Side, Position[] | null>;
  games: GamePlan[];
  /** Problems not tied to a single field (German, shown to the user). */
  warnings: string[];
}

export interface LineupEntry {
  position: Position;
  writtenName: string;
  /** Resolved click-tt player name, null if it could not be matched. */
  player: string | null;
  uncertain: boolean;
}

export interface SetPlan {
  score: SetScore;
  /** False for set scores that break the rules; those are only shown as hint. */
  enter: boolean;
  uncertain: boolean;
}

export interface GamePlan {
  index: number;
  definition: GameDefinition;
  sets: SetPlan[];
  walkoverLoser: Side | null;
  retiredSide: Side | null;
  issues: string[];
}

/** Learned mapping: normalized team name → normalized written name → click-tt player. */
export type LearnedNames = Record<string, Record<string, string>>;

export function learnedKey(value: string): string {
  return normalizeName(value);
}

export function buildFillPlan(sheet: RecognizedSheet, rosters: Rosters, learned: LearnedNames = {}): FillPlan {
  const warnings: string[] = [];
  const lineup = {
    home: resolveLineup('home', sheet, rosters, learned),
    guest: resolveLineup('guest', sheet, rosters, learned),
  };

  const doubles = {
    home: checkDoubles(sheet.homeDoubles, 'Heim', warnings),
    guest: checkDoubles(sheet.guestDoubles, 'Gast', warnings),
  };

  const games = GAME_ORDER.map((definition, index) => planGame(definition, index, sheet, warnings));

  checkTotal(sheet, games, warnings);
  if (sheet.notes.trim()) warnings.push(`Hinweis der KI: ${sheet.notes.trim()}`);

  return {
    teamNames: { home: rosters.home.teamName, guest: rosters.guest.teamName },
    lineup,
    doubles,
    games,
    warnings,
  };
}

function resolveLineup(side: Side, sheet: RecognizedSheet, rosters: Rosters, learned: LearnedNames): LineupEntry[] {
  const roster = rosters[side];
  const candidates = roster.players.map((p) => p.name);
  const byNormalized = new Map(candidates.map((name) => [normalizeName(name), name]));
  const teamLearned = learned[learnedKey(roster.teamName)] ?? {};
  const positions = side === 'home' ? HOME_POSITIONS : GUEST_POSITIONS;

  const entries: LineupEntry[] = positions.map((position) => {
    const recognized = sheet.players.find((p) => p.position === position);
    const writtenName = recognized?.writtenName.trim() ?? '';
    if (!writtenName) return { position, writtenName, player: null, uncertain: true };

    const learnedName = teamLearned[learnedKey(writtenName)];
    if (learnedName && byNormalized.has(normalizeName(learnedName))) {
      return { position, writtenName, player: byNormalized.get(normalizeName(learnedName))!, uncertain: false };
    }

    const local = bestCandidate(writtenName, candidates);
    const modelMatch = recognized?.rosterMatch ? byNormalized.get(normalizeName(recognized.rosterMatch)) : undefined;
    if (modelMatch) {
      // Uncertain if the model says so or local fuzzy matching prefers someone else.
      const disagrees = local !== null && local.name !== modelMatch;
      return { position, writtenName, player: modelMatch, uncertain: recognized!.nameUncertain || disagrees };
    }
    if (local) return { position, writtenName, player: local.name, uncertain: local.uncertain };
    return { position, writtenName, player: null, uncertain: true };
  });

  // The same player cannot play two positions: drop such ambiguous matches.
  for (const entry of entries) {
    if (entry.player && entries.filter((e) => e.player === entry.player).length > 1) {
      entry.player = null;
      entry.uncertain = true;
    }
  }
  return entries;
}

function checkDoubles(positions: Position[], label: string, warnings: string[]): Position[] | null {
  const unique = [...new Set(positions)];
  if (unique.length !== 2) {
    warnings.push(`${label}: Doppelspieler konnten nicht eindeutig gelesen werden.`);
    return null;
  }
  return unique;
}

function planGame(definition: GameDefinition, index: number, sheet: RecognizedSheet, warnings: string[]): GamePlan {
  const recognized = sheet.games.find((g) => g.number === index + 1) ?? sheet.games[index];
  if (!recognized) {
    warnings.push(`Spiel ${index + 1} wurde auf dem Foto nicht gefunden.`);
    return { index, definition, sets: [], walkoverLoser: null, retiredSide: null, issues: ['Nicht erkannt'] };
  }

  const walkoverLoser = recognized.walkoverLoser === 'none' ? null : recognized.walkoverLoser;
  const retiredSide = recognized.retiredSide === 'none' ? null : recognized.retiredSide;
  const scores = recognized.sets.map(({ home, guest }) => ({ home, guest }));
  const analysis = analyzeGame({
    sets: scores,
    walkoverLoser,
    retiredSide,
    setsWonHome: recognized.setsWonHome,
    setsWonGuest: recognized.setsWonGuest,
  });

  const sets: SetPlan[] = walkoverLoser
    ? []
    : recognized.sets.slice(0, 5).map((set, i) => ({
        score: { home: set.home, guest: set.guest },
        enter: isValidSet(set) && !analysis.surplusSets.includes(i),
        uncertain: set.uncertain,
      }));

  const issues = [...analysis.issues];
  const uncertainSets = sets.filter((s) => s.enter && s.uncertain).map((s) => formatSet(s.score));
  if (uncertainSets.length) issues.push(`Schwer lesbar: ${uncertainSets.join(', ')}`);

  return { index, definition, sets, walkoverLoser, retiredSide, issues };
}

function checkTotal(sheet: RecognizedSheet, games: GamePlan[], warnings: string[]): void {
  if (sheet.totalHome === null || sheet.totalGuest === null) return;
  let home = 0;
  let guest = 0;
  for (const game of games) {
    const winner = gameWinner(game);
    if (winner === 'home') home++;
    else if (winner === 'guest') guest++;
    else return; // Incomplete games make the comparison meaningless.
  }
  if (home !== sheet.totalHome || guest !== sheet.totalGuest) {
    warnings.push(
      `Total auf dem Matchblatt (${sheet.totalHome}:${sheet.totalGuest}) passt nicht zu den erkannten Spielen (${home}:${guest}).`,
    );
  }
}

function gameWinner(game: GamePlan): Side | null {
  return analyzeGame({
    sets: game.sets.filter((s) => s.enter).map((s) => s.score),
    walkoverLoser: game.walkoverLoser,
    retiredSide: game.retiredSide,
    setsWonHome: null,
    setsWonGuest: null,
  }).winner;
}

/** Players of a side that are in the doubles, as click-tt names (null if unknown). */
export function doublesPlayers(plan: FillPlan, side: Side): (string | null)[] | null {
  const positions = plan.doubles[side];
  if (!positions) return null;
  return positions.map((pos) => plan.lineup[side].find((e) => e.position === pos)?.player ?? null);
}

export function playerAt(plan: FillPlan, side: Side, position: Position): LineupEntry | undefined {
  return plan.lineup[side].find((e) => e.position === position);
}
