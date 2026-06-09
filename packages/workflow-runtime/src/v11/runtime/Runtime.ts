/**
 * Runtime.ts — SpecForge v1.1 Runtime Orchestration Layer
 *
 * Central control hub responsible for:
 * - Initializing .specforge/ directory
 * - Loading and validating spec_manifest.json and extension_registry.json
 * - Orchestrating all runtime components
 *
 * Requirements: 8.1-8.25
 */

import { PathService } from './PathService.js';
import { PathPolicy } from './PathPolicy.js';
import { RuntimeInit } from './RuntimeInit.js';
import { StateMachine } from './StateMachine.js';
import { GateRunner } from './GateRunner.js';
import { UserDecisionRecorder } from './UserDecisionRecorder.js';
import { MergeRunner } from './MergeRunner.js';
import { WriteGuard, CodePermissionService, ChangedFilesAudit } from './WriteGuard.js';
import { ExtensionRegistry, ExtensionGate } from './ExtensionRegistry.js';
import { CloseGate } from './CloseGate.js';

// ---- Types ----

export interface RuntimeConfig {
  projectRoot: string;
  projectName: string;
}

export interface RuntimeComponents {
  pathService: PathService;
  pathPolicy: PathPolicy;
  stateMachine: StateMachine | null;
  gateRunner: GateRunner;
  userDecisionRecorder: UserDecisionRecorder;
  mergeRunner: MergeRunner;
  writeGuard: WriteGuard;
  codePermissionService: CodePermissionService;
  changedFilesAudit: ChangedFilesAudit;
  extensionRegistry: ExtensionRegistry;
  extensionGate: ExtensionGate;
  closeGate: CloseGate;
  runtimeInit: RuntimeInit;
}

/**
 * SpecForge v1.1 Runtime — the central control hub.
 *
 * Requirements: 8.1-8.11
 */
export class Runtime {
  private readonly config: RuntimeConfig;
  private readonly components: RuntimeComponents;
  private initialized = false;

  constructor(config: RuntimeConfig) {
    this.config = config;

    // Initialize all components
    const pathService = new PathService(config.projectRoot);
    const pathPolicy = new PathPolicy();
    const runtimeInit = new RuntimeInit(config.projectRoot);

    this.components = {
      pathService,
      pathPolicy,
      stateMachine: null, // Created per work item
      gateRunner: new GateRunner(),
      userDecisionRecorder: new UserDecisionRecorder(),
      mergeRunner: new MergeRunner(),
      writeGuard: new WriteGuard(pathPolicy),
      codePermissionService: new CodePermissionService(),
      changedFilesAudit: new ChangedFilesAudit(),
      extensionRegistry: new ExtensionRegistry(),
      extensionGate: new ExtensionGate(),
      closeGate: new CloseGate(),
      runtimeInit,
    };
  }

  /**
   * Initialize the runtime.
   * Requirements: 8.1
   */
  initialize(): { success: boolean; errors: string[] } {
    const result = this.components.runtimeInit.initialize(this.config.projectName);
    this.initialized = result.success;
    return { success: result.success, errors: result.errors };
  }

  /**
   * Get all runtime components.
   */
  getComponents(): Readonly<RuntimeComponents> {
    return this.components;
  }

  /**
   * Create a state machine for a work item.
   * Requirements: 8.4
   */
  createWorkItemStateMachine(workItemId: string, initialState?: string): StateMachine {
    const sm = new StateMachine(workItemId, initialState as any);
    this.components.stateMachine = sm;
    return sm;
  }

  /**
   * Get the path service.
   * Requirements: 8.12
   */
  getPathService(): PathService {
    return this.components.pathService;
  }

  /**
   * Get the path policy.
   * Requirements: 8.13
   */
  getPathPolicy(): PathPolicy {
    return this.components.pathPolicy;
  }

  /**
   * Get the gate runner.
   * Requirements: 8.5, 8.15
   */
  getGateRunner(): GateRunner {
    return this.components.gateRunner;
  }

  /**
   * Get the user decision recorder.
   * Requirements: 8.6, 8.16
   */
  getUserDecisionRecorder(): UserDecisionRecorder {
    return this.components.userDecisionRecorder;
  }

  /**
   * Get the merge runner.
   * Requirements: 8.7, 8.17
   */
  getMergeRunner(): MergeRunner {
    return this.components.mergeRunner;
  }

  /**
   * Get the write guard.
   * Requirements: 8.9, 8.19
   */
  getWriteGuard(): WriteGuard {
    return this.components.writeGuard;
  }

  /**
   * Get the code permission service.
   * Requirements: 8.8, 8.18
   */
  getCodePermissionService(): CodePermissionService {
    return this.components.codePermissionService;
  }

  /**
   * Get the changed files audit.
   * Requirements: 8.10, 8.20
   */
  getChangedFilesAudit(): ChangedFilesAudit {
    return this.components.changedFilesAudit;
  }

  /**
   * Get the extension registry.
   * Requirements: 5.1, 5.2
   */
  getExtensionRegistry(): ExtensionRegistry {
    return this.components.extensionRegistry;
  }

  /**
   * Get the close gate.
   * Requirements: 8.11, 8.21
   */
  getCloseGate(): CloseGate {
    return this.components.closeGate;
  }

  /**
   * Check if runtime is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Enforce component responsibility boundaries.
   * Requirements: 8.12-8.21
   */
  enforceComponentBoundaries(): {
    pathService: string[];
    pathPolicy: string[];
    stateMachine: string[];
    gateRunner: string[];
    userDecisionRecorder: string[];
    mergeRunner: string[];
    codePermissionService: string[];
    writeGuard: string[];
    changedFilesAudit: string[];
    closeGate: string[];
  } {
    return {
      pathService: ['generate paths only'],
      pathPolicy: ['validate paths only'],
      stateMachine: ['manage state transitions only'],
      gateRunner: ['execute gate checks and generate reports only'],
      userDecisionRecorder: ['record user approval decisions only'],
      mergeRunner: ['execute candidate merges per manifest only'],
      codePermissionService: ['manage code modification permissions only'],
      writeGuard: ['intercept and block unauthorized writes only'],
      changedFilesAudit: ['audit actual file changes against expectations only'],
      closeGate: ['validate close conditions only'],
    };
  }

  /**
   * Enforce agent responsibility boundaries.
   * Requirements: 8.22-8.25
   */
  enforceAgentBoundaries(): {
    allowed: string[];
    forbidden: string[];
  } {
    return {
      allowed: [
        'Generate intent artifacts (candidates, deltas, reports, evidence)',
      ],
      forbidden: [
        'State progression operations (Requirement 8.23)',
        'Permission management operations (Requirement 8.24)',
        'Merge operations (Requirement 8.25)',
      ],
    };
  }
}
