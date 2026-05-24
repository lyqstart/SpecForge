import { spawn } from "child_process"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import type { Hooks, PluginInput } from "@opencode-ai/plugin"

const HS_PATH = path.join(os.homedir(), ".specforge", "runtime", "handshake.json")
let port = 0
let token = ""
let degraded = false

function wrap<T extends (...a: any[]) => Promise<any>>(fn: T, name: string): T {
  return (async (...a: any[]) => {
    try { return await fn(...a) } catch (e) { console.warn(`[sf:${name}]`, (e as Error).message) }
  }) as T
}

function readHS(): { port: number; token: string } | null {
  try {
    const h = JSON.parse(fs.readFileSync(HS_PATH, "utf-8"))
    return { port: h.port, token: h.token }
  } catch { return null }
}

async function postEvent(type: string, data: unknown) {
  if (degraded) { console.warn(`[sf:degraded] dropping ${type}`); return }
  try {
    await fetch(`http://127.0.0.1:${port}/api/v1/ingest/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event: type, data, ts: Date.now() }),
    })
  } catch { console.warn(`[sf] failed to post ${type}`) }
}

async function ensureDaemon() {
  const hs = readHS()
  if (hs) { port = hs.port; token = hs.token; return }
  try {
    const bin = path.join(os.homedir(), ".specforge", "bin", "specforged")
    spawn(bin, ["start"], { detached: true, stdio: "ignore" }).unref()
    const end = Date.now() + 5000
    while (Date.now() < end) {
      await new Promise(r => setTimeout(r, 250))
      const h = readHS()
      if (h) { port = h.port; token = h.token; return }
    }
  } catch {}
  degraded = true
  console.warn("[sf] daemon start timeout — degraded mode active")
}

export async function sf_specforge(input: PluginInput): Promise<Hooks> {
  await ensureDaemon()
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
