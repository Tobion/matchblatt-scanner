import type { RecognizedDoublesPlayer, RecognizedSheet } from '../recognition/schema';
import {
  GAME_ORDER,
  positionsOf,
  type GameDefinition,
  type Position,
  type Rosters,
  type SetScore,
  type Side,
} from './model';
import { ambiguousCandidates, bestCandidate, normalizeName } from './names';
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
  /** The two doubles players per side, null if not determinable. */
  doubles: Record<Side, DoublesEntry[] | null>;
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
  /** Roster players the written name fits equally well (e.g. a shared first name); empty if unambiguous. */
  alternatives: string[];
}

export interface DoublesEntry {
  /** Singles position of the player, null for a doubles-only player. */
  position: Position | null;
  writtenName: string;
  player: string | null;
  uncertain: boolean;
  alternatives: string[];
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
    home: resolveDoubles('home', sheet.homeDoubles, lineup.home, rosters, learned, warnings),
    guest: resolveDoubles('guest', sheet.guestDoubles, lineup.guest, rosters, learned, warnings),
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

interface NameResolution {
  player: string | null;
  uncertain: boolean;
  alternatives: string[];
}

/**
 * Maps a handwritten name to a click-tt player: learned mapping, then model,
 * then fuzzy match. A name that fits several players equally well (e.g. a
 * first name shared by two players) is never resolved automatically, not even
 * by a learned mapping: which of them played can differ from match to match,
 * so the user has to pick the player.
 */
function resolveName(
  writtenName: string,
  rosterMatch: string | null,
  nameUncertain: boolean,
  side: Side,
  rosters: Rosters,
  learned: LearnedNames,
): NameResolution {
  if (!writtenName) return { player: null, uncertain: true, alternatives: [] };
  const roster = rosters[side];
  const candidates = roster.players.map((p) => p.name);
  const byNormalized = new Map(candidates.map((name) => [normalizeName(name), name]));
  const alternatives = ambiguousCandidates(writtenName, candidates);
  if (alternatives.length) return { player: null, uncertain: true, alternatives };

  const learnedName = learned[learnedKey(roster.teamName)]?.[learnedKey(writtenName)];
  if (learnedName && byNormalized.has(normalizeName(learnedName))) {
    return { player: byNormalized.get(normalizeName(learnedName))!, uncertain: false, alternatives: [] };
  }

  const local = bestCandidate(writtenName, candidates);
  const modelMatch = rosterMatch ? byNormalized.get(normalizeName(rosterMatch)) : undefined;
  if (modelMatch) {
    // Uncertain if the model says so or local fuzzy matching prefers someone else.
    const disagrees = local !== null && local.name !== modelMatch;
    return { player: modelMatch, uncertain: nameUncertain || disagrees, alternatives: [] };
  }
  if (local) return { player: local.name, uncertain: local.uncertain, alternatives: [] };
  return { player: null, uncertain: true, alternatives: [] };
}

function resolveLineup(side: Side, sheet: RecognizedSheet, rosters: Rosters, learned: LearnedNames): LineupEntry[] {
  const entries: LineupEntry[] = positionsOf(side).map((position) => {
    const recognized = sheet.players.find((p) => p.position === position);
    const writtenName = recognized?.writtenName.trim() ?? '';
    const resolved = resolveName(
      writtenName,
      recognized?.rosterMatch ?? null,
      recognized?.nameUncertain ?? true,
      side,
      rosters,
      learned,
    );
    return { position, writtenName, ...resolved };
  });

  // The same player cannot play two positions: drop such ambiguous matches.
  for (const entry of entries) {
    if (entry.player && entries.filter((e) => e.player === entry.player).length > 1) {
      entry.player = null;
      entry.uncertain = true;
      entry.alternatives = [];
    }
  }
  return entries;
}

/**
 * Doubles players are usually singles players (given by position or name),
 * but can also be players who only play doubles and must be added to the lineup.
 */
function resolveDoubles(
  side: Side,
  recognized: RecognizedDoublesPlayer[],
  lineup: LineupEntry[],
  rosters: Rosters,
  learned: LearnedNames,
  warnings: string[],
): DoublesEntry[] | null {
  const label = side === 'home' ? 'Heim' : 'Gast';
  const entries = recognized.map((doubles): DoublesEntry => {
    const writtenName = doubles.writtenName.trim();
    const singles = lineup.find((e) => e.position === doubles.position);
    if (singles) {
      return {
        position: singles.position,
        writtenName: writtenName || singles.writtenName,
        player: singles.player,
        uncertain: singles.uncertain,
        alternatives: singles.alternatives,
      };
    }
    const resolved = resolveName(writtenName, doubles.rosterMatch, doubles.nameUncertain, side, rosters, learned);
    // A name that turns out to be a singles player refers to that position.
    const asSingles = resolved.player ? lineup.find((e) => e.player === resolved.player) : undefined;
    return { position: asSingles?.position ?? null, writtenName, ...resolved };
  });

  const keys = entries.map((e) => e.position ?? e.player ?? `?${e.writtenName}`);
  if (entries.length !== 2 || new Set(keys).size !== 2 || entries.some((e) => !e.position && !e.writtenName)) {
    warnings.push(`${label}: Doppelspieler konnten nicht eindeutig gelesen werden.`);
    return null;
  }
  return entries;
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
  return plan.doubles[side]?.map((e) => e.player) ?? null;
}

/** Doubles entries of players who play no singles. */
export function doublesOnlyEntries(plan: FillPlan, side: Side): DoublesEntry[] {
  return plan.doubles[side]?.filter((e) => e.position === null) ?? [];
}

/** All players that must be in the click-tt lineup of a side (singles and doubles-only). */
export function requiredPlayers(plan: FillPlan, side: Side): { players: string[]; complete: boolean } {
  const entries = [...plan.lineup[side], ...doublesOnlyEntries(plan, side)];
  return {
    players: entries.map((e) => e.player).filter((p): p is string => !!p),
    complete: entries.every((e) => e.player) && plan.doubles[side] !== null,
  };
}

export function playerAt(plan: FillPlan, side: Side, position: Position): LineupEntry | undefined {
  return plan.lineup[side].find((e) => e.position === position);
}
