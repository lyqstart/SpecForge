/**
 * Project Manager implementation
 * 
 * Maintains per-project contexts and enforces project isolation.
 */

import { Event, ProjectState, Lock, Subscription } from '../types';
import { EventBus } from '../event-bus/EventBus';

export class ProjectManager {
  private eventBus: EventBus;
  private projectStates: Map<string, ProjectState> = new Map();
  private projectLocks: Map<string, Lock> = new Map();
  private subscription: Subscription | null = null;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  start(): void {
    this.subscription = this.eventBus.subscribe('project.updated', (event) => {
      this.handleProjectEvent(event);
    });
  }

  stop(): void {
    if (this.subscription) {
      this.eventBus.unsubscribe(this.subscription);
      this.subscription = null;
    }
  }

  getProjectContext(projectPath: string): ProjectState {
    if (!this.projectStates.has(projectPath)) {
      this.projectStates.set(projectPath, this.createEmptyState(projectPath));
    }
    return this.projectStates.get(projectPath)!;
  }

  async acquireLock(projectPath: string): Promise<Lock> {
    if (this.projectLocks.has(projectPath)) {
      throw new Error(`Project ${projectPath} is already locked`);
    }

    const now = Date.now();
    const lock: Lock = {
      id: this.generateId(),
      projectPath,
      acquiredAt: now,
      expiresAt: now + 30_000, // 30 second timeout
    };

    this.projectLocks.set(projectPath, lock);
    return lock;
  }

  releaseLock(lock: Lock): void {
    const current = this.projectLocks.get(lock.projectPath);
    if (current && current.id === lock.id) {
      this.projectLocks.delete(lock.projectPath);
    }
  }

  listActiveProjects(): string[] {
    return Array.from(this.projectStates.keys());
  }

  private handleProjectEvent(event: Event): void {
    const payload = event.payload as { projectPath?: string; state?: ProjectState };
    
    if (event.action === 'project.updated' && payload.projectPath && payload.state) {
      this.projectStates.set(payload.projectPath, payload.state);
    }
  }

  private createEmptyState(projectPath: string): ProjectState {
    return {
      projectPath,
      schemaVersion: '1.0',
      activeSessions: [],
      workItems: [],
      lastEventId: '',
      lastEventTs: 0,
    };
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
