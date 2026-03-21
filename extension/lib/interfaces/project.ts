/**
 * Project type — represents a ChatGPT project/gizmo grouping.
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: string | null;
  updated_at: string | null;
  conversation_ids: string[];
}
