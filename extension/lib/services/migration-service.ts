/**
 * Migration service — orchestrates pushing conversations to Claude
 * with project creation and placement.
 *
 * Uses entity classes (ClaudeConversation, etc.) that own their
 * own preparation and push logic.
 */

import type { IConversation } from '../interfaces/conversation';
import type { Project } from '../interfaces/project';
import type { PushOptions } from '../interfaces/pushable';
import { patchTracking } from '../storage/tracking-repository';
import { ClaudeDestination } from '../destinations/claude';
import { ClaudeConversation } from '../destinations/claude-conversation';
import { logger } from './logger';

export interface PushResult {
  id: string;
  status: 'done' | 'error';
  claude_id?: string;
  error?: string;
}

export class MigrationService {
  private claude: ClaudeDestination;
  private projects: Project[];
  private conv_project_map: Map<string, string>;

  constructor(claude: ClaudeDestination, projects: Project[]) {
    this.claude = claude;
    this.projects = projects;
    this.conv_project_map = new Map();
  }

  /**
   * Initialize project mappings. Call once before pushConversation.
   * Builds ChatGPT conv→project map and fetches existing Claude projects.
   */
  async init(): Promise<void> {
    for (const project of this.projects) {
      for (const conv_id of project.conversation_ids) {
        this.conv_project_map.set(conv_id, project.name);
      }
    }
    await logger.info(
      'migrate',
      `Project mapping: ${this.projects.length} ChatGPT projects, ${this.conv_project_map.size} conversations mapped`,
    );
  }

  /**
   * Push a single conversation to Claude.
   *
   * Delegates content preparation + push to ClaudeConversation entity,
   * then handles status persistence and project placement.
   */
  async pushConversation(
    conv: IConversation,
    options: PushOptions,
  ): Promise<PushResult> {
    const entity = new ClaudeConversation(conv, this.claude);

    try {
      const uuid = await entity.push(options);

      // Persist pushed status via tracking table
      await patchTracking(conv.id, {
        status: 'done',
        claude_id: uuid,
        pushed_at: new Date().toISOString(),
      });

      // Handle project placement (use default project for unfoldered conversations)
      await this.move_to_project(conv, uuid, entity.title, options.default_project);

      return { id: conv.id, status: 'done', claude_id: uuid };
    } catch (err) {
      const error_msg = err instanceof Error ? err.message : String(err);
      await logger.error('migrate', `✗ Failed "${entity.title}" — ${error_msg}`);
      return { id: conv.id, status: 'error', error: error_msg };
    }
  }

  /**
   * Resolve project membership and move conversation into the correct Claude project.
   */
  private async move_to_project(conv: IConversation, claude_uuid: string, title: string, default_project?: string): Promise<void> {
    let project_name = this.conv_project_map.get(conv.id);
    let resolution = 'conv_project_map';
    if (!project_name && conv.project_id) {
      const proj = this.projects.find((p) => p.id === conv.project_id);
      if (proj) {
        project_name = proj.name;
        resolution = 'project_id lookup';
      }
    }

    // Fall back to the default project for unfoldered conversations
    if (!project_name && default_project) {
      project_name = default_project;
      resolution = 'default_project';
    }

    if (!project_name) {
      await logger.debug('migrate', `"${title}" has no project — skipping project placement`);
      return;
    }

    await logger.debug('migrate', `"${title}" → project "${project_name}" (resolved via ${resolution})`);

    try {
      const source_project = this.projects.find((p) => p.name === project_name);
      const description = source_project?.description || '';
      const project_uuid = await this.claude.resolveOrCreateProject(project_name, description);

      // Set instructions if this is a newly created project with a description
      if (description && source_project) {
        try {
          await this.claude.setProjectInstructions(project_uuid, description);
        } catch {
          // Non-fatal — project exists, instructions are optional
        }
      }

      await this.claude.moveToProject([claude_uuid], project_uuid);
      await logger.info('migrate', `Moved "${title}" → project "${project_name}"`);
    } catch (err) {
      await logger.error(
        'migrate',
        `Could not move to project "${project_name}": ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
