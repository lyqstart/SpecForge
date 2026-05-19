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
 * - 验证 WorkflowPersistence 能保存和恢复 workflow 实例状态
 *
 * REQ-W3-1: feature_spec 端到端集成测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { WorkflowEngine, type WorkflowEvent } from "../../packages/workflow-runtime/src/WorkflowEngine.js"
import { WorkflowPersistence } from "../../packages/workflow-runtime/src/WorkflowPersistence.js"
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
    // 创建临时目录用于 WorkflowPersistence
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

  // ───────────────────────────────────────────────────────────────────────────
  // AC-4: workflow 实例状态持久化（WorkflowPersistence）
  // ───────────────────────────────────────────────────────────────────────────

  describe("AC-4: workflow 实例状态持久化", () => {
    it("应能将 workflow 实例保存到持久化存储", async () => {
      const persistence = new WorkflowPersistence({
        storageDir: tempDir,
        enableEventReplay: false,
      })
      await persistence.initialize()

      engine.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engine.createInstance("feature_spec")

      // 保存实例
      await persistence.saveInstance(instance)

      // 验证能从存储中加载
      const loaded = await persistence.loadInstance(instance.id)
      expect(loaded).not.toBeNull()
      expect(loaded!.id).toBe(instance.id)
      expect(loaded!.workflowId).toBe("feature_spec")
      expect(loaded!.currentState).toBe("intake")
      expect(loaded!.status).toBe("pending")
    })

    it("执行完成后应能持久化最终状态", async () => {
      const persistence = new WorkflowPersistence({
        storageDir: tempDir,
        enableEventReplay: false,
      })
      await persistence.initialize()

      engine.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engine.createInstance("feature_spec")

      // 执行 workflow
      const finalInstance = await engine.execute(instance.id)

      // 保存最终状态
      await persistence.saveInstance(finalInstance)

      // 从存储恢复
      const recovered = await persistence.loadInstance(instance.id)
      expect(recovered).not.toBeNull()
      expect(recovered!.status).toBe("completed")
      expect(recovered!.currentState).toBe("verification")
    })

    it("应能通过 recoverState 恢复 workflow 实例", async () => {
      const persistence = new WorkflowPersistence({
        storageDir: tempDir,
        enableEventReplay: false,
      })
      await persistence.initialize()

      engine.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engine.createInstance("feature_spec")
      const finalInstance = await engine.execute(instance.id)
      await persistence.saveInstance(finalInstance)

      // 模拟重启：通过 recoverState 恢复
      const recovered = await persistence.recoverState(instance.id)
      expect(recovered).not.toBeNull()
      expect(recovered!.id).toBe(instance.id)
      expect(recovered!.workflowId).toBe("feature_spec")
      expect(recovered!.status).toBe("completed")
      expect(recovered!.currentState).toBe("verification")
    })

    it("持久化的实例应包含正确的时间戳", async () => {
      const persistence = new WorkflowPersistence({
        storageDir: tempDir,
        enableEventReplay: false,
      })
      await persistence.initialize()

      engine.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engine.createInstance("feature_spec")
      await persistence.saveInstance(instance)

      const loaded = await persistence.loadInstance(instance.id)
      expect(loaded!.createdAt).toBeInstanceOf(Date)
      expect(loaded!.updatedAt).toBeInstanceOf(Date)
    })

    it("listInstances 应返回所有已保存的实例", async () => {
      const persistence = new WorkflowPersistence({
        storageDir: tempDir,
        enableEventReplay: false,
      })
      await persistence.initialize()

      engine.loadWorkflow(buildFeatureSpecWorkflow())

      // 创建并保存两个实例
      const instance1 = engine.createInstance("feature_spec")
      const instance2 = engine.createInstance("feature_spec")
      await persistence.saveInstance(instance1)
      await persistence.saveInstance(instance2)

      const allInstances = await persistence.listInstances()
      expect(allInstances).toHaveLength(2)
      const ids = allInstances.map(i => i.id)
      expect(ids).toContain(instance1.id)
      expect(ids).toContain(instance2.id)
    })

    it("删除实例后 loadInstance 应返回 null", async () => {
      const persistence = new WorkflowPersistence({
        storageDir: tempDir,
        enableEventReplay: false,
      })
      await persistence.initialize()

      engine.loadWorkflow(buildFeatureSpecWorkflow())
      const instance = engine.createInstance("feature_spec")
      await persistence.saveInstance(instance)

      const deleted = await persistence.deleteInstance(instance.id)
      expect(deleted).toBe(true)

      const loaded = await persistence.loadInstance(instance.id)
      expect(loaded).toBeNull()
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 完整端到端流程：加载 → 创建 → 执行 → 持久化 → 恢复
  // ───────────────────────────────────────────────────────────────────────────

  describe("完整端到端流程", () => {
    it("应完成 feature_spec workflow 的完整生命周期", async () => {
      const persistence = new WorkflowPersistence({
        storageDir: tempDir,
        enableEventReplay: false,
      })
      await persistence.initialize()

      // Step 1: 加载 workflow 定义
      const definition = buildFeatureSpecWorkflow()
      engine.loadWorkflow(definition)
      expect(engine.getWorkflow("feature_spec")).toBeDefined()

      // Step 2: 创建实例
      const instance = engine.createInstance("feature_spec")
      expect(instance.currentState).toBe("intake")
      expect(instance.status).toBe("pending")

      // Step 3: 执行 workflow（四个 Gate 顺序执行）
      const finalInstance = await engine.execute(instance.id)
      expect(finalInstance.status).toBe("completed")
      expect(finalInstance.currentState).toBe("verification")

      // Step 4: 持久化最终状态
      await persistence.saveInstance(finalInstance)

      // Step 5: 验证事件序列完整
      const gateEvents = capturedEvents.filter(e => e.type === "workflow.gate_executed")
      const stateChanges = capturedEvents.filter(e => e.type === "workflow.state_changed")
      expect(gateEvents).toHaveLength(5)
      expect(stateChanges).toHaveLength(4)

      // Step 6: 模拟重启，从持久化存储恢复
      const recovered = await persistence.recoverState(instance.id)
      expect(recovered).not.toBeNull()
      expect(recovered!.status).toBe("completed")
      expect(recovered!.currentState).toBe("verification")

      console.log(`\n✅ feature_spec E2E 完整流程通过：`)
      console.log(`   实例 ID: ${instance.id}`)
      console.log(`   最终状态: ${finalInstance.currentState} (${finalInstance.status})`)
      console.log(`   Gate 执行次数: ${gateEvents.length}`)
      console.log(`   状态转换次数: ${stateChanges.length}`)
    })
  })
})
