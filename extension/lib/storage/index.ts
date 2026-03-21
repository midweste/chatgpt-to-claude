/**
 * Storage barrel — re-exports all storage modules.
 *
 * Existing imports like `import { X } from './storage'` continue to work.
 * Individual modules can be imported directly for finer granularity.
 */

// Types
export type {
  TrackingType,
  TrackingStatus,
  TrackingRecord,
  MigrationState,
  LogEntry,
} from './types';

// Connection
export { open, resetConnection } from './connection';

// Conversation CRUD
export {
  putConversation,
  putConversations,
  getConversation,
  getAllConversations,
  getConversationCount,
  clearConversations,
  deleteConversationsByIds,
} from './conversation-repository';

// Memory CRUD
export {
  putMemories,
  getAllMemories,
  clearMemories,
} from './memory-repository';

// Instruction CRUD
export {
  putInstructions,
  getInstructions,
  clearInstructions,
} from './instruction-repository';

// Tracking CRUD — only reads + clear exported here.
// Write functions (patchTracking, putTracking, toggleSelection, etc.) are
// intentionally omitted. Stores/services import them directly from
// ./tracking-repository to guarantee state is kept in sync.
export {
  getTracking,
  getAllTracking,
  getTrackingByType,
  clearTracking,
} from './tracking-repository';

// Log CRUD
export {
  appendLog,
  getAllLogs,
  clearLogs,
} from './log-repository';

// Setting CRUD
export {
  getSetting,
  setSetting,
  removeSetting,
  clearSettings,
} from './setting-repository';

// Migration State
export {
  getMigrationState,
  updateMigrationState,
  clearMigrationState,
} from './migration-state-repository';

// Cross-cutting clear
export { clearAll } from './clear-all';
