import { MODEL_CHOICES, loadSettings, saveLearnedNames, saveSettings, type Settings } from '../../src/settings';
import type { Effort } from '../../src/recognition/claude';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const form = byId<HTMLFormElement>('settings');
const apiKey = byId<HTMLInputElement>('apiKey');
const model = byId<HTMLSelectElement>('model');
const effort = byId<HTMLSelectElement>('effort');
const saved = byId<HTMLSpanElement>('saved');

for (const choice of MODEL_CHOICES) model.add(new Option(choice.label, choice.id));

const settings = await loadSettings();
apiKey.value = settings.apiKey;
if (![...model.options].some((o) => o.value === settings.model)) model.add(new Option(settings.model, settings.model));
model.value = settings.model;
effort.value = settings.effort;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const next: Settings = { apiKey: apiKey.value.trim(), model: model.value, effort: effort.value as Effort };
  await saveSettings(next);
  saved.textContent = 'Gespeichert.';
  setTimeout(() => (saved.textContent = ''), 2000);
});

byId<HTMLButtonElement>('forgetNames').addEventListener('click', async () => {
  await saveLearnedNames({});
  byId<HTMLSpanElement>('forgotten').textContent = ' Gelöscht.';
});
