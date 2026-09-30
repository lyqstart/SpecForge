# SpecForge v1.1.3 Daemon Control-Plane Code Responsibility Audit

Generated: 2026-06-18 22:31:41

## 0. 本报告修正说明

AY v1 初始报告因脚本把大量源码/搜索结果原文写入 Markdown，导致报告异常膨胀。AZ v1 已改为摘要式职责审查：只记录职责归属、关键文件、代表性证据和后续判断，不全文嵌入源码。

## 1. 审查结论

SpecForge 当前的真实问题不是单个 handler bug，而是 daemon control-plane 职责没有完全收口：状态、Gate、Candidate manifest、HardStop、Merge、Permission/Audit 等职责已经分布在多个 tool/handler/skill 中，但尚未由统一控制面明确主责和边界。后续不能新增一套平行实现，必须基于现有代码职责进行归并、修正或删除旧代码。

## 2. 职责审查原则

- 先识别现有代码职责，再决定改代码。
- 已有职责相同代码，不新建平行实现。
- 旧代码无用或职责重复，应删除或迁移，保持代码干净。
- Agent/Skill 不承担 daemon 控制面职责。
- daemon/tool 应承担状态、Gate、Manifest、Merge、权限、审计、HardStop 的确定性执行。

## 3. 关键目录清单

### packages/daemon-core/src/tools/handlers
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts`
- `packages/daemon-core/src/tools/handlers/sf-batch-verify.ts`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts`
- `packages/daemon-core/src/tools/handlers/sf-context-build.ts`
- `packages/daemon-core/src/tools/handlers/sf-continuity.ts`
- `packages/daemon-core/src/tools/handlers/sf-cost-report.ts`
- `packages/daemon-core/src/tools/handlers/sf-design-gate.ts`
- `packages/daemon-core/src/tools/handlers/sf-doc-lint.ts`
- `packages/daemon-core/src/tools/handlers/sf-doctor.ts`
- `packages/daemon-core/src/tools/handlers/sf-knowledge-base.ts`
- `packages/daemon-core/src/tools/handlers/sf-knowledge-graph.ts`
- `packages/daemon-core/src/tools/handlers/sf-knowledge-query.ts`
- `packages/daemon-core/src/tools/handlers/sf-requirements-gate.ts`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts`
- `packages/daemon-core/src/tools/handlers/sf-state-read.ts`
- `packages/daemon-core/src/tools/handlers/sf-state-transition.ts`
- `packages/daemon-core/src/tools/handlers/sf-tasks-gate.ts`
- `packages/daemon-core/src/tools/handlers/sf-trace-matrix.ts`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-170820`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-174707`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v11.20260615-224735`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v6.20260615-174920`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v7.20260615-211032`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v7.20260615-211051`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v8.20260615-211504`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v9.20260615-211850`
- `packages/daemon-core/src/tools/handlers/sf-v11-code-permission.ts`
- `packages/daemon-core/src/tools/handlers/sf-v11-decision.ts`
- `packages/daemon-core/src/tools/handlers/sf-v11-extension.ts`
- `packages/daemon-core/src/tools/handlers/sf-v11-gate-run.ts`
- `packages/daemon-core/src/tools/handlers/sf-v11-handoff.ts`
- `packages/daemon-core/src/tools/handlers/sf-v11-merge.ts`
- `packages/daemon-core/src/tools/handlers/sf-v11-rollback.ts`
- `packages/daemon-core/src/tools/handlers/sf-v11-spec-migration.ts`
- `packages/daemon-core/src/tools/handlers/sf-v11-verification.ts`
- `packages/daemon-core/src/tools/handlers/sf-v11-work-item-create.ts`
- `packages/daemon-core/src/tools/handlers/sf-verification-gate.ts`

### packages/daemon-core/src
- `packages/daemon-core/src/.gitkeep`
- `packages/daemon-core/src/agent/KnowledgeTrigger.ts`
- `packages/daemon-core/src/cas/ContentAddressableStorage.ts`
- `packages/daemon-core/src/cas/index.ts`
- `packages/daemon-core/src/daemon/Daemon.ts`
- `packages/daemon-core/src/daemon/DaemonConfig.ts`
- `packages/daemon-core/src/daemon/HandshakeManager.ts`
- `packages/daemon-core/src/daemon/path-resolver.ts`
- `packages/daemon-core/src/event-adapter.ts`
- `packages/daemon-core/src/event-bus/EventBus.d.ts`
- `packages/daemon-core/src/event-bus/EventBus.d.ts.map`
- `packages/daemon-core/src/event-bus/EventBus.js`
- `packages/daemon-core/src/event-bus/EventBus.js.map`
- `packages/daemon-core/src/event-bus/EventBus.test.ts`
- `packages/daemon-core/src/event-bus/EventBus.ts`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts`
- `packages/daemon-core/src/extensions/index.ts`
- `packages/daemon-core/src/extensions/skill/SkillLoader.ts`
- `packages/daemon-core/src/extensions/skill/SkillMatcher.ts`
- `packages/daemon-core/src/extensions/skill/SkillRegistry.ts`
- `packages/daemon-core/src/extensions/skill/index.ts`
- `packages/daemon-core/src/extensions/skill/types.ts`
- `packages/daemon-core/src/http/HTTPServer.test.ts`
- `packages/daemon-core/src/http/HTTPServer.ts`
- `packages/daemon-core/src/index.ts`
- `packages/daemon-core/src/logs/JsonlAppender.ts`
- `packages/daemon-core/src/observability/observability-config.ts`
- `packages/daemon-core/src/observability/observability-recorder.ts`
- `packages/daemon-core/src/observability/redaction.ts`
- `packages/daemon-core/src/observability/trace.ts`
- `packages/daemon-core/src/payload-handler.ts`
- `packages/daemon-core/src/payload-handler/index.ts`
- `packages/daemon-core/src/plugin-loader.d.ts`
- `packages/daemon-core/src/project/ProjectManager.test.ts`
- `packages/daemon-core/src/project/ProjectManager.ts`
- `packages/daemon-core/src/recovery/RecoverySubsystem.test.ts`
- `packages/daemon-core/src/recovery/RecoverySubsystem.ts`
- `packages/daemon-core/src/retry/RetryCounter.ts`
- `packages/daemon-core/src/retry/index.ts`
- `packages/daemon-core/src/retry/types.ts`
- `packages/daemon-core/src/session/AgentIdentity.d.ts`
- `packages/daemon-core/src/session/AgentIdentity.d.ts.map`
- `packages/daemon-core/src/session/AgentIdentity.js`
- `packages/daemon-core/src/session/AgentIdentity.js.map`
- `packages/daemon-core/src/session/AgentIdentity.ts`
- `packages/daemon-core/src/session/SessionRegistry.d.ts`
- `packages/daemon-core/src/session/SessionRegistry.d.ts.map`
- `packages/daemon-core/src/session/SessionRegistry.js`
- `packages/daemon-core/src/session/SessionRegistry.js.map`
- `packages/daemon-core/src/session/SessionRegistry.test.ts`
- `packages/daemon-core/src/session/SessionRegistry.ts`
- `packages/daemon-core/src/state/StateManager.test.ts`
- `packages/daemon-core/src/state/StateManager.ts`
- `packages/daemon-core/src/tools/ToolDispatcher.ts`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts`
- `packages/daemon-core/src/tools/handlers/sf-batch-verify.ts`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts`
- `packages/daemon-core/src/tools/handlers/sf-context-build.ts`
- `packages/daemon-core/src/tools/handlers/sf-continuity.ts`
- `packages/daemon-core/src/tools/handlers/sf-cost-report.ts`
- `packages/daemon-core/src/tools/handlers/sf-design-gate.ts`
- `packages/daemon-core/src/tools/handlers/sf-doc-lint.ts`
- `packages/daemon-core/src/tools/handlers/sf-doctor.ts`
- `packages/daemon-core/src/tools/handlers/sf-knowledge-base.ts`
- `packages/daemon-core/src/tools/handlers/sf-knowledge-graph.ts`
- `packages/daemon-core/src/tools/handlers/sf-knowledge-query.ts`
- `packages/daemon-core/src/tools/handlers/sf-requirements-gate.ts`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts`
- `packages/daemon-core/src/tools/handlers/sf-state-read.ts`
- `packages/daemon-core/src/tools/handlers/sf-state-transition.ts`
- `packages/daemon-core/src/tools/handlers/sf-tasks-gate.ts`
- `packages/daemon-core/src/tools/handlers/sf-trace-matrix.ts`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-170820`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-174707`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v11.20260615-224735`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v6.20260615-174920`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v7.20260615-211032`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v7.20260615-211051`
- ... 已截断，仅列前 80 个文件。

### packages/workflow-runtime
- `packages/workflow-runtime/.eslintrc.json`
- `packages/workflow-runtime/.gitignore`
- `packages/workflow-runtime/AGENT_INTEGRATION_IMPLEMENTATION_SUMMARY.md`
- `packages/workflow-runtime/EVENT_REPLAY_COMPLETION_SUMMARY.md`
- `packages/workflow-runtime/GATE_ERROR_HANDLING_IMPLEMENTATION_SUMMARY.md`
- `packages/workflow-runtime/STATE_RECOVERY_IMPLEMENTATION_SUMMARY.md`
- `packages/workflow-runtime/TASK_1_5_COMPLETION.md`
- `packages/workflow-runtime/docs/API.md`
- `packages/workflow-runtime/docs/DEPLOYMENT.md`
- `packages/workflow-runtime/docs/EXAMPLES.md`
- `packages/workflow-runtime/docs/GateResult.md`
- `packages/workflow-runtime/docs/WORKFLOW_DEFINITION_LOADER.md`
- `packages/workflow-runtime/docs/state-recovery-mechanism.md`
- `packages/workflow-runtime/docs/storage-implementation.md`
- `packages/workflow-runtime/examples/agent-integration-example.ts`
- `packages/workflow-runtime/examples/state-recovery-example.ts`
- `packages/workflow-runtime/examples/storage-example.ts`
- `packages/workflow-runtime/package.json`
- `packages/workflow-runtime/src/AgentRunner.ts`
- `packages/workflow-runtime/src/EventPublisher.ts`
- `packages/workflow-runtime/src/GateRunner.ts`
- `packages/workflow-runtime/src/StateRecoveryManager.ts`
- `packages/workflow-runtime/src/WorkflowEngine.ts`
- `packages/workflow-runtime/src/WorkflowErrorHandling.ts`
- `packages/workflow-runtime/src/WorkflowPersistence.ts`
- `packages/workflow-runtime/src/agent/LLMKernelIntegration.ts`
- `packages/workflow-runtime/src/agent/index.ts`
- `packages/workflow-runtime/src/engine/AgentWorkflowEngine.ts`
- `packages/workflow-runtime/src/engine/WorkflowEngine.ts`
- `packages/workflow-runtime/src/engine/WorkflowInstance.ts`
- `packages/workflow-runtime/src/engine/WorkflowLoader.ts`
- `packages/workflow-runtime/src/engine/index.ts`
- `packages/workflow-runtime/src/error-handler.ts`
- `packages/workflow-runtime/src/error-propagation.ts`
- `packages/workflow-runtime/src/event-filter.ts`
- `packages/workflow-runtime/src/event-integration.ts`
- `packages/workflow-runtime/src/event-subscription.ts`
- `packages/workflow-runtime/src/events/EventLogReader.ts`
- `packages/workflow-runtime/src/events/EventPublisher.ts`
- `packages/workflow-runtime/src/events/EventTypes.ts`
- `packages/workflow-runtime/src/events/index.ts`
- `packages/workflow-runtime/src/gates/AgentGateRunner.ts`
- `packages/workflow-runtime/src/gates/BasicGates.ts`
- `packages/workflow-runtime/src/gates/CompositeGateSerializer.ts`
- `packages/workflow-runtime/src/gates/index.ts`
- `packages/workflow-runtime/src/index.ts`
- `packages/workflow-runtime/src/loaders/WorkflowDefinitionLoader.ts`
- `packages/workflow-runtime/src/loaders/index.ts`
- `packages/workflow-runtime/src/rbac/AuthorizationAuditLogger.ts`
- `packages/workflow-runtime/src/rbac/FileAuthorizationPolicy.ts`
- `packages/workflow-runtime/src/rbac/PrincipalResolver.ts`
- `packages/workflow-runtime/src/rbac/ProtectedFileMatcher.ts`
- `packages/workflow-runtime/src/rbac/RBACEngine.ts`
- `packages/workflow-runtime/src/rbac/TransitionAuthorizer.ts`
- `packages/workflow-runtime/src/rbac/index.ts`
- `packages/workflow-runtime/src/retry.ts`
- `packages/workflow-runtime/src/storage/AtomicWorkflowInstanceStorage.ts`
- `packages/workflow-runtime/src/storage/WorkflowInstanceStorage.ts`
- `packages/workflow-runtime/src/storage/index.ts`
- `packages/workflow-runtime/src/types.ts`
- `packages/workflow-runtime/src/types/gate-definition.ts`
- `packages/workflow-runtime/src/types/gate-result.ts`
- `packages/workflow-runtime/src/types/index.ts`
- `packages/workflow-runtime/src/types/state-machine.ts`
- `packages/workflow-runtime/src/types/workflow-definition.ts`
- `packages/workflow-runtime/src/types/workflow-instance.ts`
- `packages/workflow-runtime/src/v11/index.ts`
- `packages/workflow-runtime/src/v11/runtime/CloseGate.ts`
- `packages/workflow-runtime/src/v11/runtime/ExtensionRegistry.ts`
- `packages/workflow-runtime/src/v11/runtime/ExtensionSubflow.ts`
- `packages/workflow-runtime/src/v11/runtime/GateRunner.ts`
- `packages/workflow-runtime/src/v11/runtime/JsonParser.ts`
- `packages/workflow-runtime/src/v11/runtime/MergeRunner.ts`
- `packages/workflow-runtime/src/v11/runtime/PathPolicy.ts`
- `packages/workflow-runtime/src/v11/runtime/PathService.ts`
- `packages/workflow-runtime/src/v11/runtime/Runtime.ts`
- `packages/workflow-runtime/src/v11/runtime/RuntimeInit.ts`
- `packages/workflow-runtime/src/v11/runtime/StateMachine.ts`
- `packages/workflow-runtime/src/v11/runtime/UserDecisionRecorder.ts`
- `packages/workflow-runtime/src/v11/runtime/WriteGuard.ts`
- ... 已截断，仅列前 80 个文件。

### setup/userlevel-opencode/skills
- `setup/userlevel-opencode/skills/.gitkeep`
- `setup/userlevel-opencode/skills/sf-intake/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-bugfix-spec/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-change-request/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-design-first/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-investigation/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-ops-task/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-quick-change/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-refactor/SKILL.md`
- `setup/userlevel-opencode/skills/superpowers-brainstorming/SKILL.md`
- `setup/userlevel-opencode/skills/superpowers-code-review/SKILL.md`
- `setup/userlevel-opencode/skills/superpowers-engineering-lessons/SKILL.md`
- `setup/userlevel-opencode/skills/superpowers-knowledge-extraction/SKILL.md`
- `setup/userlevel-opencode/skills/superpowers-subagent-driven-development/SKILL.md`
- `setup/userlevel-opencode/skills/superpowers-systematic-debugging/SKILL.md`
- `setup/userlevel-opencode/skills/superpowers-tdd/SKILL.md`
- `setup/userlevel-opencode/skills/superpowers-verification-before-completion/SKILL.md`
- `setup/userlevel-opencode/skills/superpowers-writing-plans/SKILL.md`

### setup/userlevel-opencode/agents
- `setup/userlevel-opencode/agents/.gitkeep`
- `setup/userlevel-opencode/agents/_AGENT_BASE.md`
- `setup/userlevel-opencode/agents/sf-debugger.md`
- `setup/userlevel-opencode/agents/sf-design.md`
- `setup/userlevel-opencode/agents/sf-evidence-collector.md`
- `setup/userlevel-opencode/agents/sf-executor.md`
- `setup/userlevel-opencode/agents/sf-extension.md`
- `setup/userlevel-opencode/agents/sf-investigator.md`
- `setup/userlevel-opencode/agents/sf-knowledge.md`
- `setup/userlevel-opencode/agents/sf-orchestrator.md`
- `setup/userlevel-opencode/agents/sf-requirements.md`
- `setup/userlevel-opencode/agents/sf-reviewer.md`
- `setup/userlevel-opencode/agents/sf-task-planner.md`
- `setup/userlevel-opencode/agents/sf-verifier.md`

## 4. 职责证据摘要

### 4.x state_control

#### pattern: `state`
- `packages/daemon-core/src/daemon/Daemon.ts:69:      // onTransition no longer set — persistence handled by sf_state_transition handler`
- `packages/daemon-core/src/daemon/Daemon.ts:79:      stateManager: undefined as any,`
- `packages/daemon-core/src/daemon/Daemon.ts:88:        stateManager: undefined,`
- `packages/daemon-core/src/daemon/path-resolver.ts:76:  /** state.json path for a project */`
- `packages/daemon-core/src/daemon/path-resolver.ts:88:  /** Daemon state.json path (under daemon runtime dir) */`
- `packages/daemon-core/src/daemon/path-resolver.ts:159:    return path.join(this.resolveProjectRuntimeDir(projectPath), 'state.json');`
- `packages/daemon-core/src/daemon/path-resolver.ts:183:   * @deprecated Daemon-global state is no longer supported.`
- `packages/daemon-core/src/daemon/path-resolver.ts:188:    return path.join(this.resolveDaemonRuntimeDir(), 'state.json');`
- `packages/daemon-core/src/daemon/path-resolver.ts:218:    return path.join(this.resolveProjectRuntimeDir(projectPath), 'state.json');`
- `packages/daemon-core/src/daemon/path-resolver.ts:242:   * @deprecated Daemon-global state is no longer supported.`
- `packages/daemon-core/src/daemon/path-resolver.ts:247:    return path.join(this.resolveDaemonRuntimeDir(), 'state.json');`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts:175:  private publishEvent(state: ExtensionLoadState): void {`

#### pattern: `StateManager`
- `packages/daemon-core/src/daemon/path-resolver.ts:5: * enterprise modes. Currently StateManager, WAL, RecoverySubsystem, and`
- `packages/daemon-core/src/daemon/path-resolver.ts:129:// StateManager, and RecoverySubsystem)`
- `packages/daemon-core/src/http/HTTPServer.ts:26:import { StateManager } from '../state/StateManager';`
- `packages/daemon-core/src/http/HTTPServer.ts:101:  stateManager: StateManager;`
- `packages/daemon-core/src/index.ts:12:export { StateManager } from './state/StateManager';`
- `packages/daemon-core/src/project/ProjectManager.test.ts:6:import type { StateManager } from '../state/StateManager';`
- `packages/daemon-core/src/project/ProjectManager.test.ts:36:/** Minimal mock StateManager for unit tests */`
- `packages/daemon-core/src/project/ProjectManager.test.ts:37:function createMockStateManager(): StateManager {`
- `packages/daemon-core/src/project/ProjectManager.test.ts:38:  return {} as StateManager;`
- `packages/daemon-core/src/project/ProjectManager.test.ts:97:    manager = new ProjectManager(new EventBus(), createMockPathResolver(), createMockStateManager());`
- `packages/daemon-core/src/project/ProjectManager.test.ts:131:      // All projects share the daemon global StateManager`
- `packages/daemon-core/src/project/ProjectManager.test.ts:132:      expect(manager.getDaemonStateManager()).toBe(manager.getDaemonStateManager());`

#### pattern: `stateManager`
- `packages/daemon-core/src/daemon/Daemon.ts:79:      stateManager: undefined as any,`
- `packages/daemon-core/src/daemon/Daemon.ts:88:        stateManager: undefined,`
- `packages/daemon-core/src/http/HTTPServer.test.ts:101:      stateManager: undefined as any,`
- `packages/daemon-core/src/http/HTTPServer.ts:101:  stateManager: StateManager;`
- `packages/daemon-core/src/http/HTTPServer.ts:859:    if (!this.deps.stateManager) {`
- `packages/daemon-core/src/http/HTTPServer.ts:860:      this.sendJsonResponse(res, 200, this.successBody({ message: 'state/read (no stateManager)', workItemId: wid ?? null }));`
- `packages/daemon-core/src/http/HTTPServer.ts:866:        const all = await (this.deps.stateManager as any).getAllStates();`
- `packages/daemon-core/src/http/HTTPServer.ts:872:      const state = await (this.deps.stateManager as any).getState(wid);`
- `packages/daemon-core/src/project/ProjectManager.ts:24:  stateManager?: StateManager;`
- `packages/daemon-core/src/recovery/RecoverySubsystem.test.ts:189:  it('should use daemon-global paths when wal and stateManager are injected', () => {`
- `packages/daemon-core/src/recovery/RecoverySubsystem.test.ts:208:  it('should use project-level paths when wal/stateManager are not injected (legacy)', () => {`
- `packages/daemon-core/src/recovery/RecoverySubsystem.test.ts:209:    // subsystem from beforeEach has no injected wal/stateManager`

#### pattern: `current_state`
- `packages/daemon-core/src/state/StateManager.test.ts:136:            current_state: 'completed',`
- `packages/daemon-core/src/state/StateManager.ts:171:    const currentState = current?.current_state ?? '';`
- `packages/daemon-core/src/state/StateManager.ts:410:        current_state: toState,`
- `packages/daemon-core/src/state/StateManager.ts:419:        current_state: toState,`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:117:          current_state: item.current_state ?? item.status,`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:148:  state.current_state = "closed";`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:162:    current_state: "closed",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:518:      ? String(runtimeState.current_state ?? "")`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:529:        error: `Close gate requires one of ${Array.from(CLOSE_ALLOWED_STATES).join(", ")}, current work_item.status='${workItemState}', runtime.current_state='${runtimeCurrentState || "N/A"}'`,`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931:107:          current_state: item.current_state ?? item.status,`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931:138:  state.current_state = "closed";`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931:152:    current_state: "closed",`

#### pattern: `work_item`
- `packages/daemon-core/src/http/HTTPServer.ts:1586:        tool: 'sf_v11_work_item_create',`
- `packages/daemon-core/src/http/HTTPServer.ts:1856:      const wiDir = path.join(resolvedProjectPath, SPEC_DIR_NAME, 'work-items', wiCtx.workItem.work_item_id);`
- `packages/daemon-core/src/http/HTTPServer.ts:1921:          const wiDir = path.join(resolvedProjectPath, SPEC_DIR_NAME, 'work-items', wiCtx.workItem.work_item_id);`
- `packages/daemon-core/src/http/HTTPServer.ts:2002:        const wiPath = pathModule.join(workItemsDir, dir, 'work_item.json');`
- `packages/daemon-core/src/http/HTTPServer.ts:2009:              work_item_id: wi.work_item_id,`
- `packages/daemon-core/src/observability/observability-recorder.ts:36:  work_item_id?: string;`
- `packages/daemon-core/src/observability/observability-recorder.ts:176:      work_item_id: input.work_item_id,`
- `packages/daemon-core/src/observability/observability-recorder.ts:201:      work_item_id: input.work_item_id,`
- `packages/daemon-core/src/state/StateManager.test.ts:134:            work_item_id: 'WI-EXT-T01',`
- `packages/daemon-core/src/state/StateManager.test.ts:148:      expect(state.workItems.some((wi: any) => wi.work_item_id === 'WI-EXT-T01')).toBe(true);`
- `packages/daemon-core/src/state/StateManager.ts:46:  /** In-memory state map: work_item_id → WorkItemState */`
- `packages/daemon-core/src/state/StateManager.ts:186:        work_item_id: workItemId,`

#### pattern: `runtime/state.json`
- `packages/daemon-core/src/project/ProjectManager.test.ts:25:    resolveStatePath: (p: string) => `${base}/${p}/.specforge/runtime/state.json`,`
- `packages/daemon-core/src/project/ProjectManager.test.ts:31:    resolveDaemonStatePath: () => `${base}/.specforge/runtime/state.json`,`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:5: * - Reads runtime/state.json as the state-machine truth source when available.`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:7: * - Advances work_item.json and runtime/state.json to closed after Close Gate passes.`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931:5: * - Reads runtime/state.json as the state-machine truth source when available.`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931:7: * - Advances work_item.json and runtime/state.json to closed after Close Gate passes.`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-170820:5: * - Reads runtime/state.json as the state-machine truth source when available.`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-170820:7: * - Advances work_item.json and runtime/state.json to closed after Close Gate passes.`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-174707:5: * - Reads runtime/state.json as the state-machine truth source when available.`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-174707:7: * - Advances work_item.json and runtime/state.json to closed after Close Gate passes.`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v11.20260615-224735:5: * - Reads runtime/state.json as the state-machine truth source when available.`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v11.20260615-224735:7: * - Advances work_item.json and runtime/state.json to closed after Close Gate passes.`

#### pattern: `WorkflowInstance`
- `packages/workflow-runtime/docs/API.md:105:##### `createInstance(workflowId: string): WorkflowInstance``
- `packages/workflow-runtime/docs/API.md:122:##### `getInstance(instanceId: string): WorkflowInstance | undefined``
- `packages/workflow-runtime/docs/API.md:139:##### `async execute(instanceId: string): Promise<WorkflowInstance>``
- `packages/workflow-runtime/docs/API.md:179:##### `pause(instanceId: string): WorkflowInstance``
- `packages/workflow-runtime/docs/API.md:194:##### `async resume(instanceId: string): Promise<WorkflowInstance>``
- `packages/workflow-runtime/docs/API.md:211:##### `getAllInstances(): WorkflowInstance[]``
- `packages/workflow-runtime/docs/API.md:585:### WorkflowInstance`
- `packages/workflow-runtime/docs/API.md:590:interface WorkflowInstance {`
- `packages/workflow-runtime/docs/API.md:595:  status: WorkflowInstanceStatus;`
- `packages/workflow-runtime/docs/API.md:618:  instance: WorkflowInstance;`
- `packages/workflow-runtime/docs/API.md:777:### WorkflowInstanceStatus`
- `packages/workflow-runtime/docs/API.md:780:type WorkflowInstanceStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';`

#### pattern: `transition`
- `packages/daemon-core/src/daemon/Daemon.ts:69:      // onTransition no longer set — persistence handled by sf_state_transition handler`
- `packages/daemon-core/src/extensions/skill/SkillLoader.ts:25:   * Load skills for a given phase transition`
- `packages/daemon-core/src/extensions/skill/SkillLoader.ts:26:   * Called by WorkflowEngine after a state transition`
- `packages/daemon-core/src/http/HTTPServer.ts:286:    this.addExactRoute('POST', '/api/v1/state/transition', this.handleStateTransition.bind(this));`
- `packages/daemon-core/src/http/HTTPServer.ts:901:        message: 'state/transition (no workflowEngine)',`
- `packages/daemon-core/src/http/HTTPServer.ts:908:      const result = await (this.deps.workflowEngine as any).transitionFull({`
- `packages/daemon-core/src/http/HTTPServer.ts:914:        transitionContext: (request as any).transitionContext,`
- `packages/daemon-core/src/state/StateManager.test.ts:115:      await stateManager.transition(wiId, '', 'intake', 'test');`
- `packages/daemon-core/src/state/StateManager.ts:24: * All state transitions must move between these states.`
- `packages/daemon-core/src/state/StateManager.ts:49:  /** Last event ID from the WAL (tracked for all events, not just transitions) */`
- `packages/daemon-core/src/state/StateManager.ts:103:   * Perform a state transition for a Work Item.`
- `packages/daemon-core/src/state/StateManager.ts:106:   *   1. Validate transition is legal (from_state matches current state)`


### 4.x gate_control

#### pattern: `sf_gate_run`
- `packages/daemon-core/src/tools/index.ts:39:// OpenCode tool files call daemon via public names (sf_gate_run, sf_code_permission, etc.)`
- `packages/daemon-core/src/tools/index.ts:44:  'sf_gate_run': 'sf_v11_gate_run',`
- `packages/daemon-core/src/tools/lib/hard-stop-latch.ts:81:  'sf_gate_run',`
- `packages/daemon-core/src/tools/lib/tool-aliases-v11.ts:17:  sf_gate_run: 'sf_v11_gate_run',`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:45:3. **绝不跳过 Gate 检查**——每个阶段完成后必须调用 `sf_gate_run``
- `setup/userlevel-opencode/agents/sf-orchestrator.md:148:所有质量门禁统一通过 `sf_gate_run` 调用：`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:151:子 Agent 完成 → sf_doc_lint → sf_gate_run（work_item_id, gate_ids?；默认由 daemon 根据 workflow_path 运行应执行 Gate）`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:156:**sf_gate_run 统一处理所有类型的 Gate**（requirements、design、tasks、verification、close 等），不再分别调用各自独立的 Gate 工具。状态推进由 daemon 内部 WorkflowEngine 完成，sf-orchestrator 不直接调用状态推进 API。`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:209:WI 流转到 `closed` 之前，必须调用 `sf_close_gate`（通过 sf_gate_run 触发）。`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:248:  → sf_gate_run 验证 → sf_merge_run 合并到正式 registry`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:263:| 不得写 `gates/**` | Gate 结果由 sf_gate_run 写入 |`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:296:**普通 Agent 不得直接推进 WI 状态**。所有状态变更由 daemon 内部的 WorkflowEngine 管理，sf-orchestrator 通过 sf_gate_run / sf_close_gate / sf_merge_run 间接触发。`

#### pattern: `gate`
- `packages/daemon-core/src/daemon/Daemon.ts:65:        gate: true,`
- `packages/daemon-core/src/daemon/DaemonConfig.ts:119:  /** @deprecated — delegated to pathResolver, kept for backward compatibility */`
- `packages/daemon-core/src/daemon/DaemonConfig.ts:124:  /** @deprecated — delegated to pathResolver, kept for backward compatibility */`
- `packages/daemon-core/src/event-bus/EventBus.d.ts:59:     * @param category Event category (e.g., 'workflow', 'gate') or '*' for all categories`
- `packages/daemon-core/src/event-bus/EventBus.js:204:     * @param category Event category (e.g., 'workflow', 'gate') or '*' for all categories`
- `packages/daemon-core/src/event-bus/EventBus.ts:244:   * @param category Event category (e.g., 'workflow', 'gate') or '*' for all categories`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts:39:  | 'gate'`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts:72:    gate?: boolean;`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts:94:      gate: true,`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts:216:    const loadOrder: ExtensionType[] = ['plugin', 'skill', 'tool', 'workflow', 'gate'];`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts:277:        case 'gate':`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts:429:      type: 'gate',`

#### pattern: `Gate`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts:8: * - Gate Registry`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts:278:          state = await this.loadGates();`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts:422:   * 加载 Gate 扩展`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts:424:   * 占位实现：Gate Registry 尚未在本任务中实现`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts:426:  private async loadGates(): Promise<ExtensionLoadState> {`
- `packages/daemon-core/src/extensions/ExtensionLoader.ts:427:    // TODO: 实现 Gate Registry 集成`
- `packages/daemon-core/src/http/HTTPServer.ts:302:    this.addExactRoute('POST', '/api/v1/v11/gate/run', this.handleV11GateRun.bind(this));`
- `packages/daemon-core/src/http/HTTPServer.ts:1599:  private async handleV11GateRun(`
- `packages/daemon-core/src/index.ts:30:  checkCloseGateEvidenceRequirements,`
- `packages/daemon-core/src/index.ts:36:  runGate,`
- `packages/daemon-core/src/index.ts:37:  runRequiredGates,`
- `packages/daemon-core/src/index.ts:38:  registerGate,`

#### pattern: `gate_summary`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:10: * - R7.1: refreshes stale gate_summary_gate.json after close and normalizes write_guard_log create/modify semantics from filesystem diff.`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:398:  const summaryPath = path.join(workItemDir, "gate_summary.md");`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:411:    gate_id: "gate_summary_gate",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:418:        check_id: "gate_summary_exists",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:419:        description: "gate_summary.md exists",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:434:    path.join(gatesDir, "gate_summary_gate.json"),`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931:10: * - R7.1: refreshes stale gate_summary_gate.json after close and normalizes write_guard_log create/modify semantics from filesystem diff.`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931:282:  const summaryPath = path.join(workItemDir, "gate_summary.md");`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931:295:    gate_id: "gate_summary_gate",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931:302:        check_id: "gate_summary_exists",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931:303:        description: "gate_summary.md exists",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931:318:    path.join(gatesDir, "gate_summary_gate.json"),`

#### pattern: `verification_gate`
- `packages/daemon-core/src/tools/handlers/sf-v11-gate-run.ts:30:  'verification_gate',`
- `packages/daemon-core/src/tools/handlers/sf-v11-gate-run.ts:100:        gateIds.push('verification_gate');`
- `packages/daemon-core/src/tools/handlers/sf-verification-gate.ts:2:import { checkVerificationGate } from '../lib/sf_verification_gate_core';`
- `packages/daemon-core/src/tools/handlers/sf-verification-gate.ts:3:import type { VerificationGateMode } from '../lib/sf_verification_gate_core';`
- `packages/daemon-core/src/tools/handlers/sf-verification-gate.ts:5:registerHandler('sf_verification_gate', async (args, context, _deps) => {`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:40:  | 'verification_gate'`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:384: * §9.2 verification_gate — 验证检查（§13.5）`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:386:registerGate('verification_gate', 'hard_gate', true, async (ctx) => {`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:409:  return makeReport(ctx.workItemId, 'verification_gate', 'hard_gate', true, checks, [reportPath, manifestPath]);`
- `packages/daemon-core/src/tools/lib/required-gates.ts:41:      return [...common, 'path_policy_gate', 'candidate_manifest_gate', 'verification_gate'];`
- `packages/daemon-core/src/tools/lib/sf_markdown_verification_parser.ts:6: * 供 sf_doc_lint_core.ts、sf_tasks_gate_core.ts、sf_verification_gate_core.ts 和 sf-verifier 导入，`
- `packages/daemon-core/src/tools/lib/sf_verification_gate_core.ts:2: * sf_verification_gate 核心逻辑`

#### pattern: `close_gate`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:55:  close_gate: CloseGateResult | null;`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:469:registerHandler("sf_close_gate", async (args, context, _deps) => {`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:486:    close_gate: null,`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:493:  const hardStopGuard = guardHardStop(projectRoot, workItemId, "sf_close_gate");`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:557:        error: "trigger_result.json not found — required for close_gate",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:583:        error: "candidate_manifest.json not found — required for close_gate",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:615:        error: "merge_report.md not found — required for close_gate",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:624:        error: "verification_report.md not found — required for close_gate",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:643:          "evidence/evidence_manifest.json not found — required for close_gate",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:766:    result.close_gate = closeGateResult;`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:771:      path.join(gatesDir, "close_gate.json"),`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:784:        evidence_path: path.join(gatesDir, "close_gate.json"),`


### 4.x hard_stop_write_guard

#### pattern: `hard_stop`
- `packages/daemon-core/src/http/HTTPServer.ts:1847:        hard_stop: true,`
- `packages/daemon-core/src/http/HTTPServer.ts:1901:        hard_stop: true,`
- `packages/daemon-core/src/http/HTTPServer.ts:1909:        hard_stop: true,`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:271:    return { success: false, error: idError, hard_stop: false, retry_allowed: true }`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:279:      hard_stop: true,`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:280:      hard_stop_record: guardResult.hard_stop_record,`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:333:        hard_stop: false,`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:369:    return { success: false, error: `ARTIFACT_WRITE_FAILED: ${err.message}`, hard_stop: true }`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:59:      hard_stop: true,`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:60:      hard_stop_record: hardStopGuard.hard_stop_record,`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:72:      hard_stop: true,`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:90:      hard_stop: true,`

#### pattern: `HardStop`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:18:import { guardHardStop, setHardStop } from '../lib/hard-stop-latch'`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:274:  const guardResult = guardHardStop(baseDir, workItemId, 'sf_artifact_write')`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:368:    setHardStop(baseDir, workItemId, `ARTIFACT_WRITE_FAILED: ${err.message}`, 'sf_artifact_write')`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:18:import { guardHardStop, setHardStop } from '../lib/hard-stop-latch';`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:54:  const hardStopGuard = guardHardStop(projectRoot, workItemId, 'sf_changed_files_audit');`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:68:    setHardStop(projectRoot, workItemId, 'WORK_ITEM_JSON_NOT_FOUND', 'sf_changed_files_audit');`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:86:    setHardStop(projectRoot, workItemId, 'CODE_PERMISSION_NOT_ENABLED', 'sf_changed_files_audit');`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:102:    setHardStop(projectRoot, workItemId, 'ALLOWED_WRITE_FILES_EMPTY', 'sf_changed_files_audit');`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts:4:import { checkHardStop } from '../lib/hard-stop-latch';`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts:51:    const { blocked, record } = checkHardStop(baseDir, activeWiId);`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts:71:      const { setHardStop } = await import('../lib/hard-stop-latch');`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts:72:      setHardStop(baseDir, activeWiId, 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL', 'sf_safe_bash');`

#### pattern: `WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL`
- `packages/daemon-core/src/http/HTTPServer.ts:1846:        reason: 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL',`
- `packages/daemon-core/src/http/HTTPServer.ts:1900:        reason: 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL — cannot write .specforge/work-items/ via bash/shell; use sf_artifact_write or other SpecForge controlled tools',`
- `packages/daemon-core/src/http/HTTPServer.ts:1908:        reason: 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL — expected files include .specforge/work-items/ path; use sf_artifact_write',`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts:72:      setHardStop(baseDir, activeWiId, 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL', 'sf_safe_bash');`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts:76:      error: 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL: Cannot use sf_safe_bash to create/write .specforge/work-items/ paths. Use sf_artifact_write or sf_state_transition instead.',`

#### pattern: `sf_safe_bash`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:82:    // agents never need sf_safe_bash/Copy-Item inside .specforge/work-items.`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts:2:import { safeBashExecute } from '../lib/sf_safe_bash_core';`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts:44:registerHandler('sf_safe_bash', async (args, context, _deps) => {`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts:57:          `sf_safe_bash is blocked during hard_stop.`,`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts:72:      setHardStop(baseDir, activeWiId, 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL', 'sf_safe_bash');`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts:76:      error: 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL: Cannot use sf_safe_bash to create/write .specforge/work-items/ paths. Use sf_artifact_write or sf_state_transition instead.',`
- `packages/daemon-core/src/tools/lib/hard-stop-latch.ts:75:  'sf_safe_bash',`
- `packages/daemon-core/src/tools/lib/sf_safe_bash_core.ts:2: * sf_safe_bash 核心入口`
- `packages/daemon-core/src/tools/lib/sf_safe_bash_core.ts:20:import type { SafeBashArgs, SafeBashResult } from "./sf_safe_bash_types"`
- `packages/daemon-core/src/tools/lib/sf_safe_bash_core.ts:21:import { applyRules } from "./sf_safe_bash_rules"`
- `packages/daemon-core/src/tools/lib/sf_safe_bash_core.ts:22:import { executeCommand, resolveCwd } from "./sf_safe_bash_executor"`
- `packages/daemon-core/src/tools/lib/sf_safe_bash_core.ts:48:/** Host Profile 最小类型（只取 sf_safe_bash 需要的字段） */`

#### pattern: `write guard`
- `packages/daemon-core/src/tools/lib/bash-guard.ts:110:        // the write guard itself when the actual write occurs)`
- `packages/daemon-core/src/tools/lib/sf_safe_bash_core.ts:35: * happens at the write guard level (write-guard-v11) when a WI context`
- `packages/daemon-core/src/tools/lib/tool-permissions.ts:13: * - 不重写 handler 内部逻辑（状态机、write guard、bash guard 各自负责）`
- `packages/daemon-core/src/tools/lib/write-guard-log.ts:4: * Provides a persistent, append-only log of all write guard decisions.`
- `packages/daemon-core/src/tools/lib/write-guard-log.ts:50: * Append a write guard decision to the log.`
- `packages/daemon-core/src/tools/lib/write-guard-v11.ts:35: * Context for the canonical write guard check.`
- `packages/workflow-runtime/src/v11/runtime/Runtime.ts:149:   * Get the write guard.`

#### pattern: `WriteGuard`
- `packages/daemon-core/src/http/HTTPServer.ts:31:import { checkWrite, performChangedFilesAudit, type WriteGuardContext } from '../tools/lib/write-guard-v11';`
- `packages/daemon-core/src/http/HTTPServer.ts:32:import { appendWriteGuardLog } from '../tools/lib/write-guard-log';`
- `packages/daemon-core/src/http/HTTPServer.ts:313:    this.addExactRoute('POST', '/api/v1/v11/write-guard/check', this.handleV11WriteGuardCheck.bind(this));`
- `packages/daemon-core/src/http/HTTPServer.ts:314:    this.addExactRoute('POST', '/api/v1/v11/write-guard/bash', this.handleV11WriteGuardBash.bind(this));`
- `packages/daemon-core/src/http/HTTPServer.ts:315:    this.addExactRoute('POST', '/api/v1/v11/write-guard/changed-files-audit', this.handleV11WriteGuardAudit.bind(this));`
- `packages/daemon-core/src/http/HTTPServer.ts:316:    this.addExactRoute('POST', '/api/v1/v11/write-guard/escaped-write', this.handleV11WriteGuardEscapedWrite.bind(this));`
- `packages/daemon-core/src/http/HTTPServer.ts:1817:  private async handleV11WriteGuardCheck(_req: http.IncomingMessage, res: http.ServerResponse, body: string): Promise<void> {`
- `packages/daemon-core/src/http/HTTPServer.ts:1839:    const wiCtx = this.loadWriteGuardContext(resolvedProjectPath, callerRole ?? 'agent');`
- `packages/daemon-core/src/http/HTTPServer.ts:1857:      appendWriteGuardLog(wiDir, {`
- `packages/daemon-core/src/http/HTTPServer.ts:1870:  private async handleV11WriteGuardBash(_req: http.IncomingMessage, res: http.ServerResponse, body: string): Promise<void> {`
- `packages/daemon-core/src/http/HTTPServer.ts:1888:    const wiCtx = this.loadWriteGuardContext(resolvedProjectPath, 'agent');`
- `packages/daemon-core/src/http/HTTPServer.ts:1922:          appendWriteGuardLog(wiDir, {`


### 4.x candidate_manifest_merge

#### pattern: `candidate_manifest`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:7: * - candidate_manifest.json: auto-add entries[] and merge_applicable=false for code_only_fast_path.`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:33:  'candidate_manifest.json',`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:47:  'candidate_manifest.json': 'candidate_manifest',`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:80:    // candidate_manifest. Controlled sf_artifact_write is the only allowed`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:115:  if (probe.includes('candidate-manifest') || probe.includes('candidate-manifest-json')) return 'candidate_manifest'`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:157:    readJsonIfExists(path.join(wiDir, 'candidate_manifest.json')),`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:222:  if (filename === 'candidate_manifest.json') {`
- `packages/daemon-core/src/tools/handlers/sf-state-transition.ts:61:    join(wiDir, "candidate_manifest.json"),`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:563:      "candidate_manifest.json",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:576:          error: `candidate_manifest.json schema validation failed: ${cmValidation.errors.join("; ")}`,`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:583:        error: "candidate_manifest.json not found — required for close_gate",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:594:          error: "code_only_fast_path requires candidate_manifest.entries = []",`

#### pattern: `candidate_path`
- `packages/daemon-core/src/tools/handlers/sf-v11-extension.ts:77:      return { success: true, action: 'generate_candidate', candidate_path: result.candidatePath };`
- `packages/daemon-core/src/tools/handlers/sf-v11-extension.ts:81:      const candidatePath = args['candidate_path'] as string;`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:229:      // candidate_path 必须在当前 WI 的 candidates/ 下`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:230:      const candidateInWi = entry.candidate_path?.includes('candidates/');`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:232:        check_id: `entry_${i}_candidate_path`,`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:233:        description: `Entry ${i}: candidate_path in candidates/`,`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:268:      if (entry.candidate_path?.includes('..')) {`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:269:        checks.push({ check_id: `path_candidate_traversal`, description: `candidate_path has ..: ${entry.candidate_path}`, passed: false, severity: 'error' });`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:275:      if (entry.candidate_path?.includes('\\')) {`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:276:        checks.push({ check_id: `path_candidate_backslash`, description: `candidate_path has backslash`, passed: false, severity: 'error' });`
- `packages/daemon-core/src/tools/lib/governance-invariants-v11.ts:19:  candidate_path: string;`
- `packages/daemon-core/src/tools/lib/governance-invariants-v11.ts:113:    const candidatePath = entry.candidate_path ?? entry.path;`

#### pattern: `target_path`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:238:      // target_path 必须指向 .specforge/project/`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:239:      const targetValid = entry.target_path?.includes('.specforge/project/') || entry.target_path?.startsWith('project/');`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:241:        check_id: `entry_${i}_target_path`,`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:242:        description: `Entry ${i}: target_path in .specforge/project/`,`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:271:      if (entry.target_path?.includes('..')) {`
- `packages/daemon-core/src/tools/lib/gate-runner-v11.ts:272:        checks.push({ check_id: `path_target_traversal`, description: `target_path has ..: ${entry.target_path}`, passed: false, severity: 'error' });`
- `packages/daemon-core/src/tools/lib/governance-invariants-v11.ts:20:  target_path: string;`
- `packages/daemon-core/src/tools/lib/governance-invariants-v11.ts:114:    const targetPath = entry.target_path;`
- `packages/daemon-core/src/tools/lib/governance-invariants-v11.ts:118:      target_path: normalizeSlash(targetPath),`
- `packages/daemon-core/src/tools/lib/governance-invariants-v11.ts:135:        target_path: targetPath,`
- `packages/daemon-core/src/tools/lib/governance-invariants-v11.ts:151:  const alreadyHasTrace = normalized.some((entry) => normalizeSlash(entry.target_path).endsWith("trace_matrix.md"));`
- `packages/daemon-core/src/tools/lib/governance-invariants-v11.ts:155:      target_path: ".specforge/project/trace_matrix.md",`

#### pattern: `normalized`
- `packages/daemon-core/src/observability/observability-config.ts:69:  const normalized = value.trim().toLowerCase();`
- `packages/daemon-core/src/observability/observability-config.ts:70:  if (["off", "error", "summary", "full", "replay"].includes(normalized)) return normalized as SfObservabilityLevel;`
- `packages/daemon-core/src/project/ProjectManager.test.ts:52:  const normalizedAllowed = projectPaths.map(normalizePath);`
- `packages/daemon-core/src/project/ProjectManager.test.ts:58:      for (const ap of normalizedAllowed) {`
- `packages/daemon-core/src/project/ProjectManager.ts:287:      const normalized = path.resolve(runtimeDir);`
- `packages/daemon-core/src/project/ProjectManager.ts:289:      return normalized.startsWith(projectAbs + path.sep);`
- `packages/daemon-core/src/session/SessionRegistry.js:379:        const normalizedPath = projectPath.replace(/\\/g, '/');`
- `packages/daemon-core/src/session/SessionRegistry.js:380:        const segments = normalizedPath.split('/');`
- `packages/daemon-core/src/session/SessionRegistry.ts:589:    const normalizedPath = projectPath.replace(/\\/g, '/');`
- `packages/daemon-core/src/session/SessionRegistry.ts:590:    const segments = normalizedPath.split('/');`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:197:    const normalized = {`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:206:    return JSON.stringify(normalized, null, 2)`

#### pattern: `sf_merge_run`
- `packages/daemon-core/src/tools/index.ts:47:  'sf_merge_run': 'sf_v11_merge',`
- `packages/daemon-core/src/tools/lib/hard-stop-latch.ts:83:  'sf_merge_run',`
- `packages/daemon-core/src/tools/lib/tool-aliases-v11.ts:19:  sf_merge_run: 'sf_v11_merge',`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:168:Candidate 审批通过后，统一通过 `sf_merge_run`（work_item_id）合并为正式 Spec，生成 merge_report.md。`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:242:- Orchestrator 通过 `sf_merge_run` 将 extension_candidate 合并到正式 registry`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:248:  → sf_gate_run 验证 → sf_merge_run 合并到正式 registry`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:265:| 不得写 `merge_report.md` | 由 sf_merge_run 生成 |`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:296:**普通 Agent 不得直接推进 WI 状态**。所有状态变更由 daemon 内部的 WorkflowEngine 管理，sf-orchestrator 通过 sf_gate_run / sf_close_gate / sf_merge_run 间接触发。`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:344:  → sf_merge_run（合并 Candidate 到正式 Spec）`
- `setup/userlevel-opencode/skills/sf-workflow-bugfix-spec/SKILL.md:147:   - **approve** → 调用 `sf_merge_run`（work_item_id=<id>）合并 Candidate 为正式 Spec → 继续 development`
- `setup/userlevel-opencode/skills/sf-workflow-bugfix-spec/SKILL.md:151:**工具：** `sf_user_decision_record`、`sf_merge_run``
- `setup/userlevel-opencode/skills/sf-workflow-change-request/SKILL.md:185:   - **approve** → 调用 `sf_merge_run`（work_item_id=<id>）合并 Candidate → 继续 development`

#### pattern: `merge`
- `packages/daemon-core/src/http/HTTPServer.ts:303:    this.addExactRoute('POST', '/api/v1/v11/merge', this.handleV11Merge.bind(this));`
- `packages/daemon-core/src/http/HTTPServer.ts:1200:   * Returns optional extra data to merge into the HTTP response.`
- `packages/daemon-core/src/http/HTTPServer.ts:1621:   * v1.1 POST /api/v1/v11/merge`
- `packages/daemon-core/src/http/HTTPServer.ts:1634:        tool: 'sf_v11_merge',`
- `packages/daemon-core/src/index.ts:44:} from './tools/lib/merge-runner-v11';`
- `packages/daemon-core/src/index.ts:45:export type { MergeInput, MergeResult, MergeEntryResult } from './tools/lib/merge-runner-v11';`
- `packages/daemon-core/src/observability/observability-config.ts:129:    const merged: SfObservabilityConfig = {`
- `packages/daemon-core/src/observability/observability-config.ts:137:      merged.ignored_events = asStringArray(parsed.event_blocklist, VISIBLE_DEFAULT_OBSERVABILITY_CONFIG.ignored_events);`
- `packages/daemon-core/src/observability/observability-config.ts:140:    merged.enabled = asBool(parsed.enabled, merged.enabled);`
- `packages/daemon-core/src/observability/observability-config.ts:141:    merged.level = normalizeLevel(parsed.level, merged.level);`
- `packages/daemon-core/src/observability/observability-config.ts:142:    merged.capture_payload = asBool(parsed.capture_payload, merged.capture_payload);`
- `packages/daemon-core/src/observability/observability-config.ts:143:    merged.capture_handler_io = asBool(parsed.capture_handler_io, merged.capture_handler_io);`


### 4.x artifact_write

#### pattern: `sf_artifact_write`
- `packages/daemon-core/src/http/HTTPServer.ts:1900:        reason: 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL — cannot write .specforge/work-items/ via bash/shell; use sf_artifact_write or other SpecForge controlled tools',`
- `packages/daemon-core/src/http/HTTPServer.ts:1908:        reason: 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL — expected files include .specforge/work-items/ path; use sf_artifact_write',`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:17:import { writeArtifact } from '../lib/sf_artifact_write_core'`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:80:    // candidate_manifest. Controlled sf_artifact_write is the only allowed`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:263:registerHandler('sf_artifact_write', async (args, context, _deps) => {`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:274:  const guardResult = guardHardStop(baseDir, workItemId, 'sf_artifact_write')`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:368:    setHardStop(baseDir, workItemId, `ARTIFACT_WRITE_FAILED: ${err.message}`, 'sf_artifact_write')`
- `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts:76:      error: 'WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL: Cannot use sf_safe_bash to create/write .specforge/work-items/ paths. Use sf_artifact_write or sf_state_transition instead.',`
- `packages/daemon-core/src/tools/lib/hard-stop-latch.ts:74:  'sf_artifact_write',`
- `packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts:2: * sf_artifact_write 核心逻辑`
- `packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts:185:    //     sf_artifact_write({file_type:"agent_run_result"}) 写 result.json，但实际`
- `packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts:205:        await logErrorToFile(baseDir, "sf_artifact_write_core", "sidecar_result_failed", sidecarErr)`

#### pattern: `file_type`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:106:  const fileType = String(args['file_type'] ?? '')`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:266:  let fileType = args['file_type'] as string`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:289:  if (!targetFilename && String(args['file_type']) === 'work_log') {`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:293:        file_type: 'work_log' as any,`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:307:        file_type: fileType as any,`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:363:      file_type: fileType,`
- `packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts:34:  file_type: ArtifactFileType`
- `packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts:107: * 根据 file_type 解析目标文件路径`
- `packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts:146:    if ((input.file_type === "work_log" || input.file_type === "agent_run_result") && !input.run_id) {`
- `packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts:151:    const relativePath = resolveArtifactPath(input.file_type, input.work_item_id, input.run_id)`
- `packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts:170:    } else if (input.file_type === "work_log" && input.agent_content) {`
- `packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts:185:    //     sf_artifact_write({file_type:"agent_run_result"}) 写 result.json，但实际`

#### pattern: `candidate_requirements`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:128:  if (fileType === 'candidate_requirements') return 'requirements.md'`

#### pattern: `trace_delta`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:32:  'trace_delta.md',`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:46:  'trace_delta.md': 'trace_delta',`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:64:  const mirrorable = new Set(['requirements.md', 'design.md', 'tasks.md', 'trace_delta.md'])`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:77:  if (targetFilename === 'trace_delta.md') {`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:78:    // v1.1.2_real_world_batch1_trace_delta_candidate_mirror:`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:79:    // Spec-changing workflows may include candidates/trace_delta.md in`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:81:    // way to write WI artifacts; mirror trace_delta into candidates/ so`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:116:  if (probe.includes('trace-delta')) return 'trace_delta'`
- `packages/daemon-core/src/tools/handlers/sf-v11-verification.ts:28:    if (action === 'validate_trace_delta') {`
- `packages/daemon-core/src/tools/handlers/sf-v11-verification.ts:32:          const raw = await readFile(path.join(wiDir, 'trace_delta.md'), 'utf-8');`
- `packages/daemon-core/src/tools/handlers/sf-v11-verification.ts:36:          return { success: false, error: 'trace_delta.md not found and no content provided' };`
- `packages/daemon-core/src/tools/handlers/sf-v11-verification.ts:83:    if (action === 'create_trace_delta') {`

#### pattern: `evidence_manifest`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:8: * - evidence/evidence_manifest.json: accept evidence_items/evidence and normalize to entries[].`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:36:  'evidence_manifest.json',`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:50:  'evidence_manifest.json': 'evidence_manifest',`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:121:  if (probe.includes('evidence-manifest')) return 'evidence_manifest'`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:241:  if (filename === 'evidence_manifest.json') {`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:346:  if (targetFilename === 'evidence_manifest.json') {`
- `packages/daemon-core/src/tools/handlers/sf-artifact-write.ts:349:    targetPath = path.join(evidenceDir, 'evidence_manifest.json')`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:85:  // verification_report, evidence_manifest, changed_files_audit, and revoked code permission`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:630:        path.join(workItemDir, "evidence", "evidence_manifest.json"),`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:637:          error: `evidence_manifest.json schema validation failed: ${emValidation.errors.join("; ")}`,`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:643:          "evidence/evidence_manifest.json not found — required for close_gate",`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931:514:        path.join(workItemDir, "evidence", "evidence_manifest.json"),`


### 4.x permission_audit

#### pattern: `sf_code_permission`
- `packages/daemon-core/src/http/HTTPServer.ts:1891:      this.sendJsonResponse(res, 200, this.successBody({ allowed: false, reason: 'no active WI — call sf_code_permission enable first' }));`
- `packages/daemon-core/src/tools/handlers/sf-v11-code-permission.ts:90:        setHardStop(projectRoot, workItemId, 'ALLOWED_WRITE_FILES_REQUIRED', 'sf_code_permission');`
- `packages/daemon-core/src/tools/handlers/sf-v11-code-permission.ts:95:          message: 'sf_code_permission enable requires allowed_write_files[] with at least one file path. The orchestrator must extract target files from tasks.md before calling enable.',`
- `packages/daemon-core/src/tools/index.ts:39:// OpenCode tool files call daemon via public names (sf_gate_run, sf_code_permission, etc.)`
- `packages/daemon-core/src/tools/index.ts:45:  'sf_code_permission': 'sf_v11_code_permission',`
- `packages/daemon-core/src/tools/lib/hard-stop-latch.ts:79:  'sf_code_permission',`
- `packages/daemon-core/src/tools/lib/tool-aliases-v11.ts:18:  sf_code_permission: 'sf_v11_code_permission',`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:172:# 实现前：sf_code_permission`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:174:在进入 implementation 阶段前，**必须**调用 `sf_code_permission`：`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:178:  → 调用 sf_code_permission（work_item_id=<id>, action="enable", allowed_write_files=[<从 tasks.md 提取的文件列表>]）`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:345:  → sf_code_permission（设置 allowed_write_files）`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:357:- 仍需 sf_code_permission + sf_changed_files_audit + sf_close_gate`

#### pattern: `sf_changed_files_audit`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:2: * sf_changed_files_audit — v1.1 Changed Files Audit Tool Handler.`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:41:registerHandler('sf_changed_files_audit', async (args, context, _deps) => {`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:54:  const hardStopGuard = guardHardStop(projectRoot, workItemId, 'sf_changed_files_audit');`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:68:    setHardStop(projectRoot, workItemId, 'WORK_ITEM_JSON_NOT_FOUND', 'sf_changed_files_audit');`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:86:    setHardStop(projectRoot, workItemId, 'CODE_PERMISSION_NOT_ENABLED', 'sf_changed_files_audit');`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:102:    setHardStop(projectRoot, workItemId, 'ALLOWED_WRITE_FILES_EMPTY', 'sf_changed_files_audit');`
- `packages/daemon-core/src/tools/lib/hard-stop-latch.ts:76:  'sf_changed_files_audit',`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:193:# 实现后：sf_changed_files_audit`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:195:implementation 阶段完成后，必须调用 `sf_changed_files_audit`：`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:199:  → 调用 sf_changed_files_audit（work_item_id）`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:348:  → sf_changed_files_audit（变更审计）`
- `setup/userlevel-opencode/agents/sf-orchestrator.md:357:- 仍需 sf_code_permission + sf_changed_files_audit + sf_close_gate`

#### pattern: `code_permission`
- `packages/daemon-core/src/http/HTTPServer.ts:1682:        tool: 'sf_v11_code_permission',`
- `packages/daemon-core/src/http/HTTPServer.ts:1891:      this.sendJsonResponse(res, 200, this.successBody({ allowed: false, reason: 'no active WI — call sf_code_permission enable first' }));`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:79:    wiJson.code_permission_released === true ||`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:80:    wiJson.code_permission_revoked === true ||`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:81:    wiJson.code_permission_revoked_at !== undefined ||`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:89:      error: 'CODE_PERMISSION_NOT_ENABLED: code_permission was never enabled for this WI. Cannot audit without prior permission grant.',`
- `packages/daemon-core/src/tools/handlers/sf-state-transition.ts:117:    code_permission_revoked: false,`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:6: * - Synchronizes code_permission facts into work_item.json inside daemon, not by Agent repair.`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:58:  code_permission_revoked: boolean;`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:449:  workItem.code_permission_revoked = true;`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:450:  workItem.code_permission_revoked_at =`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:451:    workItem.code_permission_revoked_at ?? new Date().toISOString();`

#### pattern: `allowed_write_files`
- `packages/daemon-core/src/http/HTTPServer.ts:1959:    const allowedWriteFiles = wiCtx.workItem?.allowed_write_files ?? [];`
- `packages/daemon-core/src/http/HTTPServer.ts:1971:      .filter(e => !e.in_allowed_write_files && !e.is_spec_write)`
- `packages/daemon-core/src/http/HTTPServer.ts:2012:              allowed_write_files: wi.allowed_write_files ?? [],`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:82:    normalizeAllowedFiles(wiJson.allowed_write_files).length > 0 ||`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:83:    normalizeAllowedFiles(wiJson.allowed_write_files_snapshot).length > 0;`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:94:  const allowedWriteFilesCurrent = normalizeAllowedFiles(wiJson.allowed_write_files);`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:95:  const allowedWriteFilesSnapshot = normalizeAllowedFiles(wiJson.allowed_write_files_snapshot);`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:105:      error: 'ALLOWED_WRITE_FILES_EMPTY: allowed_write_files and allowed_write_files_snapshot are empty. Audit cannot proceed.',`
- `packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts:151:      ? ['## Entries', '', ...auditResult.entries.map((e) => `- [${e.operation}] ${e.path} → ${e.in_allowed_write_files ? 'in_scope' : 'OUT_OF_SCOPE'}`), '']`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:346:    Array.isArray(updatedWi.allowed_write_files_snapshot) &&`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:347:    updatedWi.allowed_write_files_snapshot.length > 0`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts:348:      ? (updatedWi.allowed_write_files_snapshot as Array<{`

## 5. 责任归属初判

| 领域 | 设计应有主责 | 当前风险 | 后续处理原则 |
|---|---|---|---|
| 状态读写 | 单一 StateStore / WorkflowStateRepository | sf_state_read、sf_state_transition、sf_gate_run、sf_close_gate 可能读写不同状态源 | 先找出现有 StateManager/StateStore，不新增平行状态层；统一读写入口 |
| Gate 时序 | Gate runner 支持 phase scope | verification_gate 被提前纳入，诱导 placeholder | 改现有 sf_gate_run/gate runner，不让 Agent 补假产物 |
| Candidate manifest | daemon/tool 自动 normalize | Agent 被迫修 candidate_path/target_path/hash/normalized | 改现有 artifact_write/merge/manifest gate，不新增独立 normalizer |
| HardStop | 只处理真实不可恢复越权 | 只读访问/流程顺序错误也可能 hard_stop | 改现有 Write Guard/HardStop 判定，增加 recoverable_error/policy_violation |
| Merge | sf_merge_run 承担合并协议 | manifest 不规范时 Agent 手工补 | 改现有 sf_merge_run，自动规范化或给可恢复错误 |
| 权限与审计 | code_permission + changed_files_audit | 顺序错误可能直接 hard_stop | 改现有 audit handler，区分未授权写入和时序错误 |
| Skill/Agent | 只描述流程与约束，不补 daemon 洞 | Skill 诱导 Agent 手工推进状态/修 manifest | 同步 Skill，但以 daemon 能力为准 |

## 6. 后续必须回答的问题

1. 仓库中现有 StateManager / state storage / workflow runtime 代码分别在哪里？是否重复？
2. runtime/state.json 与 work_item.json 谁是主源，谁是镜像？现有代码是否有明确同步点？
3. sf_gate_run 是否已有 partial/phase 参数或内部能力？如果有，为什么 Skill/Agent 没用？如果没有，应在现有 runner 上扩展。
4. candidate_manifest_gate、sf_artifact_write、sf_merge_run 之间是否已有 manifest 规范化代码？如有应复用；如无，应在主责模块补齐。
5. Write Guard 当前如何判断 read/write？是否只看 shell 命令字符串中的路径？
6. hard_stop 是否已有 severity/可恢复机制？如果没有，应先改现有 hard_stop 记录结构。
7. 哪些旧测试仍按旧状态模型运行？应更新或删除。

## 7. 本轮不做的事

- 不修改生产代码。
- 不删除旧代码。
- 不新增 StateStore 平行实现。
- 不直接修 feature_spec/bugfix_spec 表面现象。

## 8. 下一步建议

下一轮应基于本报告继续做更精确的源码审查：打开并阅读状态、Gate、Manifest、Merge、HardStop、Permission/Audit 的实际实现文件，形成代码级修改方案。只有确认旧代码职责后，才能开始 v1.1.3 修复。
