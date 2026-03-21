/**
 * Pushable entity interface — each destination entity type implements this.
 */

/** Options for push operations */
export interface PushOptions {
  model?: string;
  prompt_prefix?: string;
  prompt_suffix?: string;
  push_format?: 'markdown' | 'text';
  name_prefix?: string;
  default_project?: string;
}

/** Each destination entity type implements this to own its own preparation and pushing */
export interface IPushableEntity {
  /** Human-readable label for UI display */
  readonly title: string;

  /**
   * Prepare the final message that will be sent to the destination.
   * This is the single source of truth — push() must use this same output.
   */
  prepareMessage(options?: PushOptions): string;

  /** Push this entity to the destination. Returns a destination-side ID if applicable. */
  push(options?: PushOptions): Promise<string>;
}
