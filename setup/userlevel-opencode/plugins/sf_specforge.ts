import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { createReconnectingDaemonClient } from "../../packages/service-management/src/plugin/reconnecting-daemon-client.ts"
import {
  DEFAULT_CONFIG,
  mergeConfigLayers,
  createConfigAccess,
  ConfigAccess,
} from "../../packages/configuration/src/index.ts"

// ── Configuration access ───────────────────────────────────────────────────────────────

/**
 * Cached config access instance
 */
let configAccessInstance: ConfigAccess | null = null;

/**
 * Get configuration access instance
 */
function getConfigAccess(): ConfigAccess {
  if (configAccessInstance) {
    return configAccessInstance;
  }

  const builtinConfig = DEFAULT_CONFIG;
  const layers = [
    {
      type: 'builtin' as const,
      path: undefined,
      timestamp: Date.now(),
      data: builtinConfig,
      schemaVersion: '1.0',
    },
  ];

  const merged = mergeConfigLayers(layers);
  configAccessInstance = createConfigAccess(merged);

  return configAccessInstance;
}

/**
 * Get reconnect parameters from configuration
 */
function getReconnectOptionsFromConfig() {
  const config = getConfigAccess();
  return {
    initialDelayMs: config.getOr<number>('service_management.plugin_reconnect_initial_sec', 1).value * 1000,
    maxCumulativeBackoffMs: config.getOr<number>('service_management.plugin_reconnect_max_sec', 60).value * 1000,
    backoffFactor: config.getOr<number>('service_management.plugin_reconnect_backoff_factor', 2.0).value,
  };
}

// ── Daemon 客户端 ───────────────────────────────────────────────────────────────
// 使用 ReconnectingDaemonClient 实现自动重连、降级模式 warn-once

const reconnectOptions = getReconnectOptionsFromConfig();
const daemonClient = createReconnectingDaemonClient(reconnectOptions);

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

  // 3. 注册 hooks
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
