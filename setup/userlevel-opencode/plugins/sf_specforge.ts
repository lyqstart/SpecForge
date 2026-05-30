import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { createReconnectingDaemonClient } from "../scripts/lib/sf_plugin_client.ts"

// ── Daemon 客户端 ───────────────────────────────────────────────────────────────
// 使用 ReconnectingDaemonClient 实现自动重连、降级模式 warn-once
// reconnect 参数使用内置默认值（无外部配置依赖）

const daemonClient = createReconnectingDaemonClient({
  initialDelayMs: 1000,
  maxCumulativeBackoffMs: 60000,
  backoffFactor: 2.0,
});

/** 包装异步函数，捕获错误并打印 warning（不抛出） */
function wrap<T extends (...a: any[]) => Promise<any>>(fn: T, name: string): T {
  return (async (...a: any[]) => {
    try {
      return await fn(...a)
    } catch (e) {
      console.warn(`[sf:${name}]`, (e as Error).message)
    }
  }) as T
}

/** 通过 daemon client 发送事件（never throws） */
async function postEvent(type: string, data: unknown): Promise<void> {
  await daemonClient.postEvent(type, { data, ts: Date.now() })
}

// ── Plugin 入口 ───────────────────────────────────────────────────────────────

export async function sf_specforge(input: PluginInput): Promise<Hooks> {

  // P0: 启动时立即注册项目，触发 daemon 自动初始化（幂等）
  const projectDir = (input as any).directory ?? process.cwd()
  try {
    await daemonClient.register(projectDir)
    console.log(`[sf:specforge] 项目已注册: ${projectDir}`)
  } catch (e) {
    console.warn(`[sf:specforge] 项目注册/初始化失败（将在 agent 启动时重试）: ${(e as Error).message}`)
  }

  // 注册 hooks
  return {
    "tool.execute.before": wrap(async (i: any, o: any) => {
      await postEvent("tool.invoking", { tool: i.tool, callID: i.callID, args: o.args })
    }, "tool.before"),

    "tool.execute.after": wrap(async (i: any, o: any) => {
      await postEvent("tool.invoked", { tool: i.tool, callID: i.callID, output: o.output })
    }, "tool.after"),

    "event": wrap(async (i: any) => {
      await postEvent("opencode.event", i.event)
    }, "event"),

    "experimental.session.compacting": wrap(async (i: any) => {
      await postEvent("session.compacting", { sessionID: i.sessionID })
    }, "compacting"),

    "experimental.chat.system.transform": wrap(async (i: any, o: any) => {
      await postEvent("llm.context.prepared", { system: o.system, sessionID: i.sessionID })
    }, "sys.transform"),

    "experimental.chat.messages.transform": wrap(async (_i: any, o: any) => {
      await postEvent("llm.messages", { messages: o.messages })
    }, "msg.transform"),

    "chat.params": wrap(async (i: any, o: any) => {
      await postEvent("chat.params", { params: o, sessionID: i.sessionID })
    }, "chat.params"),

    "chat.headers": wrap(async (i: any, o: any) => {
      const safe = { ...o.headers }
      if (safe.Authorization) safe.Authorization = "Bearer ****"
      await postEvent("chat.headers", { headers: safe, sessionID: i.sessionID })
    }, "chat.headers"),
  }
}

export default sf_specforge
