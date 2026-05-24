import type { ObservabilityMode, Event, CAS } from '@/types';

const PAYLOAD_SIZE_LIMIT = 64 * 1024;

const MINIMAL_ACTIONS: ReadonlySet<string> = new Set([
  'workflow.started',
  'workflow.finished',
  'permission.evaluated',
  'gate.checked',
]);

export type { ObservabilityMode };

export function filterByMode(event: Event, mode: ObservabilityMode): boolean {
  switch (mode) {
    case 'minimal':
      if (!MINIMAL_ACTIONS.has(event.action)) return false;
      if (event.action === 'permission.evaluated') {
        const p = event.payload as { effect?: string } | undefined;
        return p?.effect === 'deny';
      }
      return true;
    case 'standard':
      return true;
    case 'deep':
      return true;
  }
}

const projectModes = new Map<string, ObservabilityMode>();
let globalDefaultMode: ObservabilityMode = 'standard';

export function configureMode(mode: ObservabilityMode, projectId?: string): void {
  if (projectId) {
    projectModes.set(projectId, mode);
  } else {
    globalDefaultMode = mode;
  }
}

export function getEffectiveMode(projectId?: string): ObservabilityMode {
  if (projectId) {
    return projectModes.get(projectId) ?? globalDefaultMode;
  }
  return globalDefaultMode;
}

export function resetModeConfig(): void {
  projectModes.clear();
  globalDefaultMode = 'standard';
}

export async function processPayloadByMode(
  event: Event,
  mode: ObservabilityMode,
  cas?: CAS,
): Promise<Event> {
  if (mode === 'minimal') {
    const { payload: _payload, ...rest } = event;
    return rest as Event;
  }

  if (mode === 'deep') {
    return event;
  }

  if (event.payload != null && cas != null) {
    const payloadStr = JSON.stringify(event.payload);
    if (payloadStr.length > PAYLOAD_SIZE_LIMIT) {
      const blobRef = await cas.store(payloadStr);
      const { payload: _payload, ...rest } = event;
      return { ...rest, payloadBlobRef: blobRef } as Event;
    }
  }

  return event;
}

export class ModeSwitch {
  private currentMode: ObservabilityMode = 'standard';
  private projectId?: string;
  private cas?: CAS;

  constructor(options?: { projectId?: string; cas?: CAS }) {
    if (options) {
      if (options.projectId !== undefined) {
        this.projectId = options.projectId;
      }
      if (options.cas !== undefined) {
        this.cas = options.cas;
      }
    }
  }

  getMode(): ObservabilityMode {
    return this.currentMode;
  }

  setMode(mode: ObservabilityMode): void {
    this.currentMode = mode;
    if (this.projectId) {
      configureMode(mode, this.projectId);
    }
  }

  shouldRecordEvent(event: Omit<Event, 'eventId' | 'ts' | 'monotonicSeq'>): boolean {
    const synthetic = {
      ...event,
      eventId: '',
      ts: 0,
      monotonicSeq: 0,
    } as Event;
    return filterByMode(synthetic, this.currentMode);
  }

  shouldIncludePayload(event: Omit<Event, 'eventId' | 'ts' | 'monotonicSeq'>): boolean {
    switch (this.currentMode) {
      case 'minimal':
        return false;
      case 'standard':
        return !this.isLargePayload(event.payload);
      case 'deep':
        return true;
    }
  }

  private isLargePayload(payload: unknown): boolean {
    if (payload == null) return false;
    return JSON.stringify(payload).length > PAYLOAD_SIZE_LIMIT;
  }

  async processEvent(event: Event): Promise<Event> {
    return processPayloadByMode(event, this.currentMode, this.cas);
  }
}
