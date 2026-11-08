/**
 * Domain model of the Swiss table tennis team championship match sheet
 * ("Matchblatt Mannschaftsmeisterschaft"): 3 vs 3 players, 9 singles and
 * 1 doubles, best of 5 sets.
 */

export type Side = 'home' | 'guest';

export type HomePosition = 'A' | 'B' | 'C';
export type GuestPosition = 'X' | 'Y' | 'Z';
export type Position = HomePosition | GuestPosition;

export const HOME_POSITIONS: readonly HomePosition[] = ['A', 'B', 'C'];
export const GUEST_POSITIONS: readonly GuestPosition[] = ['X', 'Y', 'Z'];

export function positionsOf(side: Side): readonly Position[] {
  return side === 'home' ? HOME_POSITIONS : GUEST_POSITIONS;
}

export interface SinglesGame {
  kind: 'singles';
  home: HomePosition;
  guest: GuestPosition;
}

export interface DoublesGame {
  kind: 'doubles';
}

export type GameDefinition = SinglesGame | DoublesGame;

/** Fixed game order, identical on the paper sheet and in click-tt. */
export const GAME_ORDER: readonly GameDefinition[] = [
  { kind: 'singles', home: 'A', guest: 'X' },
  { kind: 'singles', home: 'B', guest: 'Y' },
  { kind: 'singles', home: 'C', guest: 'Z' },
  { kind: 'singles', home: 'B', guest: 'X' },
  { kind: 'singles', home: 'A', guest: 'Z' },
  { kind: 'singles', home: 'C', guest: 'Y' },
  { kind: 'doubles' },
  { kind: 'singles', home: 'B', guest: 'Z' },
  { kind: 'singles', home: 'C', guest: 'X' },
  { kind: 'singles', home: 'A', guest: 'Y' },
];

/** Row label as used by click-tt in the result entry table ("A-X", "Doppel"). */
export function gameLabel(game: GameDefinition): string {
  return game.kind === 'doubles' ? 'Doppel' : `${game.home}-${game.guest}`;
}

export const SETS_TO_WIN = 3;
export const MAX_SETS = 5;
export const POINTS_TO_WIN_SET = 11;

export interface SetScore {
  home: number;
  guest: number;
}

/** A player of a team as listed in click-tt ("Nachname, Vorname"). */
export interface RosterPlayer {
  /** Display name exactly as click-tt shows it, without rank prefix. */
  name: string;
  /** Whether the player is currently in the lineup table (vs. the selection list). */
  inLineup: boolean;
}

export interface TeamRoster {
  teamName: string;
  players: RosterPlayer[];
}

export interface Rosters {
  home: TeamRoster;
  guest: TeamRoster;
}
