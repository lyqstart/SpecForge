import { existsSync } from "node:fs"
import { mkdir, readFile, rm, unlink } from "node:fs/promises"
import { dirname, isAbsolute, resolve, sep } from "node:path"
import * as crypto from "node:crypto"

import { atomicWriteFile } from "./atomic"

export const UPGRADE_JOURNAL_SCHEMA_VERSION = "1.0" as const
export const UPGRADE_JOURNAL_FILENAME = "upgrade_journal.json" as const

export type UpgradeMutationOperation = "replace" | "remove"
export type UpgradeMutationState = "planned" | "applied"
export type UpgradeJournalStatus =
  | "in_progress"
  | "success"
  | "failed"
  | "rolled_back"

export interface UpgradeJournalMutation {
  path: string
  operation: UpgradeMutationOperation
  state: UpgradeMutationState
  existed_before: boolean
  backup_path?: string
  backup_sha256?: string
  old_hash?: string
  new_hash?: string
}

export interface UpgradeJournal {
  schema_version: typeof UPGRADE_JOURNAL_SCHEMA_VERSION
  transaction_id: string
  started_at: string
  from_version: string
  to_version: string
  status: UpgradeJournalStatus
  mutations: UpgradeJournalMutation[]
}

export interface PlannedUpgradeMutation {
  path: string
  operation: UpgradeMutationOperation
  existed_before: boolean
  backup_path?: string
  backup_sha256?: string
  old_hash?: string
  new_hash?: string
}

export type UpgradeRecoveryResult =
  | "none"
  | "committed"
  | "rolled_back"
  | "cleared_rolled_back"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid upgrade journal ${field}`)
  }
}

function requireSha256(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`Invalid upgrade journal ${field}`)
  }
}

function requireUuid(value: unknown, field: string): asserts value is string {
  requireNonEmptyString(value, field)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid upgrade journal ${field}`)
  }
}

function requireIsoTimestamp(value: unknown, field: string): asserts value is string {
  requireNonEmptyString(value, field)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`Invalid upgrade journal ${field}`)
  }
}

function sha256(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function backupSessionRelativePath(
  transactionId: string,
  startedAt: string,
): string {
  const timestamp = startedAt.replace(/[-:.]/g, "")
  return `sf-user/backups/${timestamp}-${transactionId}`
}

function expectedBackupRelativePath(
  transactionId: string,
  startedAt: string,
  targetRelativePath: string,
): string {
  return `${backupSessionRelativePath(transactionId, startedAt)}/${sha256(targetRelativePath)}.bak`
}

function assertRelativeJournalPath(value: unknown, field: string): asserts value is string {
  requireNonEmptyString(value, field)
  if (
    isAbsolute(value)
    || value.includes("\\")
    || value.split("/").some(part => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Invalid upgrade journal ${field}`)
  }
}

function parseMutation(value: unknown, index: number): UpgradeJournalMutation {
  if (!isRecord(value)) {
    throw new Error(`Invalid upgrade journal mutations[${index}]`)
  }

  assertRelativeJournalPath(value.path, `mutations[${index}].path`)
  if (value.operation !== "replace" && value.operation !== "remove") {
    throw new Error(`Invalid upgrade journal mutations[${index}].operation`)
  }
  if (value.state !== "planned" && value.state !== "applied") {
    throw new Error(`Invalid upgrade journal mutations[${index}].state`)
  }
  if (typeof value.existed_before !== "boolean") {
    throw new Error(`Invalid upgrade journal mutations[${index}].existed_before`)
  }

  if (value.backup_path !== undefined) {
    assertRelativeJournalPath(value.backup_path, `mutations[${index}].backup_path`)
  }
  if (value.backup_sha256 !== undefined) {
    requireSha256(value.backup_sha256, `mutations[${index}].backup_sha256`)
  }
  if (value.old_hash !== undefined) {
    requireNonEmptyString(value.old_hash, `mutations[${index}].old_hash`)
  }
  if (value.new_hash !== undefined) {
    requireNonEmptyString(value.new_hash, `mutations[${index}].new_hash`)
  }

  if (value.operation === "remove" && !value.existed_before) {
    throw new Error(`Invalid upgrade journal mutations[${index}].existed_before`)
  }
  if (value.existed_before && (
    value.backup_path === undefined
    || value.backup_sha256 === undefined
  )) {
    throw new Error(`Invalid upgrade journal mutations[${index}].backup`)
  }
  if (!value.existed_before && (
    value.backup_path !== undefined
    || value.backup_sha256 !== undefined
  )) {
    throw new Error(`Invalid upgrade journal mutations[${index}].backup`)
  }

  return {
    path: value.path,
    operation: value.operation,
    state: value.state,
    existed_before: value.existed_before,
    ...(value.backup_path === undefined ? {} : { backup_path: value.backup_path }),
    ...(value.backup_sha256 === undefined ? {} : { backup_sha256: value.backup_sha256 }),
    ...(value.old_hash === undefined ? {} : { old_hash: value.old_hash }),
    ...(value.new_hash === undefined ? {} : { new_hash: value.new_hash }),
  }
}

export function parseUpgradeJournal(value: unknown): UpgradeJournal {
  if (!isRecord(value)) {
    throw new Error("Invalid upgrade journal root")
  }
  if (value.schema_version !== UPGRADE_JOURNAL_SCHEMA_VERSION) {
    throw new Error("Invalid upgrade journal schema_version")
  }
  requireUuid(value.transaction_id, "transaction_id")
  requireIsoTimestamp(value.started_at, "started_at")
  requireNonEmptyString(value.from_version, "from_version")
  requireNonEmptyString(value.to_version, "to_version")
  if (
    value.status !== "in_progress"
    && value.status !== "success"
    && value.status !== "failed"
    && value.status !== "rolled_back"
  ) {
    throw new Error("Invalid upgrade journal status")
  }
  if (!Array.isArray(value.mutations)) {
    throw new Error("Invalid upgrade journal mutations")
  }

  const mutations = value.mutations.map(parseMutation)
  for (let index = 0; index < mutations.length; index++) {
    const mutation = mutations[index]
    if (
      mutation.existed_before
      && mutation.backup_path !== expectedBackupRelativePath(
        value.transaction_id,
        value.started_at,
        mutation.path,
      )
    ) {
      throw new Error(`Invalid upgrade journal mutations[${index}].backup_path`)
    }
  }

  return {
    schema_version: UPGRADE_JOURNAL_SCHEMA_VERSION,
    transaction_id: value.transaction_id,
    started_at: value.started_at,
    from_version: value.from_version,
    to_version: value.to_version,
    status: value.status,
    mutations,
  }
}

export function getUpgradeJournalPath(installRoot: string): string {
  return resolve(installRoot, "sf-user", UPGRADE_JOURNAL_FILENAME)
}

function resolveInsideRoot(userLevelDir: string, journalRelativePath: string): string {
  assertRelativeJournalPath(journalRelativePath, "path")
  const root = resolve(userLevelDir)
  const target = resolve(root, ...journalRelativePath.split("/"))
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`
  if (!target.startsWith(rootPrefix)) {
    throw new Error("Upgrade journal path escapes user root")
  }
  return target
}

async function persistUpgradeJournal(
  userLevelDir: string,
  journal: UpgradeJournal,
): Promise<void> {
  const validated = parseUpgradeJournal(journal)
  await atomicWriteFile(
    getUpgradeJournalPath(userLevelDir),
    `${JSON.stringify(validated, null, 2)}\n`,
  )
}

export async function beginUpgradeJournal(
  userLevelDir: string,
  fromVersion: string,
  toVersion: string,
): Promise<UpgradeJournal> {
  requireNonEmptyString(fromVersion, "from_version")
  requireNonEmptyString(toVersion, "to_version")
  if (existsSync(getUpgradeJournalPath(userLevelDir))) {
    throw new Error("Existing upgrade journal must be recovered before upgrade")
  }

  const journal: UpgradeJournal = {
    schema_version: UPGRADE_JOURNAL_SCHEMA_VERSION,
    transaction_id: crypto.randomUUID(),
    started_at: new Date().toISOString(),
    from_version: fromVersion,
    to_version: toVersion,
    status: "in_progress",
    mutations: [],
  }
  await persistUpgradeJournal(userLevelDir, journal)
  return journal
}

export async function readUpgradeJournal(userLevelDir: string): Promise<UpgradeJournal> {
  const raw = await readFile(getUpgradeJournalPath(userLevelDir), "utf-8")
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error("Invalid upgrade journal JSON")
  }
  return parseUpgradeJournal(value)
}

export async function planUpgradeMutation(
  userLevelDir: string,
  journal: UpgradeJournal,
  mutation: PlannedUpgradeMutation,
): Promise<number> {
  if (journal.status !== "in_progress") {
    throw new Error("Upgrade journal is not in progress")
  }
  const entry = parseMutation({ ...mutation, state: "planned" }, journal.mutations.length)
  journal.mutations.push(entry)
  await persistUpgradeJournal(userLevelDir, journal)
  return journal.mutations.length - 1
}

export async function markUpgradeMutationApplied(
  userLevelDir: string,
  journal: UpgradeJournal,
  index: number,
): Promise<void> {
  const mutation = journal.mutations[index]
  if (journal.status !== "in_progress" || mutation?.state !== "planned") {
    throw new Error("Upgrade journal mutation is not planned")
  }
  mutation.state = "applied"
  await persistUpgradeJournal(userLevelDir, journal)
}

export async function createUpgradeBackup(
  userLevelDir: string,
  journal: UpgradeJournal,
  targetRelativePath: string,
): Promise<{ backup_path: string; backup_sha256: string }> {
  const validated = parseUpgradeJournal(journal)
  if (validated.status !== "in_progress") {
    throw new Error("Upgrade journal is not in progress")
  }
  assertRelativeJournalPath(targetRelativePath, "path")

  const sourcePath = resolveInsideRoot(userLevelDir, targetRelativePath)
  const backup_path = expectedBackupRelativePath(
    validated.transaction_id,
    validated.started_at,
    targetRelativePath,
  )
  const backupPath = resolveInsideRoot(userLevelDir, backup_path)
  if (existsSync(backupPath)) {
    throw new Error(`Upgrade backup already exists: ${targetRelativePath}`)
  }

  const content = await readFile(sourcePath)
  const backup_sha256 = sha256(content)
  await atomicWriteFile(backupPath, content)
  const persistedHash = sha256(await readFile(backupPath))
  if (persistedHash !== backup_sha256) {
    await unlink(backupPath).catch(() => undefined)
    throw new Error(`Upgrade backup hash mismatch: ${targetRelativePath}`)
  }
  return { backup_path, backup_sha256 }
}

async function cleanupUpgradeBackups(
  userLevelDir: string,
  journal: UpgradeJournal,
): Promise<void> {
  const validated = parseUpgradeJournal(journal)
  const sessionPath = resolveInsideRoot(
    userLevelDir,
    backupSessionRelativePath(validated.transaction_id, validated.started_at),
  )
  await rm(sessionPath, { recursive: true, force: true })
}

export async function rollbackUpgradeJournal(
  userLevelDir: string,
  journal: UpgradeJournal,
): Promise<void> {
  if (journal.status === "rolled_back") return
  if (journal.status === "success") {
    throw new Error("Committed upgrade journal cannot be rolled back")
  }

  const recoveryPlan = [...journal.mutations].reverse().map(mutation => ({
    mutation,
    targetPath: resolveInsideRoot(userLevelDir, mutation.path),
    backupPath: mutation.backup_path === undefined
      ? undefined
      : resolveInsideRoot(userLevelDir, mutation.backup_path),
  }))

  try {
    const verifiedBackups = new Map<string, Buffer>()
    for (const item of recoveryPlan) {
      if (!item.mutation.existed_before) continue
      const content = await readFile(item.backupPath!)
      if (sha256(content) !== item.mutation.backup_sha256) {
        throw new Error(`Upgrade rollback backup hash mismatch: ${item.mutation.path}`)
      }
      verifiedBackups.set(item.mutation.path, content)
    }

    for (const item of recoveryPlan) {
      if (item.mutation.existed_before) {
        await mkdir(dirname(item.targetPath), { recursive: true })
        await atomicWriteFile(item.targetPath, verifiedBackups.get(item.mutation.path)!)
      } else if (existsSync(item.targetPath)) {
        await unlink(item.targetPath)
      }
    }
    journal.status = "rolled_back"
    await persistUpgradeJournal(userLevelDir, journal)
  } catch (error) {
    journal.status = "failed"
    try {
      await persistUpgradeJournal(userLevelDir, journal)
    } catch {
      // Preserve the original rollback error.
    }
    throw error
  }
}

export async function commitUpgradeJournal(
  userLevelDir: string,
  journal: UpgradeJournal,
): Promise<void> {
  if (journal.status !== "in_progress") {
    throw new Error("Upgrade journal is not in progress")
  }
  if (journal.mutations.some(mutation => mutation.state !== "applied")) {
    throw new Error("Upgrade journal contains unapplied mutations")
  }
  journal.status = "success"
  await persistUpgradeJournal(userLevelDir, journal)
  await cleanupUpgradeBackups(userLevelDir, journal)
  await unlink(getUpgradeJournalPath(userLevelDir))
}

export async function recoverInterruptedUpgrade(
  userLevelDir: string,
): Promise<UpgradeRecoveryResult> {
  if (!existsSync(getUpgradeJournalPath(userLevelDir))) return "none"

  const journal = await readUpgradeJournal(userLevelDir)
  if (journal.status === "success") {
    await cleanupUpgradeBackups(userLevelDir, journal)
    await unlink(getUpgradeJournalPath(userLevelDir))
    return "committed"
  }
  if (journal.status === "rolled_back") {
    await cleanupUpgradeBackups(userLevelDir, journal)
    await unlink(getUpgradeJournalPath(userLevelDir))
    return "cleared_rolled_back"
  }

  await rollbackUpgradeJournal(userLevelDir, journal)
  return "rolled_back"
}
