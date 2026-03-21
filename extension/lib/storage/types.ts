/**
 * Shared storage types.
 */

export type TrackingType = 'conversation' | 'memory' | 'instruction';
export type TrackingStatus = 'pending' | 'extracted' | 'done' | 'failed';

export interface TrackingRecord {
  id: string;
  type: TrackingType;
  is_selected: boolean;
  status: TrackingStatus;
  error?: string;
  claude_id?: string;
  pushed_at?: string;
}

/** Migration state — tracks overall download progress */
export interface MigrationState {
  id: string;          // always 'current'
  source: string;
  status: 'idle' | 'listing' | 'downloading' | 'complete' | 'error';
  total_conversations: number;
  extracted_count: number;
  last_offset: number;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
}
