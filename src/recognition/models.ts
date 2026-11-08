export const DEFAULT_MODEL = 'claude-opus-5-5';

export const MODEL_CHOICES = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (beste Erkennung)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (günstiger)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (am günstigsten)' },
] as const;
