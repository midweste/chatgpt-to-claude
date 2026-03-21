/**
 * Raw ChatGPT API response types — shapes returned by the ChatGPT backend.
 *
 * These types describe the API contract as observed, using optional fields
 * because the API responses are not always consistent between versions.
 * A Record<string, unknown> index signature allows forward compatibility.
 */

// ── Conversations ─────────────────────────────────────────────

/** A single message node in the conversation mapping tree. */
export interface ChatGPTMessageNode {
  id?: string;
  parent?: string | null;
  children?: string[];
  message?: ChatGPTMessage | null;
  [key: string]: unknown;
}

/** The message payload within a node. */
export interface ChatGPTMessage {
  id?: string;
  author?: { role: string; [key: string]: unknown };
  content?: {
    content_type?: string;
    parts?: unknown[];
    [key: string]: unknown;
  };
  create_time?: number | null;
  update_time?: number | null;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Raw conversation object as returned by /backend-api/conversation/{id}. */
export interface ChatGPTRawConversation {
  id?: string;
  conversation_id?: string;
  title?: string;
  create_time?: number | null;
  created_at?: string;
  update_time?: number | null;
  updated_at?: string;
  default_model_slug?: string | null;
  current_node?: string | null;
  gizmo_id?: string | null;
  project_id?: string | null;
  is_archived?: boolean;
  mapping?: Record<string, ChatGPTMessageNode>;
  [key: string]: unknown;
}

/** Paginated conversation list response. */
export interface ChatGPTConversationList {
  items: ChatGPTRawConversation[];
  total: number;
  [key: string]: unknown;
}

// ── Memories ──────────────────────────────────────────────────

/** Raw memory object as returned by /backend-api/memories. */
export interface ChatGPTRawMemory {
  id?: string;
  content?: string;
  value?: string;
  text?: string;
  memory?: string;
  created_timestamp?: string | number;
  created_at?: string;
  create_time?: number | string;
  updated_at?: string;
  update_time?: number;
  updated_timestamp?: string | number;
  status?: string;
  source_conversation_id?: string;
  [key: string]: unknown;
}

/** Memories list response (varies by API version). */
export interface ChatGPTMemoriesResponse {
  memories?: ChatGPTRawMemory[];
  results?: ChatGPTRawMemory[];
  [key: string]: unknown;
}

// ── Instructions ──────────────────────────────────────────────

/** Raw instructions object as returned by /backend-api/user_system_messages. */
export interface ChatGPTRawInstructions {
  about_user_message?: string;
  about_model_message?: string | null;
  [key: string]: unknown;
}
