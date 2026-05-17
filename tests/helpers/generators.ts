/**
 * 共享 fast-check 生成器
 *
 * 为 Reconcile 模块的属性测试提供类型安全的随机数据生成器。
 * 所有生成器产出的值符合 scripts/lib/types.ts 中定义的类型约束。
 */
import fc from "fast-check"
import type {
  ManagedComponentType,
  DesiredStateEntry,
  CurrentStateEntry,
  FileReconcileInput,
  UserLevelManifest,
  FileEntry,
  PendingDeleteEntry,
} from "../../scripts/lib/types"

// ============================================================
// 基础生成器
// ============================================================

/**
 * 生成有效的 POSIX 相对路径，模拟 .opencode/ 目录结构
 *
 * 路径模式：
 * - agents/sf-xxx.md
 * - tools/sf_xxx.ts
 * - tools/lib/sf_xxx.ts
 * - plugins/sf_xxx.ts
 * - skills/xxx/SKILL.md
 */
export function arbRelativePath(): fc.Arbitrary<string> {
  const identifier = fc.stringMatching(/^[a-z0-9_]{3,20}$/)

  const agentPath = identifier.map((id) => `agents/sf-${id}.md`)
  const toolPath = identifier.map((id) => `tools/sf_${id}.ts`)
  const toolLibPath = identifier.map((id) => `tools/lib/sf_${id}.ts`)
  const pluginPath = identifier.map((id) => `plugins/sf_${id}.ts`)
  const skillPath = identifier.map((id) => `skills/${id}/SKILL.md`)

  return fc.oneof(agentPath, toolPath, toolLibPath, pluginPath, skillPath)
}

/**
 * 生成有效的 ManagedComponentType
 */
export function arbManagedComponentType(): fc.Arbitrary<ManagedComponentType> {
  return fc.constantFrom<ManagedComponentType>(
    "agent",
    "tool",
    "tool_lib",
    "plugin",
    "skill"
  )
}

/**
 * 生成有效的 SHA-256 哈希字符串（64 字符十六进制）
 */
export function arbSha256(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[0-9a-f]{64}$/)
}

// ============================================================
// 复合生成器
// ============================================================

/**
 * 生成有效的 DesiredStateEntry
 */
export function arbDesiredStateEntry(): fc.Arbitrary<DesiredStateEntry> {
  return fc.record({
    relativePath: arbRelativePath(),
    componentType: arbManagedComponentType(),
    sourceHash: arbSha256(),
    size: fc.nat({ max: 1_000_000 }),
  })
}

/**
 * 生成有效的 CurrentStateEntry
 *
 * currentHash 和 manifestHash 均为可选（string | undefined），
 * 模拟文件不存在或 Manifest 无记录的场景。
 */
export function arbCurrentStateEntry(): fc.Arbitrary<CurrentStateEntry> {
  return fc.record({
    relativePath: arbRelativePath(),
    currentHash: fc.option(arbSha256(), { nil: undefined }),
    manifestHash: fc.option(arbSha256(), { nil: undefined }),
    componentType: arbManagedComponentType(),
    size: fc.nat({ max: 1_000_000 }),
    existsOnDisk: fc.boolean(),
  })
}

/**
 * 生成有效的 FileReconcileInput
 *
 * 覆盖所有 defined/undefined 哈希组合，用于测试 R14 决策矩阵。
 */
export function arbFileReconcileInput(): fc.Arbitrary<FileReconcileInput> {
  return fc.record({
    relativePath: arbRelativePath(),
    sourceHash: fc.option(arbSha256(), { nil: undefined }),
    currentHash: fc.option(arbSha256(), { nil: undefined }),
    manifestHash: fc.option(arbSha256(), { nil: undefined }),
    componentType: arbManagedComponentType(),
    isManagedComponent: fc.boolean(),
  })
}

/**
 * 生成有效的 UserLevelManifest
 *
 * 包含合理的 schema_version、semver 版本、ISO8601 时间戳和文件条目。
 */
export function arbManifest(): fc.Arbitrary<UserLevelManifest> {
  const arbFileEntry = (): fc.Arbitrary<FileEntry> =>
    fc.record({
      sha256: arbSha256(),
      size: fc.nat({ max: 1_000_000 }),
      type: arbManagedComponentType(),
    })

  const arbPendingDelete = (): fc.Arbitrary<PendingDeleteEntry> =>
    fc.record({
      relativePath: arbRelativePath(),
      failedAt: fc.date().map((d) => d.toISOString()),
      reason: fc.constantFrom(
        "permission_denied",
        "file_locked",
        "unknown_error"
      ),
    })

  const arbSemver = fc
    .tuple(
      fc.nat({ max: 10 }),
      fc.nat({ max: 20 }),
      fc.nat({ max: 50 })
    )
    .map(([major, minor, patch]) => `${major}.${minor}.${patch}`)

  const arbIso8601 = fc.date().map((d) => d.toISOString())

  const arbAgentName = fc
    .stringMatching(/^[a-z_]{3,15}$/)
    .map((id) => `sf-${id}`)

  return fc.record({
    schema_version: fc.constant("1.0" as const),
    shared_version: arbSemver,
    install_mode: fc.constant("user_level" as const),
    installed_at: arbIso8601,
    updated_at: arbIso8601,
    managed_agents: fc.array(arbAgentName, { minLength: 0, maxLength: 10 }),
    managed_agent_hashes: fc
      .array(fc.tuple(arbAgentName, arbSha256()), {
        minLength: 0,
        maxLength: 10,
      })
      .map((pairs) => Object.fromEntries(pairs)),
    files: fc
      .array(fc.tuple(arbRelativePath(), arbFileEntry()), {
        minLength: 0,
        maxLength: 30,
      })
      .map((pairs) => Object.fromEntries(pairs)),
    pending_deletes: fc.option(
      fc.array(arbPendingDelete(), { minLength: 0, maxLength: 5 }),
      { nil: undefined }
    ),
  })
}
