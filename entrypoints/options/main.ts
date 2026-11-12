import { MODEL_CHOICES, loadLearnedNames, loadSettings, saveLearnedNames, saveSettings, type Settings } from '../../src/settings';
import { cleanApiKey, looksLikeApiKey, verifyApiKey, type Effort } from '../../src/recognition/claude';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = byId<HTMLFormElement>('settings');
const apiKey = byId<HTMLInputElement>('apiKey');
const keyInfo = byId<HTMLDivElement>('keyInfo');
const testResult = byId<HTMLSpanElement>('testResult');
const model = byId<HTMLSelectElement>('model');
const effort = byId<HTMLSelectElement>('effort');
const saved = byId<HTMLSpanElement>('saved');

for (const choice of MODEL_CHOICES) model.add(new Option(choice.label, choice.id));

const settings = await loadSettings();
apiKey.value = settings.apiKey;
if (![...model.options].some((o) => o.value === settings.model)) model.add(new Option(settings.model, settings.model));
model.value = settings.model;
effort.value = settings.effort;
showKeyInfo(settings.apiKey);

/** Shows a masked version so the user can compare it with the key in the console. */
function showKeyInfo(key: string): void {
  keyInfo.textContent = key
    ? `Gespeichert: ${key.slice(0, 10)}…${key.slice(-4)} (${key.length} Zeichen)`
    : 'Noch kein Key gespeichert.';
}

function setResult(element: HTMLElement, ok: boolean, text: string): void {
  element.className = ok ? 'ok' : 'error';
  element.textContent = text;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const key = cleanApiKey(apiKey.value);
  if (key && !looksLikeApiKey(key)) {
    setResult(saved, false, 'Das sieht nicht wie ein Claude-API-Key aus (beginnt mit „sk-ant-“).');
    return;
  }
  apiKey.value = key;
  const next: Settings = { apiKey: key, model: model.value, effort: effort.value as Effort };
  await saveSettings(next);
  showKeyInfo(key);
  setResult(saved, true, 'Gespeichert.');
  setTimeout(() => (saved.textContent = ''), 2000);
});

byId<HTMLButtonElement>('testKey').addEventListener('click', async () => {
  const key = cleanApiKey(apiKey.value);
  if (!looksLikeApiKey(key)) {
    setResult(testResult, false, 'Das sieht nicht wie ein Claude-API-Key aus (beginnt mit „sk-ant-“).');
    return;
  }
  testResult.className = '';
  testResult.textContent = 'Wird geprüft…';
  try {
    await verifyApiKey(key);
    setResult(testResult, true, 'Key funktioniert.');
  } catch (error) {
    setResult(testResult, false, error instanceof Error ? error.message : String(error));
  }
});

const learnedList = byId<HTMLDivElement>('learnedNames');
const forgetAll = byId<HTMLButtonElement>('forgetNames');

/** Lists the learned mappings per team (names as stored: normalized, without umlauts). */
async function renderLearnedNames(): Promise<void> {
  const learned = await loadLearnedNames();
  const teams = Object.entries(learned)
    .filter(([, names]) => Object.keys(names).length)
    .sort(([a], [b]) => a.localeCompare(b));
  forgetAll.hidden = !teams.length;
  if (!teams.length) {
    learnedList.innerHTML = '<p class="hint">Noch keine Zuordnungen gelernt.</p>';
    return;
  }

  learnedList.replaceChildren(
    ...teams.flatMap(([team, names]) => {
      const heading = document.createElement('h3');
      heading.textContent = team;
      const table = document.createElement('table');
      table.className = 'names';
      table.innerHTML = '<tr><th>Auf dem Matchblatt</th><th>click-tt-Spieler</th><th></th></tr>';
      for (const [written, player] of Object.entries(names).sort(([a], [b]) => a.localeCompare(b))) {
        const row = table.insertRow();
        row.insertCell().textContent = written;
        row.insertCell().textContent = player;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Löschen';
        remove.addEventListener('click', async () => {
          const current = await loadLearnedNames();
          if (current[team]) {
            delete current[team][written];
            if (!Object.keys(current[team]).length) delete current[team];
          }
          await saveLearnedNames(current);
          await renderLearnedNames();
        });
        row.insertCell().append(remove);
      }
      return [heading, table];
    }),
  );
}

forgetAll.addEventListener('click', async () => {
  if (!confirm('Alle gelernten Namenszuordnungen löschen?')) return;
  await saveLearnedNames({});
  await renderLearnedNames();
});

await renderLearnedNames();
