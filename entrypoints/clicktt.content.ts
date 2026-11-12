import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import type { Side } from '../src/domain/model';
import { learnFromChoices } from '../src/domain/learn';
import { buildFillPlan, doublesOnlyEntries } from '../src/domain/plan';
import { RecognitionError } from '../src/recognition/errors';
import { requestRecognition } from '../src/recognition/client';
import { prepareImage } from '../src/recognition/image';
import { detectStep, matchKey } from '../src/clicktt/page';
import {
  assignPositions,
  nextLineupAction,
  performReloadingAction,
  readLineupSections,
  readRosters,
} from '../src/clicktt/lineup';
import { fillResults, getResultsForm, readChosenPlayers, readResultRows } from '../src/clicktt/results';
import { ambiguityHint, clearMarks, markField, mountStatusBar, type StatusBar } from '../src/clicktt/ui';
import {
  clearPending,
  loadLearnedNames,
  loadPending,
  loadSettings,
  saveLearnedNames,
  savePending,
  type PendingFill,
} from '../src/settings';

/** Upper bound for delete/insert round trips in step 1 (normally at most 4). */
const MAX_LINEUP_ACTIONS = 6;

const SIDE_LABEL: Record<Side, string> = { home: 'Heim', guest: 'Gast' };

export default defineContentScript({
  matches: ['*://click-tt.ch/cgi-bin/WebObjects/nuLigaTTCH.woa/*', '*://*.click-tt.ch/cgi-bin/WebObjects/nuLigaTTCH.woa/*'],
  runAt: 'document_idle',
  main() {
    void run().catch((error) => console.error('[Matchblatt-Scanner]', error));
  },
});

async function run(): Promise<void> {
  const step = detectStep(document);
  const key = matchKey(document);
  if (!step || !key) return;

  const bar = mountStatusBar(document);
  let pending = await loadPending();
  if (pending && pending.matchKey !== key) pending = null;

  if (step === 'lineup') {
    bar.enablePhotoButton((file) => void startFromPhoto(file, key, bar));
    if (pending?.phase === 'lineup') await continueLineup(pending, bar);
    else bar.setStatus('info', 'Foto des ausgefüllten Matchblatts wählen, um die Begegnung automatisch zu erfassen.');
    return;
  }

  if (step === 'results') {
    if (pending && pending.phase !== 'lineup') await fillResultsStep(pending, bar);
    else bar.setStatus('info', 'Zum Einlesen eines Matchblatt-Fotos bitte bei Schritt 1 (Mannschaftsaufstellung) beginnen.');
    return;
  }

  if (pending) {
    await clearPending();
    bar.setStatus('success', 'Bitte den Spielbericht mit dem Matchblatt vergleichen und anschliessend bestätigen.');
  } else {
    document.getElementById('ttfm-bar')?.remove();
  }
}

async function startFromPhoto(file: File, key: string, bar: StatusBar): Promise<void> {
  bar.disablePhotoButton();
  try {
    const settings = await loadSettings();
    if (!settings.apiKey) {
      bar.setStatus('error', 'Kein Claude-API-Key hinterlegt. Bitte zuerst in den Einstellungen der Erweiterung eintragen.');
      void browser.runtime.sendMessage({ type: 'openOptions' }).catch(() => undefined);
      return;
    }
    const rosters = readRosters(readLineupSections(document));
    if (!rosters) {
      bar.setStatus('error', 'Die Mannschaftsaufstellung auf dieser Seite konnte nicht gelesen werden.');
      return;
    }

    bar.setStatus('busy', 'Foto wird ausgewertet… (kann bis zu einer Minute dauern)');
    const image = await prepareImage(file);
    const { sheet } = await requestRecognition({ imageBase64: image.base64, mediaType: image.mediaType, rosters });
    const plan = buildFillPlan(sheet, rosters, await loadLearnedNames());
    const pending: PendingFill = { matchKey: key, plan, phase: 'lineup', lineupActions: 0, createdAt: Date.now() };
    await savePending(pending);
    await continueLineup(pending, bar);
  } catch (error) {
    const message = error instanceof RecognitionError || error instanceof Error ? error.message : String(error);
    bar.setStatus('error', `Fehler: ${message}`);
  } finally {
    bar.enablePhotoButton((f) => void startFromPhoto(f, key, bar));
  }
}

async function continueLineup(pending: PendingFill, bar: StatusBar): Promise<void> {
  const sections = readLineupSections(document);
  if (sections.length !== 2) {
    bar.setStatus('error', 'Die Mannschaftsaufstellung auf dieser Seite konnte nicht gelesen werden.');
    return;
  }

  const action = nextLineupAction(sections, pending.plan);
  if (action.kind !== 'assign' && pending.lineupActions < MAX_LINEUP_ACTIONS) {
    bar.setStatus('busy', action.kind === 'delete' ? 'Spieler werden entfernt…' : 'Spieler werden eingefügt…');
    await savePending({ ...pending, lineupActions: pending.lineupActions + 1 });
    performReloadingAction(action);
    return;
  }

  clearMarks(document);
  const { missing } = assignPositions(sections, pending.plan);
  const problems: string[] = [];
  for (const m of missing) {
    const section = sections.find((s) => s.side === m.side)!;
    const label = `${SIDE_LABEL[m.side]} ${m.position}: „${m.writtenName || '(leer)'}“`;
    const text = m.player
      ? `${label} = ${m.player} – bitte aus der Liste einfügen`
      : m.alternatives.length
        ? `${label} ${ambiguityHint(m.alternatives)} – bitte richtigen Spieler wählen`
        : `${label} nicht gefunden – bitte Spieler wählen`;
    problems.push(text);
    // For an ambiguous name mark the candidates already in the lineup, and the
    // selection list only if further candidates are there.
    const candidateRows = m.player ? [] : section.rows.filter((r) => m.alternatives.includes(r.player));
    for (const row of candidateRows) markField(row.positionSelect, `Matchblatt: „${m.writtenName}“ – dieser Spieler?`);
    const inList = !m.alternatives.length || m.player || candidateRows.length < m.alternatives.length;
    if (section.list && inList) markField(section.list, text);
  }
  for (const side of ['home', 'guest'] as const) {
    if (!pending.plan.doubles[side]) problems.push(`${SIDE_LABEL[side]}: Doppel bitte selbst wählen`);
  }
  for (const section of sections) {
    const plan = pending.plan;
    const uncertain = [
      ...plan.lineup[section.side].map((entry) => ({ entry, doublesOnly: false })),
      ...doublesOnlyEntries(plan, section.side).map((entry) => ({ entry, doublesOnly: true })),
    ].filter(({ entry }) => entry.player && entry.uncertain);
    for (const { entry, doublesOnly } of uncertain) {
      const row = section.rows.find((r) => r.player === entry.player);
      const field = doublesOnly ? row?.doublesSelect : row?.positionSelect;
      if (field) markField(field, `Matchblatt: „${entry.writtenName}“ – bitte prüfen`);
    }
  }

  await savePending({ ...pending, phase: 'results' });
  if (problems.length) {
    bar.setStatus('warning', 'Aufstellung teilweise ausgefüllt. Bitte markierte Stellen ergänzen und dann „Weiter“ klicken.', [
      ...problems,
      ...pending.plan.warnings,
    ]);
    return;
  }
  bar.setStatus('busy', 'Aufstellung ausgefüllt, weiter zur Erfassung…');
  sections[0]!.rows[0]?.positionSelect.form?.querySelector<HTMLInputElement>('input[type="submit"][value^="Weiter"]')?.click();
}

async function fillResultsStep(pending: PendingFill, bar: StatusBar): Promise<void> {
  const rows = readResultRows(document);
  if (rows.length !== 10) {
    bar.setStatus('error', `Die Ergebnistabelle konnte nicht gelesen werden (${rows.length} von 10 Spielen gefunden).`);
    return;
  }

  // Fill only once; afterwards the user may have edited values already.
  if (pending.phase === 'results') {
    clearMarks(document);
    const marks = fillResults(rows, pending.plan);
    for (const mark of marks) markField(mark.element, mark.message);
    await savePending({ ...pending, phase: 'filled' });

    const tone = marks.length || pending.plan.warnings.length ? 'warning' : 'success';
    const summary = marks.length
      ? `10 Spiele eingetragen, ${marks.length} Stelle(n) markiert – bitte prüfen und dann „Weiter“ klicken.`
      : '10 Spiele eingetragen. Bitte prüfen und dann „Weiter“ klicken.';
    bar.setStatus(tone, summary, pending.plan.warnings);
  } else {
    bar.setStatus('info', 'Resultate wurden bereits eingetragen. Bitte prüfen und dann „Weiter“ klicken.', pending.plan.warnings);
  }

  // Loaded upfront: on submit the page unloads, so only a single write can be issued there.
  const learned = await loadLearnedNames();
  getResultsForm(document)?.addEventListener('submit', () => {
    learnFromChoices(learned, pending.plan, readChosenPlayers(rows));
    void saveLearnedNames(learned);
  });
}
