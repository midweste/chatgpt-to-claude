/**
 * Interfaces barrel — re-exports all domain contracts.
 *
 * Existing imports like `import { X } from './adapters'` are redirected here
 * via the adapters.ts shim.
 */

export type { IDestination, IConnectable, IConversationPush, IProjectManager, IDocumentManager } from './destination';
export type { IConversation } from './conversation';
export type { IMemory } from './memory';
export type { IInstruction } from './instruction';
export type { Project } from './project';
export type { Source } from './source';
export type { IPushableEntity, PushOptions } from './pushable';
