/**
 * sf_project_init_core.ts — project bootstrap repair (Patch A.1)
 *
 * Fixes the bootstrap deadlock observed after Patch A:
 * - sf_project_init created .specforge/project/spec_manifest.json but root
 *   .specforge/manifest.json was missing in the runtime artifact.
 * - sf_state_transition requires .specforge/manifest.json when creating a WI.
 * - OBS-FULL Layer 1 requires project-local .specforge/config/observability.json.
 *
 * This implementation explicitly ensures critical bootstrap files before and
 * after layout traversal, independent of LAYOUT drift.
 */

import { mkdir, writeFile, access, readFile } from "node:fs/promises"
import { join, extname, dirname } from "node:path"
import { existsSync, statSync } from "node:fs"
import { LAYOUT, SPEC_DIR_NAME, legacyPaths } from "@specforge/types/directory-layout"
import { scanHostProfile, PROFILE_TTL_MS, getHostProfilePath } from "@specforge/host-profile"

export interface InitEntry {
  /** Relative path from project root, including .specforge */
  path: string
  type: "dir" | "system_file" | "user_file"
}

export interface InitResult {
  success: boolean
  created: string[]
  existed: string[]
  errors: string[]
  placeholderFiles: string[]
}

type SystemTemplate = (projectName: string, now: string) => string

const SYSTEM_FILE_CONTENT: Record<string, SystemTemplate> = {
  "manifest.json": (name, now) =>
    JSON.stringify(
      {
        schema_version: "6.0",
        project_name: name,
        created_at: now,
      },
      null,
      2,
    ) + "\n",

  "config/project.json": () =>
    JSON.stringify({ schema_version: "1.0" }, null, 2) + "\n",

  "config/risk_policy.json": () =>
    JSON.stringify({ schema_version: "1.0", rules: [] }, null, 2) + "\n",

  "config/skill_fragments.json": () =>
    JSON.stringify({ schema_version: "1.0", fragments: {} }, null, 2) + "\n",

  "config/observability.json": () =>
    JSON.stringify(
      {
        enabled: true,
        level: "replay",
        capture_plugin_events: true,
        capture_tool_calls: true,
        capture_tool_context: true,
        capture_raw_context: true,
        capture_daemon_rpc: true,
        capture_handler_io: true,
        capture_state_snapshots: true,
        capture_artifact_io: true,
        capture_gate_inputs: true,
        capture_hardstop: true,
        capture_payload: true,
        redact_secrets: true,
        max_inline_payload_bytes: 8192,
        payload_storage: "file",
      },
      null,
      2,
    ) + "\n",

  "knowledge/graph.json": () =>
    JSON.stringify({ nodes: [], edges: [] }, null, 2) + "\n",

  "specs/README.md": () => "# Specs\n\nWork Item 规格文档目录。\n",

  "project/spec_manifest.json": (name) =>
    JSON.stringify(
      {
        schema_version: "1.0",
        project_spec_version: "PSV-0001",
        project_name: name,
        project: {
          extension_registry: ".specforge/project/extension_registry.json",
          requirements_index: ".specforge/project/requirements_index.md",
          design_index: ".specforge/project/design_index.md",
          architecture: ".specforge/project/architecture.md",
          glossary: ".specforge/project/glossary.md",
          decisions: ".specforge/project/decisions.md",
          trace_matrix: ".specforge/project/trace_matrix.md",
        },
        modules: [],
      },
      null,
      2,
    ) + "\n",

  "project/extension_registry.json": () =>
    JSON.stringify(
      {
        schema_version: "1.0",
        project_spec_version: "PSV-0001",
        namespaces: {
          requirement_types: [],
          design_types: [],
          task_types: [],
          verification_types: [],
          gate_types: [],
        },
        updated_by_work_item: null,
        updated_at: null,
      },
      null,
      2,
    ) + "\n",

  ".gitignore": () => "runtime/\nlogs/\nsessions/\narchive/\ncas/\n",
}

const PLACEHOLDER_CONTENT = "> TODO: 由首次 intake 阶段填充\n"

const PLACEHOLDER_CHECK_FILES = [
  "config/prod-environment.md",
  "config/project-rules.md",
]

const V1_1_PROJECT_USER_FILES = [
  "project/requirements_index.md",
  "project/design_index.md",
  "project/architecture.md",
  "project/glossary.md",
  "project/decisions.md",
  "project/trace_matrix.md",
]

function normalizeLayoutPath(value: string): string {
  return value.replace(/\\/g, "/")
}

/**
 * Ensure root .specforge/manifest.json explicitly.
 *
 * This is intentionally independent of LAYOUT. If directory-layout.ts drifts,
 * project bootstrap must still satisfy sf_state_transition's guard.
 */
async function ensureRootManifest(
  projectRoot: string,
  projectName: string,
  now: string,
  result: InitResult,
): Promise<void> {
  const manifestRel = join(SPEC_DIR_NAME, "manifest.json")
  const manifestPath = join(projectRoot, manifestRel)
  const content = SYSTEM_FILE_CONTENT["manifest.json"](projectName, now)

  await mkdir(dirname(manifestPath), { recursive: true })

  const exists = await fileExists(manifestPath)
  if (!exists) {
    await writeFile(manifestPath, content, "utf-8")
    if (!result.created.includes(manifestRel)) result.created.push(manifestRel)
    return
  }

  try {
    const existing = await readFile(manifestPath, "utf-8")
    if (!existing.trim()) {
      await writeFile(manifestPath, content, "utf-8")
      if (!result.created.includes(manifestRel)) result.created.push(manifestRel)
    } else if (!result.existed.includes(manifestRel)) {
      result.existed.push(manifestRel)
    }
  } catch {
    await writeFile(manifestPath, content, "utf-8")
    if (!result.created.includes(manifestRel)) result.created.push(manifestRel)
  }
}

function buildManifest(): InitEntry[] {
  const entries: InitEntry[] = []

  // Root manifest is critical and must always be present, regardless of LAYOUT.
  entries.push({ path: join(SPEC_DIR_NAME, "manifest.json"), type: "system_file" })

  // Observability config is project-local and must be visibly present after sf_project_init.
  // If missing, OBS is off by design, so project initialization must deploy it.
  entries.push({ path: join(SPEC_DIR_NAME, "config", "observability.json"), type: "system_file" })

  for (const [key, value] of Object.entries(LAYOUT as Record<string, unknown>)) {
    if (key === "configFiles" || key === "projectFiles" || key === "workItemFiles") continue

    if (typeof value === "string") {
      const normalized = normalizeLayoutPath(value)
      const hasExt = extname(normalized) !== ""
      if (hasExt) {
        const entry = makeFileEntry(normalized)
        if (entry) entries.push(entry)
      } else {
        entries.push({ path: join(SPEC_DIR_NAME, normalized), type: "dir" })
      }
    }
  }

  for (const subValue of Object.values(legacyPaths.configFiles ?? {})) {
    if (typeof subValue === "string") {
      const entry = makeFileEntry(normalizeLayoutPath(subValue))
      if (entry) entries.push(entry)
    }
  }

  const projectFiles = (LAYOUT as any).projectFiles ?? {}
  for (const [key, subValue] of Object.entries(projectFiles)) {
    if (typeof subValue === "string") {
      const normalized = normalizeLayoutPath(subValue)
      if (key === "modulesRoot") {
        entries.push({ path: join(SPEC_DIR_NAME, normalized), type: "dir" })
      } else {
        const entry = makeFileEntry(normalized)
        if (entry) entries.push(entry)
      }
    }
  }

  entries.push({ path: join(SPEC_DIR_NAME, ".gitignore"), type: "system_file" })

  // Dedupe by path; root manifest may appear from both explicit entry and LAYOUT.
  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = entry.path.replace(/\\/g, "/")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function makeFileEntry(relativePath: string): InitEntry | null {
  const normalized = normalizeLayoutPath(relativePath)
  const fullPath = join(SPEC_DIR_NAME, normalized)

  if (PLACEHOLDER_CHECK_FILES.includes(normalized)) {
    return { path: fullPath, type: "user_file" }
  }

  if (V1_1_PROJECT_USER_FILES.includes(normalized)) {
    return { path: fullPath, type: "user_file" }
  }

  if (normalized in SYSTEM_FILE_CONTENT) {
    return { path: fullPath, type: "system_file" }
  }

  return null
}

export async function ensureProjectInit(
  projectRoot: string,
  projectName?: string,
): Promise<InitResult> {
  const result: InitResult = {
    success: true,
    created: [],
    existed: [],
    errors: [],
    placeholderFiles: [],
  }

  const name = projectName || projectRoot.split(/[/\\]/).pop() || "untitled"
  const now = new Date().toISOString()

  try {
    await ensureRootManifest(projectRoot, name, now, result)
  } catch (err: any) {
    result.errors.push(`${SPEC_DIR_NAME}/manifest.json: ${err.message}`)
    result.success = false
  }

  const manifest = buildManifest()

  const dirs = manifest.filter((e) => e.type === "dir")
  for (const entry of dirs) {
    const fullPath = join(projectRoot, entry.path)
    try {
      await mkdir(fullPath, { recursive: true })
    } catch (err: any) {
      if (err.code !== "EEXIST") {
        result.errors.push(`${entry.path}: ${err.message}`)
        result.success = false
      }
    }
  }

  const files = manifest.filter((e) => e.type !== "dir")
  for (const entry of files) {
    const fullPath = join(projectRoot, entry.path)
    const normalizedRel = normalizeLayoutPath(
      entry.path.startsWith(SPEC_DIR_NAME + "/")
        ? entry.path.slice(SPEC_DIR_NAME.length + 1)
        : entry.path.startsWith(SPEC_DIR_NAME + "\\")
          ? entry.path.slice(SPEC_DIR_NAME.length + 1)
          : entry.path,
    )

    try {
      await mkdir(dirname(fullPath), { recursive: true })

      const exists = await fileExists(fullPath)

      if (entry.type === "system_file") {
        const content = await getSystemFileContent(entry, name, now)

        if (exists) {
          try {
            const existing = await readFile(fullPath, "utf-8")
            // Do not overwrite a non-empty root manifest if it already exists.
            // Do not overwrite a non-empty observability config because it is user/project policy.
            if (
              (normalizedRel === "manifest.json" || normalizedRel === "config/observability.json") &&
              existing.trim()
            ) {
              result.existed.push(entry.path)
            } else if (existing !== content) {
              await writeFile(fullPath, content, "utf-8")
              result.created.push(entry.path)
            } else {
              result.existed.push(entry.path)
            }
          } catch {
            await writeFile(fullPath, content, "utf-8")
            result.created.push(entry.path)
          }
        } else {
          await writeFile(fullPath, content, "utf-8")
          result.created.push(entry.path)
        }
      } else {
        if (exists) {
          result.existed.push(entry.path)
        } else {
          await writeFile(fullPath, PLACEHOLDER_CONTENT, "utf-8")
          result.created.push(entry.path)
        }
      }

      if (PLACEHOLDER_CHECK_FILES.includes(normalizedRel)) {
        try {
          const content = await readFile(fullPath, "utf-8")
          if (content.startsWith("> TODO")) {
            result.placeholderFiles.push(entry.path)
          }
        } catch {
          result.placeholderFiles.push(entry.path)
        }
      }
    } catch (err: any) {
      result.errors.push(`${entry.path}: ${err.message}`)
      result.success = false
    }
  }

  // Re-check critical root manifest after layout traversal.
  try {
    await ensureRootManifest(projectRoot, name, now, result)
  } catch (err: any) {
    result.errors.push(`${SPEC_DIR_NAME}/manifest.json: ${err.message}`)
    result.success = false
  }

  try {
    await ensureHostProfile()
  } catch (err: any) {
    result.errors.push(`host-profile: ${err.message}`)
    result.success = false
  }

  return result
}

async function getSystemFileContent(
  entry: InitEntry,
  projectName: string,
  now: string,
): Promise<string> {
  const relativePath = normalizeLayoutPath(
    entry.path.startsWith(SPEC_DIR_NAME + "/")
      ? entry.path.slice(SPEC_DIR_NAME.length + 1)
      : entry.path.startsWith(SPEC_DIR_NAME + "\\")
        ? entry.path.slice(SPEC_DIR_NAME.length + 1)
        : entry.path,
  )

  const template = SYSTEM_FILE_CONTENT[relativePath]
  if (template) {
    return template(projectName, now)
  }

  return ""
}

async function ensureHostProfile(): Promise<void> {
  const profilePath = getHostProfilePath()

  if (existsSync(profilePath)) {
    try {
      const stat = statSync(profilePath)
      const ageMs = Date.now() - stat.mtimeMs
      if (ageMs < PROFILE_TTL_MS) return
    } catch {
      // continue to scan
    }
  }

  await scanHostProfile({ force: false, verbose: false })
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}
