/**
 * Mode Switch module
 * 
 * Implements three-tier observability mode switching
 */

import type { ObservabilityMode, Event } from '@/types';

export class ModeSwitch {
  private currentMode: ObservabilityMode = 'standard';

  getMode(): ObservabilityMode {
    return this.currentMode;
  }

  setMode(mode: ObservabilityMode): void {
    this.currentMode = mode;
    console.log(`ModeSwitch: Changed to ${mode} mode`);
  }

  shouldRecordEvent(event: Omit<Event, 'eventId' | 'ts' | 'monotonicSeq'>): boolean {
    switch (this.currentMode) {
      case 'minimal':
        return this.isDecisionEvent(event);
      case 'standard':
        return true; // Record all events in standard mode
      case 'deep':
        return true; // Record all events in deep mode
      default:
        return false;
    }
  }

  shouldIncludePayload(event: Omit<Event, 'eventId' | 'ts' | 'monotonicSeq'>): boolean {
    switch (this.currentMode) {
      case 'minimal':
        return false; // No payloads in minimal mode
      case 'standard':
        return !this.isLargePayload(event.payload);
      case 'deep':
        return true; // Include all payloads in deep mode
      default:
        return false;
    }
  }

  private isDecisionEvent(event: Omit<Event, 'eventId' | 'ts' | 'monotonicSeq'>): boolean {
    // Decision events are: gate passes/fails, permission allow/deny, workflow transitions
    const decisionActions = [
      'gate.passed',
      'gate.failed',
      'permission.evaluated',
      'workflow.started',
      'workflow.completed',
      'workflow.transition'
    ];
    
    return decisionActions.includes(event.action);
  }

  private isLargePayload(payload: unknown): boolean {
    // Check if payload is larger than 64 KiB
    if (!payload) return false;
    
    const payloadStr = JSON.stringify(payload);
    return payloadStr.length > 64 * 1024; // 64 KiB
  }
}