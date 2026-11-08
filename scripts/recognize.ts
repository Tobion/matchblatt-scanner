/**
 * Runs the recognition on a photo from the command line and optionally
 * compares it with a manual transcription.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... npm run recognize -- fixtures/example_filled_matchresult.jpg \
 *     --expect test/data/example-sheet.json [--model claude-opus-5-5] [--effort medium] [--rosters rosters.json]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { parseArgs } from 'node:util';
import type { Rosters } from '../src/domain/model';
import { buildFillPlan } from '../src/domain/plan';
import { recognizeSheet, type Effort, type ImageMediaType } from '../src/recognition/claude';
import { sheetSchema, type RecognizedSheet } from '../src/recognition/schema';
import { DEFAULT_MODEL } from '../src/recognition/models';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MEDIA_TYPES: Record<string, ImageMediaType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    expect: { type: 'string' },
    model: { type: 'string', default: DEFAULT_MODEL },
    effort: { type: 'string', default: 'medium' },
    rosters: { type: 'string' },
  },
});

const imagePath = positionals[0];
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!imagePath) fail('Usage: npm run recognize -- <image> [--expect sheet.json] [--model id] [--effort low|medium|high]');
if (!apiKey) fail('Please set ANTHROPIC_API_KEY.');

const mediaType = MEDIA_TYPES[extname(imagePath).toLowerCase()];
if (!mediaType) fail(`Unsupported image type: ${imagePath}`);
const image = readFileSync(imagePath);
if (image.byteLength * 4 / 3 > MAX_IMAGE_BYTES) fail('Image too large for the API (max. ~3.7 MB file size); please downscale it.');

const rosters: Rosters = values.rosters
  ? (JSON.parse(readFileSync(values.rosters, 'utf8')) as Rosters)
  : { home: { teamName: 'Heim', players: [] }, guest: { teamName: 'Gast', players: [] } };

const started = Date.now();
const result = await recognizeSheet(
  { imageBase64: image.toString('base64'), mediaType, rosters },
  { apiKey, model: values.model, effort: values.effort as Effort },
);
const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`Model ${result.model}, ${seconds}s, ${result.usage.inputTokens} input / ${result.usage.outputTokens} output tokens`);

mkdirSync('scripts/out', { recursive: true });
const outPath = `scripts/out/${basename(imagePath, extname(imagePath))}.json`;
writeFileSync(outPath, JSON.stringify(result.sheet, null, 2));
console.log(`Recognized sheet written to ${outPath}`);

const plan = buildFillPlan(result.sheet, rosters);
const problems = [...plan.warnings, ...plan.games.flatMap((g) => g.issues.map((i) => `Spiel ${g.index + 1}: ${i}`))];
console.log(problems.length ? `Plausibility issues:\n  ${problems.join('\n  ')}` : 'No plausibility issues.');

if (values.expect) {
  const expected = sheetSchema.parse(JSON.parse(readFileSync(values.expect, 'utf8')));
  const differences = compare(expected, result.sheet);
  console.log(differences.length ? `Differences to ${values.expect}:\n  ${differences.join('\n  ')}` : `Matches ${values.expect} exactly.`);
  process.exitCode = differences.length ? 1 : 0;
}

function compare(expected: RecognizedSheet, actual: RecognizedSheet): string[] {
  const diffs: string[] = [];
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  for (const want of expected.players) {
    const got = actual.players.find((p) => p.position === want.position);
    if (!got || !same(got.writtenName, want.writtenName)) {
      diffs.push(`Player ${want.position}: expected "${want.writtenName}", got "${got?.writtenName ?? '-'}"`);
    }
  }
  const pair = (list: RecognizedSheet['homeDoubles']) =>
    list.map((d) => d.position ?? d.writtenName.trim().toLowerCase()).sort().join('+');
  if (pair(expected.homeDoubles) !== pair(actual.homeDoubles)) diffs.push(`Home doubles: expected ${pair(expected.homeDoubles)}, got ${pair(actual.homeDoubles)}`);
  if (pair(expected.guestDoubles) !== pair(actual.guestDoubles)) diffs.push(`Guest doubles: expected ${pair(expected.guestDoubles)}, got ${pair(actual.guestDoubles)}`);

  for (const want of expected.games) {
    const got = actual.games.find((g) => g.number === want.number);
    if (!got) {
      diffs.push(`Game ${want.number}: missing`);
      continue;
    }
    const scores = (sets: { home: number; guest: number }[]) => sets.map((s) => `${s.home}:${s.guest}`).join(' ');
    if (scores(want.sets) !== scores(got.sets)) diffs.push(`Game ${want.number} sets: expected ${scores(want.sets)}, got ${scores(got.sets)}`);
    if (want.walkoverLoser !== got.walkoverLoser) diffs.push(`Game ${want.number} walkover: expected ${want.walkoverLoser}, got ${got.walkoverLoser}`);
  }
  if (expected.totalHome !== actual.totalHome || expected.totalGuest !== actual.totalGuest) {
    diffs.push(`Total: expected ${expected.totalHome}:${expected.totalGuest}, got ${actual.totalHome}:${actual.totalGuest}`);
  }
  return diffs;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
