/**
 * Build a Claude-ready prompt that includes all raw ChatGPT memories
 * and asks Claude to categorize and format them.
 *
 * This replaces the keyword-based categorizer with AI-powered categorization —
 * Claude does the heavy lifting instead of regex heuristics.
 */

import type { IMemory } from '../interfaces/memory';

/**
 * Format a single memory with its date.
 */
function formatMemoryEntry(mem: IMemory): string {
  const date = mem.created_at
    ? new Date(mem.created_at).toISOString().slice(0, 10)
    : 'unknown';
  return `### Memory [${date}]\n${mem.content}`;
}

/**
 * Build a prompt combining categorization instructions + all raw memories.
 * The output is designed to be pasted into Claude or sent via the Claude API.
 */
export function buildMemoryImportPrompt(memories: IMemory[]): string {
  const memoryLines = memories.map((m) => formatMemoryEntry(m)).join('\n\n---\n\n');

  return `I'm migrating from ChatGPT to Claude. Below are all ${memories.length} memories that ChatGPT stored about me. Please organize them into the categories below.

## Categories (output in this order):

1. **Instructions**: Rules I've explicitly set — tone, format, style, "always do X", "never do Y", persona instructions, and corrections to behavior. Only include explicit rules, not general facts.

2. **Identity**: Name, age, location, education, family, relationships, languages, pets, health, and personal details.

3. **Career**: Current and past roles, companies, industries, and general skill areas.

4. **Projects**: Projects, systems, or plans I've built or committed to. Group related entries under a heading but keep individual entries to preserve detail.

5. **Preferences**: Opinions, tastes, and working-style preferences that apply broadly.

## Rules:

- Preserve ALL detail — dosages, configs, commands, specs, schedules, and technical specifics must be kept verbatim.
- Do NOT summarize or shorten entries. Each memory should appear in full.
- Group related entries under the same heading, but keep them as separate entries.
- Only merge entries that are truly duplicates saying the exact same thing.
- Output as plain text with simple section headers. No tables, no numbered lists, no markdown formatting beyond headers and bullets.
- Do NOT include the "Memory" labels from the input — those are delimiters only.

## Format:

Use section headers for each category. Within each category, list one entry per line, sorted by oldest date first. Format each line as:

[YYYY-MM-DD] - Entry content here.

If no date is known, use [unknown] instead.

## Output:

- Output ONLY the categorized list, no preamble or commentary.
- After the list, note if any entries were dropped and why.

---

## Raw Memories (${memories.length} total):

${memoryLines}`;
}
