/**
 * Destination adapter interfaces — ISP-compliant sub-interfaces.
 *
 * Each sub-interface represents a single capability domain.
 * IDestination is the full intersection for implementations that
 * provide all capabilities (e.g., ClaudeDestination).
 *
 * Consumers should depend on the narrowest sub-interface they need.
 */

/** Authentication lifecycle. */
export interface IConnectable {
  readonly id: string;
  readonly name: string;
  isAuthenticated(): boolean;
  authenticate(): Promise<void>;
  restoreSession(): Promise<boolean>;
}

/** Conversation CRUD and messaging. */
export interface IConversationPush {
  createConversation(name?: string): Promise<{ uuid: string }>;
  renameConversation(convId: string, name: string): Promise<void>;
  sendMessage(convId: string, prompt: string, parentUuid?: string, model?: string): Promise<string>;
  listConversations(): Promise<Array<{ uuid: string; name: string }>>;
  fetchExistingTitles(): Promise<Set<string>>;
}

/** Project organization. */
export interface IProjectManager {
  createProject(name: string, description: string): Promise<{ uuid: string }>;
  setProjectInstructions(projectId: string, instructions: string): Promise<void>;
  listProjects(): Promise<Array<{ uuid: string; name: string }>>;
  moveToProject(conversationUuids: string[], projectUuid: string): Promise<void>;
}

/** Document and instruction management. */
export interface IDocumentManager {
  uploadDocument(projectId: string, fileName: string, content: string): Promise<void>;
  getAccountInstructions(): Promise<string>;
  setAccountInstructions(instructions: string): Promise<void>;
}

/** Full destination — intersection of all sub-interfaces. */
export type IDestination = IConnectable & IConversationPush & IProjectManager & IDocumentManager;
