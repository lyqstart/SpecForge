/**
 * Daemon Core types and interfaces
 */

export interface AgentIdentity {
  sessionId: string;
  agentRole: string;
  workflowRole: string;
  parentSessionId: string | null;
  workItemId: string;
  spawnIntentId: string;
  createdAt: number;
  lastActiveAt: number;
  status: 'pending' | 'active' | 'history';
}

export interface Event {
  eventId: string;
  ts: number;
  projectId: string;
  action: string;
  payload: Record<string, unknown>;
  metadata: {
    schemaVersion: string;
    source: 'daemon' | 'client' | 'adapter';
  };
}

export interface ProjectState {
  projectPath: string;
  schemaVersion: string;
  activeSessions: string[];
  workItems: WorkItemState[];
  lastEventId: string;
  lastEventTs: number;
}

export interface WorkItemState {
  workItemId: string;
  status: string;
  lastEventId: string;
  lastEventTs: number;
}

export interface HandshakeFile {
  pid: number;
  port: number;
  token: string;
  startedAt: number;
  schemaVersion: string;
}

export interface Lock {
  id: string;
  projectPath: string;
  acquiredAt: number;
  expiresAt: number;
}

export interface Subscription {
  id: string;
  topic: string;
  handler: (event: Event) => void;
}

export interface ConsistencyCheckResult {
  isValid: boolean;
  issues: ConsistencyIssue[];
}

export interface ConsistencyIssue {
  type: 'missing_event' | 'state_mismatch' | 'out_of_order';
  description: string;
  affectedEventId?: string;
  affectedProjectPath?: string;
}

export interface RepairResult {
  success: boolean;
  repairedState: ProjectState;
  repairEvents: Event[];
}
