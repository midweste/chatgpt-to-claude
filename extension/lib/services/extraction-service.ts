/**
 * Extraction service — orchestrates downloading data from ChatGPT.
 *
 * Handles the full 5-phase extraction flow: projects, project conversations,
 * main conversations, memories, and instructions.
 */
import { getSetting, setSetting } from '../storage';
import { ChatGPTSource } from '../sources/chatgpt';
import {
  putConversations,
  putMemories,
  putInstructions,
  getAllConversations,
  getAllMemories,
  updateMigrationState,
  deleteConversationsByIds,
} from '../storage';
import { ensureTracking, deleteTrackingByIds } from '../storage/tracking-repository';
import type { Project } from '../interfaces/project';
import type { ChatGPTRawConversation } from '../interfaces/chatgpt-api-types';
import { logger } from './logger';

const SUMMARY_KEY = 'aimigration_last_extraction';

export interface ExtractionSummary {
  conversations: number;
  newConversations: number;
  projectConversations: number;
  newProjectConversations: number;
  memories: number;
  newMemories: number;
  projects: number;
  newProjects: number;
  instructions: number;
  newInstructions: number;
  completedAt: string;
}

export interface ExtractionProgress {
  loaded: number;
  total: number;
  label: string;
}

export interface ExtractionCounts {
  projects: number;
  newProjects: number;
  projectConversations: number;
  newProjectConversations: number;
  conversations: number;
  newConversations: number;
  memories: number;
  newMemories: number;
  instructions: number;
  newInstructions: number;
  phase: string;
}

export async function loadLastExtraction(): Promise<ExtractionSummary | null> {
  try {
    const stored = await getSetting<ExtractionSummary | null>(SUMMARY_KEY, null);
    if (stored) return stored;
  } catch { /* ignore */ }
  return null;
}

async function saveSummary(summary: ExtractionSummary): Promise<void> {
  await setSetting(SUMMARY_KEY, summary);
}

/**
 * Run a full extraction from ChatGPT.
 *
 * Callbacks are invoked as progress changes so the UI can update.
 */
export async function runExtraction(callbacks: {
  on_progress: (progress: ExtractionProgress) => void;
  on_counts: (updater: (prev: ExtractionCounts) => ExtractionCounts) => void;
}): Promise<ExtractionSummary> {
  const { on_progress, on_counts } = callbacks;

  const source = new ChatGPTSource();
  await logger.info('extract', 'Starting data download');
  const restored = await source.restoreSession();
  if (!restored) await source.authenticate();

  // ── Phase 1: Projects ──────────────────────────────────────
  on_counts((c) => ({ ...c, phase: 'Fetching projects...' }));
  const fetched_projects = await source.getProjects();
  const old_projects: Project[] = await getSetting<Project[]>('projects', []);
  const old_project_ids = new Set(old_projects.map((p: Project) => p.id));
  const new_project_count = fetched_projects.filter((p) => !old_project_ids.has(p.id)).length;
  await setSetting('projects', fetched_projects);
  const total_project_conv_ids = fetched_projects.reduce((n, p) => n + p.conversation_ids.length, 0);
  on_counts((c) => ({ ...c, projects: fetched_projects.length, newProjects: new_project_count, projectConversations: total_project_conv_ids }));

  // ── Phase 2: Download project conversations ────────────────
  const existing_convs = await getAllConversations();
  const stored_ids = new Set(existing_convs.map((c) => c.id as string));

  const missing_project_convs: Array<{ id: string; projectId: string }> = [];
  for (const project of fetched_projects) {
    for (const conv_id of project.conversation_ids) {
      if (!stored_ids.has(conv_id)) {
        missing_project_convs.push({ id: conv_id, projectId: project.id });
      }
    }
  }

  if (missing_project_convs.length > 0) {
    on_counts((c) => ({ ...c, phase: `Downloading ${missing_project_convs.length} project conversations...` }));
    on_progress({ loaded: 0, total: missing_project_convs.length, label: 'Project conversations' });

    const project_convs = await source.downloadAll(
      missing_project_convs.map((m) => m.id),
      (downloaded: number, total: number) => on_progress({ loaded: downloaded, total, label: 'Project conversations' }),
    );

    // Store raw objects and create tracking records
    await putConversations(project_convs);
    await ensureTracking(
      project_convs.map((c) => ({ id: c.id as string, type: 'conversation' as const })),
    );
    project_convs.forEach((c) => stored_ids.add(c.id as string));
    on_counts((c) => ({ ...c, newProjectConversations: project_convs.length }));
  }

  // ── Phase 3: List + download main conversations ────────────
  on_counts((c) => ({ ...c, phase: 'Listing conversations...' }));
  const all_summaries: ChatGPTRawConversation[] = [];
  for await (const pg of source.listConversations()) {
    all_summaries.push(...pg);
    on_counts((c) => ({ ...c, conversations: all_summaries.length }));
  }

  const new_ids = all_summaries.map((s) => s.id as string).filter((id) => !stored_ids.has(id));
  on_counts((c) => ({ ...c, newConversations: new_ids.length }));

  // Reconcile: remove conversations deleted from ChatGPT
  const chatgpt_ids = new Set(all_summaries.map((s) => s.id as string));
  const stale_ids = existing_convs
    .map((c) => c.id as string)
    .filter((id) => !chatgpt_ids.has(id));
  if (stale_ids.length > 0) {
    await deleteConversationsByIds(stale_ids);
    await deleteTrackingByIds(stale_ids);
    await logger.info('extract', `Removed ${stale_ids.length} conversations deleted from ChatGPT`);
  }

  if (new_ids.length > 0) {
    on_counts((c) => ({ ...c, phase: `Downloading ${new_ids.length} new conversations...` }));
    on_progress({ loaded: 0, total: new_ids.length, label: 'Conversations' });
    await updateMigrationState({ status: 'downloading', total_conversations: all_summaries.length, started_at: new Date().toISOString() });

    const convs = await source.downloadAll(new_ids, (downloaded: number, total: number) => {
      on_progress({ loaded: downloaded, total, label: 'Conversations' });
    });

    await putConversations(convs);
    await ensureTracking(
      convs.map((c) => ({ id: c.id as string, type: 'conversation' as const })),
    );
  }

  // ── Phase 4: Memories ──────────────────────────────────────
  on_counts((c) => ({ ...c, phase: 'Fetching memories...' }));
  on_progress({ loaded: 0, total: 0, label: '' });
  const old_memories = await getAllMemories();
  const old_memory_ids = new Set(old_memories.map((m) => m.id as string));
  const memories = await source.getMemories();
  await putMemories(memories);
  await ensureTracking(
    memories.map((m) => ({ id: m.id as string, type: 'memory' as const })),
  );
  const new_memory_count = memories.filter((m) => !old_memory_ids.has(m.id as string)).length;
  on_counts((c) => ({ ...c, memories: memories.length, newMemories: new_memory_count }));

  // ── Phase 5: Instructions ──────────────────────────────────
  on_counts((c) => ({ ...c, phase: 'Fetching custom instructions...' }));
  const instructions = await source.getInstructions();
  if (instructions) {
    await putInstructions(instructions);
    await ensureTracking([
      { id: 'about-user', type: 'instruction' as const },
      { id: 'about-model', type: 'instruction' as const },
    ]);
  }
  const instruction_count = instructions
    ? [(instructions.about_user_message as string), (instructions.about_model_message as string)].filter(Boolean).length
    : 0;
  on_counts((c) => ({ ...c, instructions: instruction_count, newInstructions: instruction_count, phase: '' }));

  // ── Done ───────────────────────────────────────────────────
  await updateMigrationState({ status: 'complete', extracted_count: all_summaries.length, completed_at: new Date().toISOString() });

  const result: ExtractionSummary = {
    conversations: all_summaries.length,
    newConversations: new_ids.length,
    projectConversations: total_project_conv_ids,
    newProjectConversations: missing_project_convs.length,
    memories: memories.length,
    newMemories: new_memory_count,
    projects: fetched_projects.length,
    newProjects: new_project_count,
    instructions: instruction_count,
    newInstructions: instruction_count,
    completedAt: new Date().toISOString(),
  };
  await saveSummary(result);
  await logger.info('extract', `Download complete: ${all_summaries.length} conversations, ${memories.length} memories, ${fetched_projects.length} projects`);

  return result;
}
