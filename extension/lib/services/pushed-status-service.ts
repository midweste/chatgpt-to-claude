import { ClaudeDestination } from '../destinations/claude';
import { getAllTracking, getAllConversations } from '../storage';
import { patchTracking, putTracking } from '../storage/tracking-repository';
import type { TrackingRecord } from '../storage/types';
import { logger } from './logger';

export interface RefreshResult {
  marked: number;
  unmarked: number;
  checked: number;
}

/**
 * Refresh pushed status by comparing local tracking records against Claude's
 * actual conversation list. Uses ID-based matching with title-based fallback
 * for records that lost their claude_id (e.g. from a previous incomplete refresh).
 *
 * - Conversations that exist on Claude (by ID or title) → marked as pushed
 * - Conversations tracked as pushed but truly not on Claude → unmarked
 * - Conversations with no tracking record found on Claude → record created as pushed
 */
export async function refreshPushedStatus(
  claude: ClaudeDestination,
  prefetched_convs?: Array<{ uuid: string; name: string }>,
): Promise<RefreshResult> {
  const claude_convs = prefetched_convs ?? await claude.listConversations();
  const claude_ids = new Set(claude_convs.map((c) => c.uuid));

  // Build title→uuid map for fallback matching.
  // Claude conversations are named "[GPT] Original Title" — index both forms.
  const claude_by_title = new Map<string, string>();
  for (const c of claude_convs) {
    if (c.name) {
      claude_by_title.set(c.name.toLowerCase(), c.uuid);
      const stripped = c.name.replace(/^\[GPT\]\s*/i, '');
      claude_by_title.set(stripped.toLowerCase(), c.uuid);
    }
  }

  // Load local conversations for title lookups
  const local_convs = await getAllConversations();
  const local_title_map = new Map<string, string>();
  for (const c of local_convs) {
    const id = (c.id ?? c.conversation_id ?? '') as string;
    const title = (c.title ?? '') as string;
    if (id && title) local_title_map.set(id, title);
  }

  const all_tracking = await getAllTracking();
  const conv_tracking = all_tracking.filter((t) => t.type === 'conversation');
  const tracked_ids = new Set(conv_tracking.map((t) => t.id));

  let marked = 0;
  let unmarked = 0;

  for (const track of conv_tracking) {
    const has_claude_id = !!track.claude_id;
    const exists_on_claude = has_claude_id && claude_ids.has(track.claude_id!);
    const is_tracked_as_pushed = track.status === 'done';

    if (exists_on_claude && !is_tracked_as_pushed) {
      // ID match — mark as pushed
      await patchTracking(track.id, { status: 'done' });
      marked++;
    } else if (!exists_on_claude && !is_tracked_as_pushed) {
      // No ID match and not pushed — try title-based fallback
      const claude_uuid = find_by_title(track.id, local_title_map, claude_by_title);
      if (claude_uuid) {
        await patchTracking(track.id, { status: 'done', claude_id: claude_uuid });
        marked++;
      }
    } else if (is_tracked_as_pushed && has_claude_id && !exists_on_claude) {
      // Was pushed but ID gone from Claude — try title fallback before unmarking
      const claude_uuid = find_by_title(track.id, local_title_map, claude_by_title);
      if (claude_uuid) {
        await patchTracking(track.id, { status: 'done', claude_id: claude_uuid });
      } else {
        await patchTracking(track.id, { status: 'extracted', claude_id: undefined, pushed_at: undefined });
        unmarked++;
      }
    } else if (is_tracked_as_pushed && !has_claude_id) {
      // Pushed but no claude_id — try title fallback before unmarking
      const claude_uuid = find_by_title(track.id, local_title_map, claude_by_title);
      if (claude_uuid) {
        await patchTracking(track.id, { status: 'done', claude_id: claude_uuid });
      } else {
        await patchTracking(track.id, { status: 'extracted' });
        unmarked++;
      }
    }
  }

  // Second pass: check local conversations with NO tracking record.
  // After a tracking clear, most records are gone — find pushed ones via title match.
  for (const c of local_convs) {
    const id = (c.id ?? c.conversation_id ?? '') as string;
    if (!id || tracked_ids.has(id)) continue;

    const claude_uuid = find_by_title(id, local_title_map, claude_by_title);
    if (claude_uuid) {
      const record: TrackingRecord = {
        id,
        type: 'conversation',
        is_selected: false,
        status: 'done',
        claude_id: claude_uuid,
      };
      await putTracking(record);
      marked++;
    }
  }

  if (marked > 0 || unmarked > 0) {
    await logger.info('connect', `Refresh: ${marked} marked pushed, ${unmarked} unmarked (${claude_convs.length} Claude conversations checked)`);
  } else {
    await logger.info('connect', `Refresh: no changes (${claude_convs.length} Claude conversations checked)`);
  }

  return { marked, unmarked, checked: claude_convs.length };
}

/** Try to find a Claude conversation UUID by matching local title against Claude's "[GPT] Title" names. */
function find_by_title(
  track_id: string,
  local_title_map: Map<string, string>,
  claude_by_title: Map<string, string>,
): string | undefined {
  const local_title = local_title_map.get(track_id);
  if (!local_title) return undefined;
  return (
    claude_by_title.get(`[gpt] ${local_title}`.toLowerCase()) ??
    claude_by_title.get(local_title.toLowerCase())
  );
}
