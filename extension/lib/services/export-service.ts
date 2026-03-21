/**
 * Export service — builds zipped archives of conversations, memories,
 * and instructions in text or JSON format.
 *
 * Text format: folder structure with one file per item
 *   conversations/Title.txt
 *   memories/memory-001.txt
 *   instructions/about-you.txt
 *   instructions/response-style.txt
 *
 * JSON format: 3 flat files at the zip root — raw API data, zero transformation
 *   conversations.json
 *   memories.json
 *   instructions.json
 */

import { ChatGPTConversation } from '../sources/chatgpt-conversation';
import { ChatGPTMemory } from '../sources/chatgpt-memory';
import { ChatGPTInstruction } from '../sources/chatgpt-instruction';
import { formatTranscript } from '../transform/gpt-to-claude';
import type { ChatGPTRawConversation, ChatGPTRawMemory, ChatGPTRawInstructions } from '../interfaces/chatgpt-api-types';
import type JSZip from 'jszip';

export interface ExportData {
  conversations: ChatGPTRawConversation[];
  memories: ChatGPTRawMemory[];
  instructions: ChatGPTRawInstructions | null;
}

// Characters illegal in filenames on Windows, Mac, or Linux
const ILLEGAL_RE = /[<>:"/\\|?*\x00-\x1f]/g;
// Windows reserved device names
const RESERVED_RE = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i;

function sanitize_filename(name: string): string {
  let safe = (name || 'Untitled')
    .replace(ILLEGAL_RE, '')     // strip illegal chars
    .replace(/\.+$/, '')         // no trailing dots (Windows)
    .replace(/^\s+|\s+$/g, '')   // trim whitespace
    .replace(/\s+/g, '_')        // spaces → underscores
    .substring(0, 100);

  if (!safe || RESERVED_RE.test(safe)) {
    safe = `_${safe}`;
  }
  return safe;
}

function deduplicate_name(name: string, used: Set<string>): string {
  let candidate = name;
  let counter = 1;
  while (used.has(candidate)) {
    counter++;
    candidate = `${name} (${counter})`;
  }
  used.add(candidate);
  return candidate;
}

export async function exportAll(
  data: ExportData,
  format: 'text' | 'json',
): Promise<Blob> {
  // Lazy-load JSZip (~100KB) — only needed when user explicitly exports
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  if (format === 'json') {
    return export_json(zip, data);
  }
  return export_text(zip, data);
}

// ── JSON: 3 flat files at zip root — raw API data, zero transformation ──

async function export_json(zip: JSZip, data: ExportData): Promise<Blob> {
  // conversations.json — raw API objects
  zip.file('conversations.json', JSON.stringify(data.conversations, null, 2));

  // memories.json — raw API objects
  zip.file('memories.json', JSON.stringify(data.memories, null, 2));

  // instructions.json — raw API response
  zip.file('instructions.json', JSON.stringify(data.instructions ?? {}, null, 2));

  return zip.generateAsync({ type: 'blob' });
}

// ── Text: folder structure with one file per item ──────────────

async function export_text(zip: JSZip, data: ExportData): Promise<Blob> {
  const used_names = new Set<string>();

  // conversations/
  const conv_folder = zip.folder('conversations')!;
  for (const raw of data.conversations) {
    const conv = new ChatGPTConversation(raw);
    let date_prefix = 'undated';
    if (conv.created_at) {
      date_prefix = conv.created_at.slice(0, 10);
    } else if (typeof raw.create_time === 'number') {
      const ms = raw.create_time < 1e12 ? raw.create_time * 1000 : raw.create_time;
      date_prefix = new Date(ms).toISOString().slice(0, 10);
    }
    const base = sanitize_filename(`${date_prefix} ${conv.title}`);
    const name = deduplicate_name(base, used_names);
    const transcript = formatTranscript(conv);
    conv_folder.file(`${name}.txt`, transcript);
  }

  // memories/
  if (data.memories.length > 0) {
    const mem_folder = zip.folder('memories')!;
    for (let i = 0; i < data.memories.length; i++) {
      const mem = new ChatGPTMemory(data.memories[i]);
      const idx = String(i + 1).padStart(3, '0');
      const date = mem.updated_at ?? mem.created_at;
      const date_prefix = date ? date.slice(0, 10) : 'undated';
      mem_folder.file(`${date_prefix}_memory-${idx}.txt`, mem.content || '');
    }
  }

  // instructions/
  if (data.instructions) {
    const inst = new ChatGPTInstruction(data.instructions);
    const inst_folder = zip.folder('instructions')!;
    if (inst.about_user) {
      inst_folder.file('about-you.txt', inst.about_user);
    }
    if (inst.about_model) {
      inst_folder.file('response-style.txt', inst.about_model);
    }
  }

  return zip.generateAsync({ type: 'blob' });
}

// ── Single-file export (non-zipped) ────────────────────────────

/**
 * Format conversations for download as a single text or JSON file.
 * For multi-item zipped exports, use exportAll above.
 */
export function exportConversations(
  conversations: ChatGPTRawConversation[],
  format: 'text' | 'json',
): { name: string; content: string } {
  const files: { name: string; content: string }[] = [];

  for (const raw of conversations) {
    const conv = new ChatGPTConversation(raw);
    const title = (conv.title || 'Untitled').replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
    if (format === 'json') {
      files.push({
        name: `${title}.json`,
        content: JSON.stringify(raw, null, 2),
      });
    } else {
      const transcript = formatTranscript(conv);
      files.push({ name: `${title}.txt`, content: transcript });
    }
  }

  if (files.length === 1) {
    return files[0];
  }

  if (format === 'json') {
    const combined = files.map((f) => JSON.parse(f.content));
    return { name: 'chatgpt-export.json', content: JSON.stringify(combined, null, 2) };
  }

  const combined = files
    .map((f) => `${'='.repeat(60)}\n${f.name}\n${'='.repeat(60)}\n\n${f.content}`)
    .join('\n\n\n');
  return { name: 'chatgpt-export.txt', content: combined };
}
