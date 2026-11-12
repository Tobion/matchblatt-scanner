import { positionsOf, type Position, type Side } from './model';
import { normalizeName } from './names';
import {
  doublesOnlyEntries,
  learnedKey,
  type DoublesEntry,
  type FillPlan,
  type LearnedNames,
  type LineupEntry,
} from './plan';

/** Players the user finally selected in click-tt (step 2). */
export interface ChosenPlayers {
  /** Player per position from the singles rows. */
  singles: Record<Side, Partial<Record<Position, string>>>;
  /** The players selected in the doubles row. */
  doubles: Record<Side, string[]>;
}

/**
 * Remembers corrections (mutates `learned`): a handwritten name is only stored
 * if the user chose a different player than proposed, or filled in a name that
 * could not be resolved. Names that fit several roster players are skipped, as
 * learned mappings are never used for them.
 */
export function learnFromChoices(learned: LearnedNames, plan: FillPlan, chosen: ChosenPlayers): void {
  for (const side of ['home', 'guest'] as const) {
    const corrections: Record<string, string> = {};
    const learn = (entry: LineupEntry | DoublesEntry | undefined, player: string | undefined) => {
      if (!entry?.writtenName || !player || entry.alternatives.length) return;
      if (entry.player && normalizeName(entry.player) === normalizeName(player)) return;
      corrections[learnedKey(entry.writtenName)] = player;
    };

    for (const position of positionsOf(side)) {
      learn(
        plan.lineup[side].find((e) => e.position === position),
        chosen.singles[side][position],
      );
    }

    // A doubles-only player is the doubles player who plays no singles; only
    // unambiguous with a single such player.
    const doublesOnly = doublesOnlyEntries(plan, side);
    const singlesPlayers = Object.values(chosen.singles[side]).map(normalizeName);
    const extra = chosen.doubles[side].filter((p) => !singlesPlayers.includes(normalizeName(p)));
    if (doublesOnly.length === 1 && extra.length === 1) learn(doublesOnly[0], extra[0]);

    if (Object.keys(corrections).length) {
      Object.assign((learned[learnedKey(plan.teamNames[side])] ??= {}), corrections);
    }
  }
}
