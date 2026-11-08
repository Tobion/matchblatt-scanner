import { positionsOf, type Position, type Side } from './model';
import { normalizeName } from './names';
import { doublesOnlyEntries, learnedKey, type FillPlan, type LearnedNames } from './plan';

/** Players the user finally selected in click-tt (step 2). */
export interface ChosenPlayers {
  /** Player per position from the singles rows. */
  singles: Record<Side, Partial<Record<Position, string>>>;
  /** The players selected in the doubles row. */
  doubles: Record<Side, string[]>;
}

/** Remembers which click-tt player belongs to each handwritten name (mutates `learned`). */
export function learnFromChoices(learned: LearnedNames, plan: FillPlan, chosen: ChosenPlayers): void {
  for (const side of ['home', 'guest'] as const) {
    const teamLearned = (learned[learnedKey(plan.teamNames[side])] ??= {});
    for (const position of positionsOf(side)) {
      const written = plan.lineup[side].find((e) => e.position === position)?.writtenName;
      const player = chosen.singles[side][position];
      if (written && player) teamLearned[learnedKey(written)] = player;
    }

    // A doubles-only player is the doubles player who plays no singles; only
    // unambiguous with a single such player.
    const doublesOnly = doublesOnlyEntries(plan, side);
    const singlesPlayers = Object.values(chosen.singles[side]).map(normalizeName);
    const extra = chosen.doubles[side].filter((p) => !singlesPlayers.includes(normalizeName(p)));
    if (doublesOnly.length === 1 && extra.length === 1 && doublesOnly[0]!.writtenName) {
      teamLearned[learnedKey(doublesOnly[0]!.writtenName)] = extra[0]!;
    }
  }
}
