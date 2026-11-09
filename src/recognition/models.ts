// Sonnet read the example sheet as accurately as Opus at half the cost and
// in less time; Haiku misread two set scores without flagging them.
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

export const MODEL_CHOICES = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (empfohlen)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (für schwer lesbare Blätter, teurer)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (sehr günstig, liest Ziffern unzuverlässiger)' },
] as const;
