import { MODEL_CHOICES, loadSettings, saveLearnedNames, saveSettings, type Settings } from '../../src/settings';
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

byId<HTMLButtonElement>('forgetNames').addEventListener('click', async () => {
  await saveLearnedNames({});
  byId<HTMLSpanElement>('forgotten').textContent = ' Gelöscht.';
});
