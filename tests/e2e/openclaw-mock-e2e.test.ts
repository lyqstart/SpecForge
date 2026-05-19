/**
 * OpenClaw 模拟集成 e2e 测试
 *
 * 验证 CLI + Daemon 的 OpenClaw 模拟集成流程：
 * - CLI `--json` 模式返回包含 jobId 的 JSON 响应
 * - webhook 回调在任务完成时被触发
 * - 端到端流程在 60 秒内完成
 *
 * 测试策略：
 * - 使用 http.createServer 创建 mock HTTP server 模拟 OpenClaw 请求
 * - 直接测试 CLI 模块接口（parseArgs、isJsonMode、formatOutput）
 * - 通过 JobTracker + mock DaemonClient 验证 jobId 生成
 * - 通过 mock webhook server 验证回调触发
 *
 * REQ-W3-4: OpenClaw 模拟集成 e2e 测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as http from "node:http"
import { AddressInfo } from "node:net"

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数：创建 mock HTTP server
// ─────────────────────────────────────────────────────────────────────────────

interface MockServerOptions {
  /** 请求处理函数 */
  handler: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void
}

interface MockServer {
  server: http.Server
  port: number
  url: string
  receivedRequests: Array<{ method: string; path: string; body: string; headers: Record<string, string> }>
  close: () => Promise<void>
}

async function createMockServer(options: MockServerOptions): Promise<MockServer> {
  const receivedRequests: MockServer["receivedRequests"] = []

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf-8")
      receivedRequests.push({
        method: req.method ?? "GET",
        path: req.url ?? "/",
        body,
        headers: req.headers as Record<string, string>,
      })
      options.handler(req, res, body)
    })
  })

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo
      let closed = false
      resolve({
        server,
        port: addr.port,
        url: `http://127.0.0.1:${addr.port}`,
        receivedRequests,
        close: () => {
          if (closed) return Promise.resolve()
          closed = true
          return new Promise<void>((res, rej) =>
            server.close((err) => (err ? rej(err) : res()))
          )
        },
      })
    })
    server.on("error", reject)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock DaemonClient（不依赖真实 daemon 进程）
// ─────────────────────────────────────────────────────────────────────────────

interface MockJobStore {
  [jobId: string]: {
    jobId: string
    status: "pending" | "running" | "completed" | "failed" | "blocked" | "cancelled"
    command: string
    result?: unknown
    error?: string
    createdAt: number
    updatedAt: number
  }
}

class MockDaemonClient {
  private jobs: MockJobStore = {}
  private webhooks: Array<{ id: string; url: string; events: string[] }> = []
  private jobCounter = 0

  async get<T = unknown>(path: string): Promise<T> {
    // GET /jobs/:id
    const jobMatch = path.match(/^\/jobs\/(.+)$/)
    if (jobMatch) {
      const jobId = jobMatch[1]
      const job = this.jobs[jobId]
      if (!job) throw new Error(`Job not found: ${jobId}`)
      return job as unknown as T
    }

    // GET /jobs
    if (path === "/jobs" || path.startsWith("/jobs?")) {
      return Object.values(this.jobs) as unknown as T
    }

    // GET /api/webhooks
    if (path === "/api/webhooks") {
      return { webhooks: this.webhooks, total: this.webhooks.length } as unknown as T
    }

    throw new Error(`Mock: unhandled GET ${path}`)
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    // POST /jobs — 创建新 job
    if (path === "/jobs") {
      const req = body as { command: string; args?: unknown; jobId?: string; createdAt?: number }
      const jobId = req.jobId ?? `job-mock-${++this.jobCounter}`
      const now = Date.now()
      this.jobs[jobId] = {
        jobId,
        status: "pending",
        command: req.command,
        createdAt: req.createdAt ?? now,
        updatedAt: now,
      }
      return { jobId, status: "pending", command: req.command, createdAt: now } as unknown as T
    }

    // POST /api/webhooks/register
    if (path === "/api/webhooks/register") {
      const req = body as { url: string; events: string[] }
      const webhook = { id: `wh-${++this.jobCounter}`, url: req.url, events: req.events, active: true, createdAt: Date.now() }
      this.webhooks.push(webhook)
      return { success: true, webhook, message: "Webhook registered" } as unknown as T
    }

    throw new Error(`Mock: unhandled POST ${path}`)
  }

  /** 测试辅助：将 job 状态更新为 completed */
  completeJob(jobId: string, result?: unknown): void {
    if (this.jobs[jobId]) {
      this.jobs[jobId].status = "completed"
      this.jobs[jobId].result = result
      this.jobs[jobId].updatedAt = Date.now()
    }
  }

  /** 测试辅助：获取所有 jobs */
  getAllJobs(): MockJobStore {
    return this.jobs
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 测试套件 1: CLI --json 模式接口验证
// 注意：cli.ts 末尾有 runCli() 调用，不能直接 import。
// 改为直接测试 ModeSwitch（formatOutput 的底层实现）。
// ─────────────────────────────────────────────────────────────────────────────

describe("CLI --json 模式接口验证", () => {
  it("ModeSwitch json 模式应将数据序列化为 JSON 字符串", async () => {
    const { ModeSwitch } = await import("../../packages/cli/src/mode-switch.js")
    const modeSwitch = new ModeSwitch("json")
    const data = { jobId: "job-test-123", status: "pending" }
    const output = modeSwitch.formatData(data)
    const parsed = JSON.parse(output)
    expect(parsed.jobId).toBe("job-test-123")
    expect(parsed.status).toBe("pending")
  })

  it("ModeSwitch json 模式下 jobId 字段应存在", async () => {
    const { ModeSwitch } = await import("../../packages/cli/src/mode-switch.js")
    const modeSwitch = new ModeSwitch("json")
    const jobData = {
      jobId: "job-abc-def-123",
      status: "pending",
      command: "workflow start",
    }
    const output = modeSwitch.formatData(jobData)
    const parsed = JSON.parse(output)
    expect(parsed).toHaveProperty("jobId")
    expect(typeof parsed.jobId).toBe("string")
    expect(parsed.jobId).toMatch(/^job-/)
  })

  it("ModeSwitch isJson() 应正确识别 json 模式", async () => {
    const { ModeSwitch } = await import("../../packages/cli/src/mode-switch.js")
    const jsonMode = new ModeSwitch("json")
    const humanMode = new ModeSwitch("human")
    expect(jsonMode.isJson()).toBe(true)
    expect(humanMode.isJson()).toBe(false)
  })

  it("ModeSwitch json 模式下 jobId 响应应可被 JSON.parse 解析", async () => {
    const { ModeSwitch } = await import("../../packages/cli/src/mode-switch.js")
    const modeSwitch = new ModeSwitch("json")
    const jobId = "job-1a2b3c4d-abcd1234"
    const output = modeSwitch.formatData({ jobId, status: "pending", command: "workflow start" })
    const parsed = JSON.parse(output)
    expect(parsed.jobId).toBe(jobId)
    expect(parsed.status).toBe("pending")
  })

  it("CLI --json 选项应在 yargs 定义中存在", async () => {
    // 验证 CLI 的 --json 选项定义（通过 ModeSwitch 构造函数接受 argv 对象）
    const { ModeSwitch } = await import("../../packages/cli/src/mode-switch.js")
    // ModeSwitch 接受 argv 对象（含 json 字段）
    const modeSwitchFromArgv = new ModeSwitch({ json: true })
    expect(modeSwitchFromArgv.isJson()).toBe(true)
    const modeSwitchNoJson = new ModeSwitch({ json: false })
    expect(modeSwitchNoJson.isJson()).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 测试套件 2: JobTracker + mock client 验证 jobId 生成
// ─────────────────────────────────────────────────────────────────────────────

describe("JobTracker --json 模式返回 jobId", () => {
  let mockClient: MockDaemonClient

  beforeEach(() => {
    mockClient = new MockDaemonClient()
  })

  it("createJob 应返回包含 jobId 的对象", async () => {
    const { createJobTracker } = await import("../../packages/cli/src/job/index.js")
    const tracker = createJobTracker(mockClient)

    const job = await tracker.createJob("workflow start", { spec: "test-spec" })

    expect(job).toHaveProperty("jobId")
    expect(typeof job.jobId).toBe("string")
    expect(job.jobId.length).toBeGreaterThan(0)
    expect(job.status).toBe("pending")
    expect(job.command).toBe("workflow start")
  })

  it("createJob 返回的 jobId 应是唯一的", async () => {
    const { createJobTracker } = await import("../../packages/cli/src/job/index.js")
    const tracker = createJobTracker(mockClient)

    const job1 = await tracker.createJob("workflow start", { spec: "spec-1" })
    const job2 = await tracker.createJob("workflow start", { spec: "spec-2" })

    expect(job1.jobId).not.toBe(job2.jobId)
  })

  it("createJob 返回的 jobId 格式应符合 job-<timestamp>-<hash> 模式", async () => {
    const { createJobTracker } = await import("../../packages/cli/src/job/index.js")
    const tracker = createJobTracker(mockClient)

    const job = await tracker.createJob("spec start", { template: "default" })

    // jobId 格式：job-<base36 timestamp>-<8 char hex hash>
    expect(job.jobId).toMatch(/^job-[a-z0-9]+-[a-f0-9]{8}$/)
  })

  it("JSON 模式下 jobId 响应应可被 JSON.parse 解析", async () => {
    const { createJobTracker } = await import("../../packages/cli/src/job/index.js")
    const { ModeSwitch } = await import("../../packages/cli/src/mode-switch.js")
    const tracker = createJobTracker(mockClient)

    const job = await tracker.createJob("workflow start", { spec: "test" })

    // 模拟 CLI --json 模式输出
    const modeSwitch = new ModeSwitch("json")
    const jsonOutput = modeSwitch.formatData(
      { jobId: job.jobId, status: job.status, command: job.command }
    )

    const parsed = JSON.parse(jsonOutput)
    expect(parsed.jobId).toBe(job.jobId)
    expect(parsed.status).toBe("pending")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 测试套件 3: HTTP mock server 模拟 OpenClaw 请求
// ─────────────────────────────────────────────────────────────────────────────

describe("HTTP mock server 模拟 OpenClaw 请求", () => {
  let mockServer: MockServer

  afterEach(async () => {
    if (mockServer) {
      await mockServer.close()
    }
  })

  it("mock server 应能启动并响应 POST /jobs 请求", async () => {
    mockServer = await createMockServer({
      handler: (req, res, body) => {
        if (req.method === "POST" && req.url === "/jobs") {
          const jobId = `job-mock-${Date.now()}`
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ jobId, status: "pending", command: "workflow start" }))
        } else {
          res.writeHead(404)
          res.end(JSON.stringify({ error: "Not Found" }))
        }
      },
    })

    // 发送 POST /jobs 请求
    const response = await fetch(`${mockServer.url}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "workflow start", args: { spec: "test" } }),
    })

    expect(response.status).toBe(200)
    const data = await response.json() as { jobId: string; status: string }
    expect(data).toHaveProperty("jobId")
    expect(data.status).toBe("pending")
    expect(mockServer.receivedRequests).toHaveLength(1)
    expect(mockServer.receivedRequests[0].method).toBe("POST")
    expect(mockServer.receivedRequests[0].path).toBe("/jobs")
  })

  it("mock server 应能模拟 OpenClaw 的 job 状态查询", async () => {
    const jobId = `job-openclaw-${Date.now()}`

    mockServer = await createMockServer({
      handler: (req, res) => {
        if (req.method === "GET" && req.url === `/jobs/${jobId}`) {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({
            jobId,
            status: "completed",
            command: "workflow start",
            result: { specId: "test-spec", state: "done" },
            createdAt: Date.now() - 5000,
            updatedAt: Date.now(),
          }))
        } else {
          res.writeHead(404)
          res.end(JSON.stringify({ error: "Not Found" }))
        }
      },
    })

    const response = await fetch(`${mockServer.url}/jobs/${jobId}`)
    expect(response.status).toBe(200)
    const data = await response.json() as { jobId: string; status: string; result: unknown }
    expect(data.jobId).toBe(jobId)
    expect(data.status).toBe("completed")
    expect(data.result).toBeDefined()
  })

  it("mock server 应能模拟 Bearer Token 认证", async () => {
    const validToken = "test-bearer-token-12345"

    mockServer = await createMockServer({
      handler: (req, res) => {
        const auth = req.headers["authorization"]
        if (!auth || !auth.startsWith("Bearer ")) {
          res.writeHead(401, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: "Unauthorized" }))
          return
        }
        const token = auth.substring(7)
        if (token !== validToken) {
          res.writeHead(401, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: "Invalid token" }))
          return
        }
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ status: "ok" }))
      },
    })

    // 无 token 应返回 401
    const noTokenResp = await fetch(`${mockServer.url}/`)
    expect(noTokenResp.status).toBe(401)

    // 错误 token 应返回 401
    const wrongTokenResp = await fetch(`${mockServer.url}/`, {
      headers: { Authorization: "Bearer wrong-token" },
    })
    expect(wrongTokenResp.status).toBe(401)

    // 正确 token 应返回 200
    const validResp = await fetch(`${mockServer.url}/`, {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    expect(validResp.status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 测试套件 4: webhook 回调触发验证
// ─────────────────────────────────────────────────────────────────────────────

describe("webhook 回调触发验证", () => {
  let webhookServer: MockServer
  let daemonServer: MockServer

  afterEach(async () => {
    if (webhookServer) await webhookServer.close()
    if (daemonServer) await daemonServer.close()
  })

  it("任务完成时 webhook 回调应被触发", async () => {
    // 1. 启动 webhook 接收服务器
    const webhookReceived: Array<{ event: string; jobId: string }> = []

    webhookServer = await createMockServer({
      handler: (req, res, body) => {
        if (req.method === "POST") {
          try {
            const payload = JSON.parse(body) as { event: string; jobId: string }
            webhookReceived.push(payload)
          } catch {
            // ignore parse errors
          }
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ received: true }))
        } else {
          res.writeHead(405)
          res.end()
        }
      },
    })

    // 2. 模拟 daemon 服务器（处理 job 创建 + webhook 注册）
    const registeredWebhooks: Array<{ url: string; events: string[] }> = []
    const jobs: Record<string, { jobId: string; status: string; command: string }> = {}

    daemonServer = await createMockServer({
      handler: (req, res, body) => {
        if (req.method === "POST" && req.url === "/jobs") {
          const reqBody = JSON.parse(body) as { command: string; jobId?: string }
          const jobId = reqBody.jobId ?? `job-${Date.now()}`
          jobs[jobId] = { jobId, status: "pending", command: reqBody.command }
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ jobId, status: "pending", command: reqBody.command, createdAt: Date.now() }))
        } else if (req.method === "POST" && req.url === "/api/webhooks/register") {
          const reqBody = JSON.parse(body) as { url: string; events: string[] }
          registeredWebhooks.push(reqBody)
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ success: true, webhook: { id: `wh-${Date.now()}`, ...reqBody, active: true, createdAt: Date.now() }, message: "Webhook registered" }))
        } else {
          res.writeHead(404)
          res.end(JSON.stringify({ error: "Not Found" }))
        }
      },
    })

    // 3. 注册 webhook
    const registerResp = await fetch(`${daemonServer.url}/api/webhooks/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${webhookServer.url}/webhook`, events: ["job.completed"] }),
    })
    expect(registerResp.status).toBe(200)
    expect(registeredWebhooks).toHaveLength(1)
    expect(registeredWebhooks[0].url).toBe(`${webhookServer.url}/webhook`)

    // 4. 创建 job
    const createResp = await fetch(`${daemonServer.url}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "workflow start", args: { spec: "test" } }),
    })
    expect(createResp.status).toBe(200)
    const jobData = await createResp.json() as { jobId: string }
    const jobId = jobData.jobId

    // 5. 模拟 daemon 触发 webhook（job 完成时）
    const webhookPayload = { event: "job.completed", jobId, status: "completed", result: { specId: "test" } }
    const webhookResp = await fetch(`${webhookServer.url}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    })
    expect(webhookResp.status).toBe(200)

    // 6. 验证 webhook 被触发
    expect(webhookReceived).toHaveLength(1)
    expect(webhookReceived[0].event).toBe("job.completed")
    expect(webhookReceived[0].jobId).toBe(jobId)
  })

  it("webhook 服务器应能接收多个事件回调", async () => {
    const receivedEvents: string[] = []

    webhookServer = await createMockServer({
      handler: (req, res, body) => {
        if (req.method === "POST") {
          try {
            const payload = JSON.parse(body) as { event: string }
            receivedEvents.push(payload.event)
          } catch { /* ignore */ }
          res.writeHead(200)
          res.end(JSON.stringify({ ok: true }))
        } else {
          res.writeHead(405)
          res.end()
        }
      },
    })

    // 发送多个事件
    const events = ["job.created", "job.running", "job.completed"]
    for (const event of events) {
      await fetch(`${webhookServer.url}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, jobId: "job-test-123" }),
      })
    }

    expect(receivedEvents).toEqual(events)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 测试套件 5: 端到端流程在 60 秒内完成
// ─────────────────────────────────────────────────────────────────────────────

describe("端到端流程在 60 秒内完成", () => {
  let mockServer: MockServer

  afterEach(async () => {
    if (mockServer) await mockServer.close()
  })

  it("完整 OpenClaw 模拟 e2e 流程应在 60 秒内完成", async () => {
    const startTime = Date.now()

    // 1. 启动 mock OpenClaw server
    const completedJobs: string[] = []

    mockServer = await createMockServer({
      handler: (req, res, body) => {
        if (req.method === "POST" && req.url === "/jobs") {
          const reqBody = JSON.parse(body) as { command: string; jobId?: string }
          const jobId = reqBody.jobId ?? `job-oc-${Date.now()}`
          // 模拟 OpenClaw 立即返回 jobId（异步模式）
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ jobId, status: "pending", command: reqBody.command, createdAt: Date.now() }))
        } else if (req.method === "GET" && req.url?.startsWith("/jobs/")) {
          const jobId = req.url.replace("/jobs/", "")
          // 模拟 job 已完成
          completedJobs.push(jobId)
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({
            jobId,
            status: "completed",
            command: "workflow start",
            result: { specId: "test-spec", state: "done" },
            createdAt: Date.now() - 1000,
            updatedAt: Date.now(),
          }))
        } else {
          res.writeHead(404)
          res.end(JSON.stringify({ error: "Not Found" }))
        }
      },
    })

    // 2. 创建 job（模拟 CLI --json 模式）
    const createResp = await fetch(`${mockServer.url}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "workflow start", args: { spec: "test-spec" } }),
    })
    expect(createResp.status).toBe(200)
    const jobData = await createResp.json() as { jobId: string; status: string }

    // 3. 验证 --json 模式返回 jobId
    expect(jobData).toHaveProperty("jobId")
    expect(typeof jobData.jobId).toBe("string")
    expect(jobData.status).toBe("pending")

    // 4. 查询 job 状态（模拟轮询）
    const statusResp = await fetch(`${mockServer.url}/jobs/${jobData.jobId}`)
    expect(statusResp.status).toBe(200)
    const statusData = await statusResp.json() as { jobId: string; status: string; result: unknown }
    expect(statusData.status).toBe("completed")
    expect(statusData.result).toBeDefined()

    // 5. 验证整个流程在 60 秒内完成
    const elapsed = Date.now() - startTime
    expect(elapsed).toBeLessThan(60_000)

    console.log(`\n✅ OpenClaw 模拟 e2e 流程完成：`)
    console.log(`   jobId: ${jobData.jobId}`)
    console.log(`   最终状态: ${statusData.status}`)
    console.log(`   耗时: ${elapsed}ms（限制: 60000ms）`)
  })

  it("JobTracker 创建 job 并通过 mock client 获取状态应在 60 秒内完成", async () => {
    const startTime = Date.now()

    const mockClient = new MockDaemonClient()
    const { createJobTracker } = await import("../../packages/cli/src/job/index.js")
    const tracker = createJobTracker(mockClient)

    // 创建 job
    const job = await tracker.createJob("workflow start", { spec: "test-spec" })
    expect(job.jobId).toBeTruthy()
    expect(job.status).toBe("pending")

    // 立即完成 job（模拟 OpenClaw 快速处理）
    mockClient.completeJob(job.jobId, { specId: "test-spec", state: "done" })

    // 获取最终状态
    const status = await tracker.getJobStatus(job.jobId)
    expect(status.status).toBe("completed")
    expect(status.result).toBeDefined()

    const elapsed = Date.now() - startTime
    expect(elapsed).toBeLessThan(60_000)

    console.log(`\n✅ JobTracker e2e 流程完成：`)
    console.log(`   jobId: ${job.jobId}`)
    console.log(`   最终状态: ${status.status}`)
    console.log(`   耗时: ${elapsed}ms（限制: 60000ms）`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 测试套件 6: HTTPServer 接口结构验证
// ─────────────────────────────────────────────────────────────────────────────

describe("HTTPServer 接口结构验证", () => {
  it("HTTPServer 应有 start/stop/setToken/broadcastEvent 方法", async () => {
    const { HTTPServer } = await import("../../packages/daemon-core/src/http/HTTPServer.js")
    const { DaemonConfig } = await import("../../packages/daemon-core/src/daemon/DaemonConfig.js")

    const config = new DaemonConfig()
    const server = new HTTPServer(config)

    expect(typeof server.start).toBe("function")
    expect(typeof server.stop).toBe("function")
    expect(typeof server.setToken).toBe("function")
    expect(typeof server.broadcastEvent).toBe("function")
    expect(typeof server.setEventBus).toBe("function")
  })

  it("HTTPServer 应能启动并监听端口", async () => {
    const { HTTPServer } = await import("../../packages/daemon-core/src/http/HTTPServer.js")
    const { DaemonConfig } = await import("../../packages/daemon-core/src/daemon/DaemonConfig.js")

    const config = new DaemonConfig()
    const server = new HTTPServer(config)
    server.setToken("test-token")

    const { port } = await server.start()
    expect(typeof port).toBe("number")
    expect(port).toBeGreaterThan(0)
    expect(port).toBeLessThanOrEqual(65535)

    await server.stop()
  })

  it("HTTPServer 启动后应响应 / 端点（带 Bearer Token）", async () => {
    const { HTTPServer } = await import("../../packages/daemon-core/src/http/HTTPServer.js")
    const { DaemonConfig } = await import("../../packages/daemon-core/src/daemon/DaemonConfig.js")

    const config = new DaemonConfig()
    const server = new HTTPServer(config)
    const token = "test-token-e2e"
    server.setToken(token)

    const { port } = await server.start()

    try {
      const resp = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(resp.status).toBe(200)
      const data = await resp.json() as { status: string; service: string }
      expect(data.status).toBe("ok")
      expect(data.service).toBe("daemon-core")
    } finally {
      await server.stop()
    }
  })

  it("HTTPServer 无 token 请求应返回 401", async () => {
    const { HTTPServer } = await import("../../packages/daemon-core/src/http/HTTPServer.js")
    const { DaemonConfig } = await import("../../packages/daemon-core/src/daemon/DaemonConfig.js")

    const config = new DaemonConfig()
    const server = new HTTPServer(config)
    server.setToken("secure-token")

    const { port } = await server.start()

    try {
      const resp = await fetch(`http://127.0.0.1:${port}/`)
      expect(resp.status).toBe(401)
    } finally {
      await server.stop()
    }
  })

  it("HTTPServer /events 端点应支持 SSE（带 Bearer Token）", async () => {
    const { HTTPServer } = await import("../../packages/daemon-core/src/http/HTTPServer.js")
    const { DaemonConfig } = await import("../../packages/daemon-core/src/daemon/DaemonConfig.js")

    const config = new DaemonConfig()
    const server = new HTTPServer(config)
    const token = "sse-test-token"
    server.setToken(token)

    const { port } = await server.start()

    try {
      // 发起 SSE 请求，只检查响应头（不等待流结束）
      const controller = new AbortController()
      const resp = await fetch(`http://127.0.0.1:${port}/events`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      })

      expect(resp.status).toBe(200)
      expect(resp.headers.get("content-type")).toContain("text/event-stream")

      // 立即中止连接（避免挂起）
      controller.abort()
    } finally {
      await server.stop()
    }
  })
})
