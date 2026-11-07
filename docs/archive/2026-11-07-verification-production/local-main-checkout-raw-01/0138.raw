/**
 * feature_spec 端到端测试
 *
 * 验证 feature_spec workflow 的完整状态机流转：
 *   intake → requirements → design → tasks → verification → done
 *
 * 测试策略：
 * - 使用 WorkflowEngine + in-memory mock（不依赖真实 daemon 进程）
 * - 验证四个 Gate 按顺序执行（Requirements→Design→Tasks→Verification）
 * - 验证每个 Gate 执行后产生对应 workflow 事件
 * - 验证真实Daemon StateManager/WAL的状态委派、重启恢复与项目隔离；有限集成不冒充完整业务验收
 *
 * REQ-W3-1: feature_spec 端到端集成测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { WorkflowEngine, type WorkflowEvent } from "../../packages/workflow-runtime/src/WorkflowEngine.js"
import { existsSync } from "node:fs"
import { StateManager } from "../../packages/daemon-core/src/state/StateManager.js"
import { PersonalPathResolver } from "../../packages/daemon-core/src/daemon/path-resolver.js"
import type {
  WorkflowDefinition,
  WorkflowInstance,
  IEventBus,
  Event,
  Subscription,
} from "../../packages/workflow-runtime/src/types.js"

// ─────────────────────────────────────────────────────────────────────────────
// In-memory IEventBus mock（不依赖真实 daemon）
// ─────────────────────────────────────────────────────────────────────────────

class InMemoryEventBus implements IEventBus {
  private handlers: Map<string, Array<(event: Event) => void>> = new Map()
  private _running = false
  readonly publishedEvents: Event[] = []

  publish(event: Event): void {
    this.publishedEvents.push(event)
    const topicHandlers = this.handlers.get(event.action) ?? []
    const wildcardHandlers = this.handlers.get("*") ?? []
    for (const h of [...topicHandlers, ...wildcardHandlers]) {
      try { h(event) } catch { /* ignore handler errors in tests */ }
    }
  }

  subscribe(topic: string, handler: (event: Event) => void): Subscription {
    const id = `sub-${Date.now()}-${Math.random()}`
    if (!this.handlers.has(topic)) this.handlers.set(topic, [])
    this.handlers.get(topic)!.push(handler)
    return { id, topic, handler }
  }

  unsubscribe(subscription: Subscription): void {
    const list = this.handlers.get(subscription.topic)
    if (!list) return
    const idx = list.indexOf(subscription.handler)
    if (idx !== -1) list.splice(idx, 1)
  }

  isRunning(): boolean { return this._running }
  start(): void { this._running = true }
  stop(): void { this._running = false }

  /** 清空已发布事件（测试辅助） */
  clear(): void { this.publishedEvents.length = 0 }

  /** 按 action 过滤已发布事件 */
  getByAction(action: string): Event[] {
    return this.publishedEvents.filter(e => e.action === action)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// feature_spec workflow 定义
// 状态机：intake → requirements → design → tasks → verification → done
// ─────────────────────────────────────────────────────────────────────────────

function buildFeatureSpecWorkflow(): WorkflowDefinition {
  return {
    schema_version: "1.0",
    id: "feature_spec",
    displayName: "Feature Spec Workflow",
    intent: "Create a complete feature specification through requirements, design, tasks, and verification gates",
    stateMachine: {
      schema_version: "1.0",
      initial: "intake",
      states: {
        intake: {
          schema_version: "1.0",
          agent: "sf-orchestrator",
          gate: {
            schema_version: "1.0",
            type: "simple",
            id: "intake-gate",
            name: "Intake Gate",
            checkFn: async () => ({ schema_version: "1.0" as const, passed: true, reason: "Intake complete" }),
          },
          skills: [],
          next: "requirements",
        },
        requirements: {
          schema_version: "1.0",
          agent: "sf-requirements",
          gate: {
            schema_version: "1.0",
            type: "simple",
            id: "requirements-gate",
            name: "Requirements Gate",
            checkFn: async () => ({ schema_version: "1.0" as const, passed: true, reason: "Requirements gate passed" }),
          },
          skills: ["sf-workflow-feature-spec"],
          next: "design",
        },
        design: {
          schema_version: "1.0",
          agent: "sf-design",
          gate: {
            schema_version: "1.0",
            type: "simple",
            id: "design-gate",
            name: "Design Gate",
            checkFn: async () => ({ schema_version: "1.0" as const, passed: true, reason: "Design gate passed" }),
          },
          skills: ["sf-workflow-feature-spec"],
          next: "tasks",
        },
        tasks: {
          schema_version: "1.0",
          agent: "sf-task-planner",
          gate: {
            schema_version: "1.0",
            type: "simple",
            id: "tasks-gate",
            name: "Tasks Gate",
            checkFn: async () => ({ schema_version: "1.0" as const, passed: true, reason: "Tasks gate passed" }),
          },
          skills: ["sf-workflow-feature-spec"],
          next: "verification",
        },
        verification: {
          schema_version: "1.0",
          agent: "sf-verifier",
          gate: {
            schema_version: "1.0",
            type: "simple",
            id: "verification-gate",
            name: "Verification Gate",
            checkFn: async () => ({ schema_version: "1.0" as const, passed: true, reason: "Verification gate passed" }),
          },
          skills: ["sf-workflow-feature-spec"],
          // no next → terminal state (done)
        },
      },
    },
    artifacts: [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 测试套件
// ─────────────────────────────────────────────────────────────────────────────

describe("feature_spec 端到端测试", () => {
  let tempDir: string
  let engine: WorkflowEngine
  let eventBus: InMemoryEventBus
  let capturedEvents: WorkflowEvent[]

  beforeEach(async () => {
    // 创建自有项目根用于Daemon持久化owner
    tempDir = await mkdtemp(join(tmpdir(), "feature-spec-e2e-"))

    // 初始化 in-memory event bus
    eventBus = new InMemoryEventBus()
    eventBus.start()

    // 初始化 WorkflowEngine（不带 EventPublisher，用 onEvent 捕获内部事件）
    engine = new WorkflowEngine()

    // 捕获所有 workflow 内部事件
    capturedEvents = []
    engine.onEvent((event) => { capturedEvents.push(event) })
  })

  afterEach(async () => {
    eventBus.stop()
    // 清理临时目录（规则 T1：对称清理）
    await rm(tempDir, { recursive: true, force: true })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-1: WorkflowEngine 能加载 feature_spec workflow 定义
  // ───────────────────────────────────────────────────────────────────────────

  describe("AC-1: WorkflowEngine 加载 feature_spec 定义", () => {
    it("应能成功加载 feature_spec workflow 定义", () => {
      const definition = buildFeatureSpecWorkflow()
      const workflowId = engine.loadWorkflow(definition)

      expect(workflowId).toBe("feature_spec")
      expect(engine.getWorkflow("feature_spec")).toBeDefined()
      expect(engine.getWorkflow("feature_spec")!.displayName).toBe("Feature Spec Workflow")
    })

    it("加载后应能创建 workflow 实例", () => {
      engine.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engine.createInstance("feature_spec")

      expect(instance).toBeDefined()
      expect(instance.id).toBeTruthy()
      expect(instance.workflowId).toBe("feature_spec")
      expect(instance.currentState).toBe("intake")
      expect(instance.status).toBe("pending")
    })

    it("创建实例后应发出 workflow.created 事件", () => {
      engine.loadWorkflow(buildFeatureSpecWorkflow())
      engine.createInstance("feature_spec")

      const createdEvents = capturedEvents.filter(e => e.type === "workflow.created")
      expect(createdEvents).toHaveLength(1)
      expect(createdEvents[0].data?.workflowId).toBe("feature_spec")
      expect(createdEvents[0].data?.initialState).toBe("intake")
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-2: 四个 Gate 按顺序执行
  // ───────────────────────────────────────────────────────────────────────────

  describe("AC-2: 四个 Gate 顺序执行", () => {
    it("应按 intake→requirements→design→tasks→verification 顺序执行", async () => {
      engine.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engine.createInstance("feature_spec")

      const stateChanges: string[] = []
      engine.onEvent((event) => {
        if (event.type === "workflow.state_changed") {
          stateChanges.push(`${event.data?.from}→${event.data?.to}`)
        }
      })

      const finalInstance = await engine.execute(instance.id)

      // 验证最终状态
      expect(finalInstance.status).toBe("completed")
      expect(finalInstance.currentState).toBe("verification")

      // 验证状态转换顺序
      expect(stateChanges).toEqual([
        "intake→requirements",
        "requirements→design",
        "design→tasks",
        "tasks→verification",
      ])
    })

    it("执行完成后 workflow 状态应为 completed", async () => {
      engine.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engine.createInstance("feature_spec")

      const finalInstance = await engine.execute(instance.id)

      expect(finalInstance.status).toBe("completed")
    })

    it("应执行全部 5 个 Gate（intake + 4 个核心 Gate）", async () => {
      engine.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engine.createInstance("feature_spec")

      await engine.execute(instance.id)

      const gateEvents = capturedEvents.filter(e => e.type === "workflow.gate_executed")
      expect(gateEvents).toHaveLength(5) // intake, requirements, design, tasks, verification
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AC-3: 每个 Gate 执行产生对应 workflow 事件
  // ───────────────────────────────────────────────────────────────────────────

  describe("AC-3: 每个 Gate 产生对应 workflow 事件", () => {
    it("每个 Gate 执行后应产生 workflow.gate_executed 事件", async () => {
      engine.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engine.createInstance("feature_spec")

      await engine.execute(instance.id)

      const gateEvents = capturedEvents.filter(e => e.type === "workflow.gate_executed")
      const executedStates = gateEvents.map(e => e.data?.state as string)

      expect(executedStates).toContain("intake")
      expect(executedStates).toContain("requirements")
      expect(executedStates).toContain("design")
      expect(executedStates).toContain("tasks")
      expect(executedStates).toContain("verification")
    })

    it("所有 Gate 执行结果应为 passed=true", async () => {
      engine.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engine.createInstance("feature_spec")

      await engine.execute(instance.id)

      const gateEvents = capturedEvents.filter(e => e.type === "workflow.gate_executed")
      for (const event of gateEvents) {
        const result = event.data?.gateResult as { passed: boolean }
        expect(result.passed).toBe(true)
      }
    })

    it("应产生 workflow.started 和 workflow.completed 事件", async () => {
      engine.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engine.createInstance("feature_spec")

      await engine.execute(instance.id)

      const startedEvents = capturedEvents.filter(e => e.type === "workflow.started")
      const completedEvents = capturedEvents.filter(e => e.type === "workflow.completed")

      expect(startedEvents).toHaveLength(1)
      expect(completedEvents).toHaveLength(1)
      expect(completedEvents[0].data?.finalState).toBe("verification")
    })

    it("应产生 4 次 workflow.state_changed 事件", async () => {
      engine.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engine.createInstance("feature_spec")

      await engine.execute(instance.id)

      const stateChangedEvents = capturedEvents.filter(e => e.type === "workflow.state_changed")
      expect(stateChangedEvents).toHaveLength(4)
    })

    it("EventPublisher 集成：通过 EventBus 发布 workflow 事件", async () => {
      const { EventPublisher } = await import("../../packages/workflow-runtime/src/events/EventPublisher.js")

      const publisher = new EventPublisher({
        projectId: "test-project",
        eventBus,
        source: "daemon",
      })

      const engineWithPublisher = new WorkflowEngine({ eventPublisher: publisher })
      engineWithPublisher.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engineWithPublisher.createInstance("feature_spec")

      await engineWithPublisher.execute(instance.id)

      // 验证 EventBus 收到了 workflow 事件
      const workflowStarted = eventBus.getByAction("workflow.started")
      const workflowCompleted = eventBus.getByAction("workflow.completed")
      const gateCompleted = eventBus.getByAction("workflow.gate.completed")
      const stateChanged = eventBus.getByAction("workflow.state_changed")

      expect(workflowStarted.length).toBeGreaterThanOrEqual(1)
      expect(workflowCompleted).toHaveLength(1)
      expect(gateCompleted).toHaveLength(5) // 5 gates
      expect(stateChanged).toHaveLength(4)  // 4 transitions

      // 验证事件 payload 包含正确的 instanceId
      for (const event of [...gateCompleted, ...stateChanged]) {
        expect(event.payload.instanceId).toBe(instance.id)
        expect(event.payload.workflowId).toBe("feature_spec")
      }
    })
  })

  // SPS §8: finite orchestration/Daemon-owner integration, not full WI/Gate acceptance.
  describe("AC-4: Daemon StateManager owns persisted state", () => {
    const resolver = new PersonalPathResolver()
    async function owned(project = tempDir) {
      const state = new StateManager(resolver, project)
      await state.initialize()
      return state
    }
    function orchestration(state?: StateManager) {
      const workflow = new WorkflowEngine(state ? {
        onTransition: p => state.transition(p.workItemId, p.fromState, p.toState, "system", p.workflowType),
      } : undefined)
      const definition = buildFeatureSpecWorkflow()
      definition.stateMachine.initial = "created"
      definition.stateMachine.states.created = { agent: "none", skills: [], next: "intake_ready" }
      definition.stateMachine.states.intake_ready = { agent: "none", skills: [], next: "impact_analyzing" }
      definition.stateMachine.states.impact_analyzing = { agent: "none", skills: [] }
      workflow.loadWorkflow(definition)
      return workflow
    }
    const advance = (workflow: WorkflowEngine, id: string, fromState: string, toState: string) =>
      workflow.transitionFull({ workItemId: id, fromState, toState, actor: "system", workflowType: "feature_spec" })

    it("orchestration without a state capability does not create physical persistence", async () => {
      await advance(orchestration(), "WI-OWNER-1", "", "created")
      expect(existsSync(resolver.resolveEventsPath(tempDir))).toBe(false)
      expect(existsSync(resolver.resolveStatePath(tempDir))).toBe(false)
    })

    it("delegates creation to the real Daemon owner and reloads its WAL", async () => {
      const state = await owned()
      await advance(orchestration(state), "WI-OWNER-2", "", "created")
      const restarted = await owned()
      expect(restarted.getState("WI-OWNER-2")?.current_state).toBe("created")
      const events = (await readFile(resolver.resolveEventsPath(tempDir), "utf8")).trim().split("\n").map(line => JSON.parse(line))
      expect(events).toHaveLength(1)
      expect(events[0].action).toBe("state.transition")
      expect(events[0].payload.to_state).toBe("created")
    })

    it("preserves ordered orchestration transitions through a new StateManager", async () => {
      const state = await owned(), workflow = orchestration(state)
      await advance(workflow, "WI-OWNER-3", "", "created")
      await advance(workflow, "WI-OWNER-3", "created", "intake_ready")
      await advance(workflow, "WI-OWNER-3", "intake_ready", "impact_analyzing")
      expect((await owned()).getState("WI-OWNER-3")?.current_state).toBe("impact_analyzing")
      const events = (await readFile(resolver.resolveEventsPath(tempDir), "utf8")).trim().split("\n").map(line => JSON.parse(line))
      expect(events.map(event => event.payload.to_state)).toEqual(["created", "intake_ready", "impact_analyzing"])
    })

    it("rebuilds a missing checkpoint from the Daemon WAL", async () => {
      const state = await owned(), workflow = orchestration(state)
      await advance(workflow, "WI-OWNER-4", "", "created")
      await advance(workflow, "WI-OWNER-4", "created", "intake_ready")
      const before = await readFile(resolver.resolveEventsPath(tempDir))
      await unlink(resolver.resolveStatePath(tempDir))
      const restarted = await owned()
      expect(restarted.getState("WI-OWNER-4")?.current_state).toBe("intake_ready")
      expect(await readFile(resolver.resolveEventsPath(tempDir))).toEqual(before)
      expect(existsSync(resolver.resolveStatePath(tempDir))).toBe(true)
    })

    it("retains the owner's optimistic state guard without appending rejected transitions", async () => {
      const state = await owned()
      await advance(orchestration(state), "WI-OWNER-5", "", "created")
      const before = await readFile(resolver.resolveEventsPath(tempDir))
      await expect(state.transition("WI-OWNER-5", "intake_ready", "impact_analyzing", "system")).rejects.toThrow("Optimistic lock")
      expect(await readFile(resolver.resolveEventsPath(tempDir))).toEqual(before)
      expect((await owned()).getState("WI-OWNER-5")?.current_state).toBe("created")
    })

    it("keeps the same WI identity isolated across two owned project roots", async () => {
      const a = await owned(join(tempDir, "a")), b = await owned(join(tempDir, "b"))
      const workflow = orchestration(a)
      await advance(workflow, "WI-OWNER-6", "", "created")
      await advance(workflow, "WI-OWNER-6", "created", "intake_ready")
      await advance(orchestration(b), "WI-OWNER-6", "", "created")
      expect((await owned(join(tempDir, "a"))).getState("WI-OWNER-6")?.current_state).toBe("intake_ready")
      expect((await owned(join(tempDir, "b"))).getState("WI-OWNER-6")?.current_state).toBe("created")
    })
  })
})
