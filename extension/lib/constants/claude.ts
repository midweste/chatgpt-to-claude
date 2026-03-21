/**
 * Claude destination constants.
 */

export const CLAUDE_BASE = 'https://claude.ai/api';

export const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export const CLAUDE_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (cheapest)' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
] as const;
