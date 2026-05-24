import { spawn, ChildProcess } from "child_process"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

export const HANDSHAKE_PATH = path.join(os.homedir(), ".specforge", "runtime", "handshake.json")

export interface HandshakeInfo {
  pid: number
  port: number
  token: string
  startedAt: number
  schemaVersion: string
}

export function readHandshake(): HandshakeInfo | null {
  try {
    return JSON.parse(fs.readFileSync(HANDSHAKE_PATH, "utf-8"))
  } catch { return null }
}

export async function spawnDaemon(timeoutMs = 5000): Promise<{ port: number; token: string } | null> {
  const existing = readHandshake()
  if (existing) return { port: existing.port, token: existing.token }

  const bin = path.join(os.homedir(), ".specforge", "bin", "specforged")
  const child: ChildProcess = spawn(bin, ["start"], { detached: true, stdio: "ignore" })
  child.unref()

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 250))
    const hs = readHandshake()
    if (hs) return { port: hs.port, token: hs.token }
  }

  return null
}
