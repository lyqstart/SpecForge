/**
 * KnowledgeTrigger
 * Automatically triggers sf-knowledge agent after workflow.completed event
 * Replaces V5's manual knowledge extraction instructions
 */

export interface KnowledgeTriggerConfig {
  /** Whether knowledge extraction is enabled */
  enabled: boolean;
  /** Maximum time to wait for extraction (ms) */
  timeoutMs: number;
}

const DEFAULT_CONFIG: KnowledgeTriggerConfig = {
  enabled: true,
  timeoutMs: 60000,
};

export interface KnowledgeExtractionEvent {
  type: 'knowledge.extraction.triggered' | 'knowledge.extraction.completed' | 'knowledge.extraction.failed';
  workItemId: string;
  timestamp: number;
  error?: string;
}

export class KnowledgeTrigger {
  private config: KnowledgeTriggerConfig;
  private eventHandler?: (event: KnowledgeExtractionEvent) => void;
  private agentSpawner?: (params: {
    agentRole: string;
    workItemId: string;
    sessionContext?: Record<string, unknown>;
  }) => Promise<{ success: boolean; error?: string }>;

  constructor(config?: Partial<KnowledgeTriggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set event handler for knowledge extraction events
   */
  setEventHandler(handler: (event: KnowledgeExtractionEvent) => void): void {
    this.eventHandler = handler;
  }

  /**
   * Set the agent spawner function (provided by Daemon)
   */
  setAgentSpawner(
    spawner: (params: {
      agentRole: string;
      workItemId: string;
      sessionContext?: Record<string, unknown>;
    }) => Promise<{ success: boolean; error?: string }>,
  ): void {
    this.agentSpawner = spawner;
  }

  /**
   * Handle workflow.completed event
   * Automatically triggers sf-knowledge agent for knowledge extraction
   */
  async onWorkflowCompleted(workItemId: string): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    // Emit triggered event
    this.emitEvent({
      type: 'knowledge.extraction.triggered',
      workItemId,
      timestamp: Date.now(),
    });

    if (!this.agentSpawner) {
      this.emitEvent({
        type: 'knowledge.extraction.failed',
        workItemId,
        timestamp: Date.now(),
        error: 'No agent spawner configured',
      });
      return false;
    }

    try {
      const result = await this.agentSpawner({
        agentRole: 'sf-knowledge',
        workItemId,
      });

      if (result.success) {
        this.emitEvent({
          type: 'knowledge.extraction.completed',
          workItemId,
          timestamp: Date.now(),
        });
        return true;
      } else {
        this.emitEvent({
          type: 'knowledge.extraction.failed',
          workItemId,
          timestamp: Date.now(),
          error: result.error || 'Agent spawn returned failure',
        });
        return false;
      }
    } catch (error) {
      // Knowledge extraction failure should NOT block workflow completion
      this.emitEvent({
        type: 'knowledge.extraction.failed',
        workItemId,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Subscribe to events from an event bus
   */
  subscribeToEventBus(eventBus: {
    subscribe: (
      category: string,
      handler: (event: { action: string; workItemId?: string }) => void,
    ) => void;
  }): void {
    eventBus.subscribe('workflow', (event) => {
      if (event.action === 'workflow.completed' && event.workItemId) {
        // Fire and forget - knowledge extraction failure is non-blocking
        this.onWorkflowCompleted(event.workItemId).catch(() => {
          // Swallow errors - must not block workflow completion
        });
      }
    });
  }

  /**
   * Emit a knowledge extraction event
   */
  private emitEvent(event: KnowledgeExtractionEvent): void {
    if (this.eventHandler) {
      this.eventHandler(event);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<KnowledgeTriggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
