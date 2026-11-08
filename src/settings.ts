import { browser } from 'wxt/browser';
import type { Effort } from './recognition/claude';
import type { FillPlan, LearnedNames } from './domain/plan';
import type { Position, Side } from './domain/model';
import { DEFAULT_MODEL } from './recognition/models';

export { DEFAULT_MODEL, MODEL_CHOICES } from './recognition/models';

export interface Settings {
  apiKey: string;
  model: string;
  effort: Effort;
}

export const DEFAULT_SETTINGS: Settings = { apiKey: '', model: DEFAULT_MODEL, effort: 'medium' };

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}

/** Progress of filling one match, kept across the page reloads of click-tt. */
export interface PendingFill {
  matchKey: string;
  plan: FillPlan;
  phase: 'lineup' | 'results' | 'filled';
  /** Number of reloading lineup actions, guards against endless loops. */
  lineupActions: number;
  createdAt: number;
}

const PENDING_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export async function loadPending(): Promise<PendingFill | null> {
  const { pending } = await browser.storage.local.get('pending');
  const value = pending as PendingFill | undefined;
  if (!value || Date.now() - value.createdAt > PENDING_MAX_AGE_MS) return null;
  return value;
}

export async function savePending(pending: PendingFill): Promise<void> {
  await browser.storage.local.set({ pending });
}

export async function clearPending(): Promise<void> {
  await browser.storage.local.remove('pending');
}

export async function loadLearnedNames(): Promise<LearnedNames> {
  const { learnedNames } = await browser.storage.local.get('learnedNames');
  return (learnedNames as LearnedNames | undefined) ?? {};
}

export async function saveLearnedNames(learnedNames: LearnedNames): Promise<void> {
  await browser.storage.local.set({ learnedNames });
}

export type ChosenPlayers = Record<Side, Partial<Record<Position, string>>>;
