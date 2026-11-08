import { z } from 'zod';

/**
 * Structured output returned by Claude for a photographed match sheet.
 * Field descriptions are part of the JSON schema sent to the model, so they
 * double as extraction instructions.
 */

const positionEnum = z.enum(['A', 'B', 'C', 'X', 'Y', 'Z']);
const homePositionEnum = z.enum(['A', 'B', 'C']);
const guestPositionEnum = z.enum(['X', 'Y', 'Z']);
const sideOrNone = z.enum(['none', 'home', 'guest']);

export const sheetPlayerSchema = z.object({
  position: positionEnum,
  writtenName: z
    .string()
    .describe('Final (not crossed out) name as handwritten on the sheet. Empty string if the field is empty.'),
  crossedOutNames: z.array(z.string()).describe('Names written in this field but crossed out.'),
  rosterMatch: z
    .string()
    .nullable()
    .describe(
      'Exact name from the candidate list of this team that the written name refers to, or null if no candidate fits confidently.',
    ),
  nameUncertain: z.boolean().describe('True if the handwriting or the roster match is uncertain.'),
});

export const sheetSetSchema = z.object({
  home: z.number().int().describe('Points of the home side (left number).'),
  guest: z.number().int().describe('Points of the guest side (right number).'),
  uncertain: z.boolean().describe('True if any digit of this set score is hard to read.'),
});

export const sheetGameSchema = z.object({
  number: z.number().int().describe('Game number 1-10 as printed on the sheet.'),
  sets: z
    .array(sheetSetSchema)
    .describe('Filled set scores in order. Omit empty set fields. Empty array for walkovers without scores.'),
  walkoverLoser: sideOrNone.describe(
    'Side that did not play this game ("w.o." / walkover); the other side won. "none" if the game was played.',
  ),
  retiredSide: sideOrNone.describe('Side that retired (gave up) during the game, "none" otherwise.'),
  setsWonHome: z.number().int().nullable().describe('Number in the left "Sätze" column, null if empty.'),
  setsWonGuest: z.number().int().nullable().describe('Number in the right "Sätze" column, null if empty.'),
  winnerWritten: z.string().describe('Text in the "Sieger" column, e.g. a first name, team name or "w.o.".'),
});

export const sheetSchema = z.object({
  homeTeam: z.string().describe('Handwritten home team ("Heimmannschaft").'),
  guestTeam: z.string().describe('Handwritten guest team ("Gastmannschaft").'),
  players: z.array(sheetPlayerSchema).describe('Exactly six entries: positions A, B, C, X, Y, Z.'),
  homeDoubles: z.array(homePositionEnum).describe('Positions of the two home doubles players ("Doppelspieler").'),
  guestDoubles: z.array(guestPositionEnum).describe('Positions of the two guest doubles players.'),
  games: z.array(sheetGameSchema).describe('Exactly ten entries, games 1 to 10 in printed order.'),
  totalHome: z.number().int().nullable().describe('Home total in the "Punkte" column, null if empty.'),
  totalGuest: z.number().int().nullable().describe('Guest total in the "Punkte" column, null if empty.'),
  notes: z.string().describe('Anything unusual worth telling the user (corrections, unreadable areas). Empty if none.'),
});

export type RecognizedSheet = z.infer<typeof sheetSchema>;
export type RecognizedPlayer = z.infer<typeof sheetPlayerSchema>;
export type RecognizedGame = z.infer<typeof sheetGameSchema>;
export type RecognizedSet = z.infer<typeof sheetSetSchema>;
