#!/usr/bin/env bun
/**
 * SpecForge Unified Installer CLI
 * 
 * 统一的跨平台安装命令工具，替代平台特定脚本。
 * 通过 `bun scripts/sf-installer.ts <subcommand>` 调用。
 * 
 * 子命令: install | upgrade | uninstall | verify
 * 选项: --target <path> | --force | --purge | --dry-run | --skip-deps | --version
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ============================================================================
// DD-2: 文件注册表 — SpecForge 部署的所有文件
// ============================================================================

const FILE_REGISTRY: string[] = [
  // Agent 定义
  ".opencode/agents/sf-orchestrator.md",
  ".opencode/agents/sf-requirements.md",
  ".opencode/agents/sf-design.md",
  ".opencode/agents/sf-task-planner.md",
  ".opencode/agents/sf-executor.md",
  ".opencode/agents/sf-debugger.md",
  ".opencode/agents/sf-reviewer.md",
  ".opencode/agents/sf-verifier.md",

  // Custom Tools
  ".opencode/tools/sf_artifact_write.ts",
  ".opencode/tools/sf_batch_verify.ts",
  ".opencode/tools/sf_context_build.ts",
  ".opencode/tools/sf_cost_report.ts",
  ".opencode/tools/sf_design_gate.ts",
  ".opencode/tools/sf_doc_lint.ts",
  ".opencode/tools/sf_doctor.ts",
  ".opencode/tools/sf_knowledge_graph.ts",
  ".opencode/tools/sf_knowledge_query.ts",
  ".opencode/tools/sf_requirements_gate.ts",
  ".opencode/tools/sf_state_read.ts",
  ".opencode/tools/sf_state_transition.ts",
  ".opencode/tools/sf_tasks_gate.ts",
  ".opencode/tools/sf_trace_matrix.ts",
  ".opencode/tools/sf_verification_gate.ts",

  // Tool 核心库
  ".opencode/tools/lib/sf_artifact_write_core.ts",
  ".opencode/tools/lib/sf_batch_verify_core.ts",
  ".opencode/tools/lib/sf_context_build_core.ts",
  ".opencode/tools/lib/sf_conversation_recorder_core.ts",
  ".opencode/tools/lib/sf_cost_report_core.ts",
  ".opencode/tools/lib/sf_design_gate_core.ts",
  ".opencode/tools/lib/sf_doc_lint_core.ts",
  ".opencode/tools/lib/sf_knowledge_graph_core.ts",
  ".opencode/tools/lib/sf_knowledge_query_core.ts",
  ".opencode/tools/lib/sf_requirements_gate_core.ts",
  ".opencode/tools/lib/sf_state_read_core.ts",
  ".opencode/tools/lib/sf_state_transition_core.ts",
  ".opencode/tools/lib/sf_tasks_gate_core.ts",
  ".opencode/tools/lib/sf_trace_matrix_core.ts",
  ".opencode/tools/lib/sf_verification_gate_core.ts",
  ".opencode/tools/lib/state_machine.ts",
  ".opencode/tools/lib/utils.ts",

  // Plugins
  ".opencode/plugins/sf_checkpoint.ts",
  ".opencode/plugins/sf_cost_tracker.ts",
  ".opencode/plugins/sf_event_logger.ts",
  ".opencode/plugins/sf_permission_guard.ts",
  ".opencode/plugins/sf_session_recorder.ts",

  // Skills
  ".opencode/skills/sf-workflow-feature-spec/SKILL.md",
  ".opencode/skills/sf-workflow-bugfix-spec/SKILL.md",
  ".opencode/skills/sf-workflow-design-first/SKILL.md",
  ".opencode/skills/sf-workflow-quick-change/SKILL.md",
  ".opencode/skills/superpowers-brainstorming/SKILL.md",
  ".opencode/skills/superpowers-code-review/SKILL.md",
  ".opencode/skills/superpowers-subagent-driven-development/SKILL.md",
  ".opencode/skills/superpowers-systematic-debugging/SKILL.md",
  ".opencode/skills/superpowers-tdd/SKILL.md",
  ".opencode/skills/superpowers-verification-before-completion/SKILL.md",
  ".opencode/skills/superpowers-writing-plans/SKILL.md",

  // SpecForge 核心配置
  "specforge/agents/AGENT_CONSTITUTION.md",
  "specforge/agents/contracts/sf-orchestrator.contract.md",
  "specforge/agents/contracts/sf-requirements.contract.md",
  "specforge/agents/contracts/sf-design.contract.md",
  "specforge/agents/contracts/sf-executor.contract.md",
  "specforge/agents/contracts/sf-task-planner.contract.md",
  "specforge/agents/contracts/sf-debugger.contract.md",
  "specforge/agents/contracts/sf-reviewer.contract.md",
  "specforge/agents/contracts/sf-verifier.contract.md",
  "specforge/config/project.json",
  "specforge/config/risk_policy.json",
  "specforge/config/skill_fragments.json",

  // SpecForge 运行时初始文件
  "specforge/runtime/state.json",
  "specforge/runtime/events.jsonl",

  // 根目录文件
  "AGENTS.md",
];

/** 需要合并而非直接复制的配置文件 */
const MERGE_FILES = ["opencode.json", "package.json"] as const;

/** 运行时数据目录（卸载时默认保留） */
const RUNTIME_DIRS = [
  "specforge/runtime/checkpoints",
  "specforge/sessions",
  "specforge/specs",
  "specforge/archive",
  "specforge/logs",
] as const;

// ============================================================================
// DD-3: 清单管理模块
// ============================================================================

interface ManifestFile {
  version: string;
  installed_at: string;
  source_dir: string;
  files: Record<string, string>;
}


/** 计算文件的 SHA-256 校验和 */
async function computeSHA256(filePath: string): Promise<string> {
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}

/** 读取清单文件，不存在时返回 null */
function readManifest(targetDir: string): ManifestFile | null {
  const manifestPath = path.join(targetDir, "specforge", "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const content = fs.readFileSync(manifestPath, "utf-8");
    return JSON.parse(content) as ManifestFile;
  } catch {
    return null;
  }
}

/** 写入清单文件 */
function writeManifest(targetDir: string, manifest: ManifestFile): void {
  const manifestPath = path.join(targetDir, "specforge", "manifest.json");
  const dir = path.dirname(manifestPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

/** 构建完整清单 */
async function buildManifest(
  sourceDir: string,
  targetDir: string,
  deployedFiles: string[]
): Promise<ManifestFile> {
  const version = getSourceVersion(sourceDir);
  const files: Record<string, string> = {};

  for (const relativePath of deployedFiles) {
    const targetPath = path.join(targetDir, relativePath);
    if (fs.existsSync(targetPath)) {
      files[relativePath] = await computeSHA256(targetPath);
    }
  }

  return {
    version,
    installed_at: new Date().toISOString(),
    source_dir: path.resolve(sourceDir),
    files,
  };
}

/** 从源目录 package.json 读取版本号 */
function getSourceVersion(sourceDir: string): string {
  const pkgPath = path.join(sourceDir, "package.json");
  if (!fs.existsSync(pkgPath)) return "0.0.0";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// ============================================================================
// DD-1: 参数解析模块
// ============================================================================

interface CLIOptions {
  subcommand: "install" | "upgrade" | "uninstall" | "verify" | null;
  target: string;
  force: boolean;
  purge: boolean;
  dryRun: boolean;
  skipDeps: boolean;
  showVersion: boolean;
}

function parseArgs(args: string[]): CLIOptions {
  const opts: CLIOptions = {
    subcommand: null,
    target: process.cwd(),
    force: false,
    purge: false,
    dryRun: false,
    skipDeps: false,
    showVersion: false,
  };

  const validSubcommands = ["install", "upgrade", "uninstall", "verify"];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--target" && i + 1 < args.length) {
      opts.target = path.resolve(args[++i]);
    } else if (arg === "--force") {
      opts.force = true;
    } else if (arg === "--purge") {
      opts.purge = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--skip-deps") {
      opts.skipDeps = true;
    } else if (arg === "--version") {
      opts.showVersion = true;
    } else if (arg === "--help" || arg === "-h") {
      showUsage();
      process.exit(0);
    } else if (!arg.startsWith("-") && opts.subcommand === null) {
      if (validSubcommands.includes(arg)) {
        opts.subcommand = arg as CLIOptions["subcommand"];
      } else {
        console.error(`❌ 错误: 未知子命令 "${arg}"`);
        console.error(`   建议: 可用子命令为 install, upgrade, uninstall, verify`);
        process.exit(1);
      }
    }
  }

  return opts;
}

function showUsage(): void {
  console.log(`
SpecForge 统一安装器 — 跨平台 CLI 工具

用法:
  bun scripts/sf-installer.ts <subcommand> [options]

子命令:
  install     将 SpecForge 安装到目标项目
  upgrade     升级目标项目中的 SpecForge 到新版本
  uninstall   从目标项目中移除 SpecForge
  verify      校验目标项目中 SpecForge 安装的完整性

选项:
  --target <path>   目标项目路径（默认: 当前工作目录）
  --force           忽略冲突，强制执行操作
  --purge           卸载时删除所有运行时数据
  --dry-run         仅显示将执行的操作，不实际执行
  --skip-deps       跳过自动执行 bun install
  --version         显示已安装的 SpecForge 版本
  --help, -h        显示此帮助信息

示例:
  bun scripts/sf-installer.ts install --target ./my-project
  bun scripts/sf-installer.ts upgrade
  bun scripts/sf-installer.ts uninstall --purge
  bun scripts/sf-installer.ts verify
`);
}

function showVersion(targetDir: string): void {
  const manifest = readManifest(targetDir);
  if (manifest) {
    console.log(`SpecForge v${manifest.version}`);
    console.log(`安装时间: ${manifest.installed_at}`);
    console.log(`源目录: ${manifest.source_dir}`);
    console.log(`已部署文件: ${Object.keys(manifest.files).length} 个`);
  } else {
    console.log("SpecForge 未安装在此目录中");
  }
}

// ============================================================================
// DD-4: 冲突检测模块
// ============================================================================

interface ConflictReport {
  hasConflicts: boolean;
  conflicts: Array<{
    path: string;
    reason: "user_file_at_sf_path" | "non_sf_agent_in_config";
    detail: string;
  }>;
}

/** 检查文件名是否为 SpecForge 文件（以 sf- 或 sf_ 开头） */
function isSpecForgeFile(filename: string): boolean {
  return filename.startsWith("sf-") || filename.startsWith("sf_");
}

/** 检测文件冲突 */
function detectConflicts(targetDir: string, manifest: ManifestFile | null): ConflictReport {
  const conflicts: ConflictReport["conflicts"] = [];

  for (const relativePath of FILE_REGISTRY) {
    const targetPath = path.join(targetDir, relativePath);
    if (fs.existsSync(targetPath)) {
      // 如果文件在现有清单中，是 SF 文件，无冲突
      if (manifest && manifest.files[relativePath]) continue;
      // 否则是用户文件占据了 SF 路径
      conflicts.push({
        path: relativePath,
        reason: "user_file_at_sf_path",
        detail: `用户文件占据了 SpecForge 需要部署的路径: ${relativePath}`,
      });
    }
  }

  // 检查 opencode.json 中的冲突
  const openCodeConflicts = checkOpenCodeJsonConflicts(targetDir);
  conflicts.push(...openCodeConflicts.conflicts);

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
  };
}

/** 检查 opencode.json 中非 SF 安装的同名 agent */
function checkOpenCodeJsonConflicts(targetDir: string): ConflictReport {
  const conflicts: ConflictReport["conflicts"] = [];
  const configPath = path.join(targetDir, "opencode.json");

  if (!fs.existsSync(configPath)) {
    return { hasConflicts: false, conflicts: [] };
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (config.agent && typeof config.agent === "object") {
      for (const agentName of Object.keys(config.agent)) {
        if (agentName.startsWith("sf-")) {
          // 如果存在 sf- 前缀的 agent 但不在清单中，可能是冲突
          const manifest = readManifest(targetDir);
          if (!manifest) {
            conflicts.push({
              path: "opencode.json",
              reason: "non_sf_agent_in_config",
              detail: `opencode.json 中已存在 agent "${agentName}"，但非 SpecForge 安装`,
            });
          }
        }
      }
    }
  } catch {
    // JSON 解析失败不算冲突，后续合并时会处理
  }

  return { hasConflicts: conflicts.length > 0, conflicts };
}


// ============================================================================
// DD-5: 配置合并模块
// ============================================================================

/** 合并 opencode.json：仅操作 agent 对象中 sf-* 条目 */
function mergeOpenCodeJson(targetDir: string, sourceDir: string, mode: "add" | "remove"): void {
  const targetPath = path.join(targetDir, "opencode.json");
  const sourcePath = path.join(sourceDir, "opencode.json");

  if (mode === "add") {
    // 读取源文件
    if (!fs.existsSync(sourcePath)) return;
    let sourceConfig: any;
    try {
      sourceConfig = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
    } catch (e) {
      throw new Error(`源文件 opencode.json 解析失败: ${e}`);
    }

    // 读取或创建目标文件
    let targetConfig: any = {};
    if (fs.existsSync(targetPath)) {
      try {
        targetConfig = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
      } catch (e) {
        throw new Error(`目标文件 opencode.json 解析失败: ${e}\n   建议: 请修复 JSON 语法后重试`);
      }
    }

    // 保留目标文件的 $schema 和 permission
    // 仅将源文件中 sf-* agent 写入目标
    if (!targetConfig.agent) targetConfig.agent = {};
    if (sourceConfig.agent && typeof sourceConfig.agent === "object") {
      for (const [name, value] of Object.entries(sourceConfig.agent)) {
        if (name.startsWith("sf-")) {
          targetConfig.agent[name] = value;
        }
      }
    }

    // 如果目标没有 $schema 但源有，添加
    if (!targetConfig.$schema && sourceConfig.$schema) {
      targetConfig.$schema = sourceConfig.$schema;
    }
    // 如果目标没有 permission 但源有，添加
    if (targetConfig.permission === undefined && sourceConfig.permission !== undefined) {
      targetConfig.permission = sourceConfig.permission;
    }

    fs.writeFileSync(targetPath, JSON.stringify(targetConfig, null, 2) + "\n", "utf-8");
  } else {
    // mode === "remove"
    if (!fs.existsSync(targetPath)) return;
    let targetConfig: any;
    try {
      targetConfig = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    } catch (e) {
      throw new Error(`目标文件 opencode.json 解析失败: ${e}`);
    }

    if (targetConfig.agent && typeof targetConfig.agent === "object") {
      for (const name of Object.keys(targetConfig.agent)) {
        if (name.startsWith("sf-")) {
          delete targetConfig.agent[name];
        }
      }
    }

    fs.writeFileSync(targetPath, JSON.stringify(targetConfig, null, 2) + "\n", "utf-8");
  }
}

/** 合并 package.json：仅操作 devDependencies 中 SF 所需条目 */
function mergePackageJson(targetDir: string, sourceDir: string, mode: "add" | "remove"): void {
  const targetPath = path.join(targetDir, "package.json");
  const sourcePath = path.join(sourceDir, "package.json");

  if (mode === "add") {
    if (!fs.existsSync(sourcePath)) return;
    let sourcePkg: any;
    try {
      sourcePkg = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
    } catch (e) {
      throw new Error(`源文件 package.json 解析失败: ${e}`);
    }

    let targetPkg: any = {};
    if (fs.existsSync(targetPath)) {
      try {
        targetPkg = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
      } catch (e) {
        throw new Error(`目标文件 package.json 解析失败: ${e}\n   建议: 请修复 JSON 语法后重试`);
      }
    }

    // 合并 devDependencies
    if (sourcePkg.devDependencies) {
      if (!targetPkg.devDependencies) targetPkg.devDependencies = {};
      for (const [name, version] of Object.entries(sourcePkg.devDependencies)) {
        targetPkg.devDependencies[name] = version;
      }
    }

    fs.writeFileSync(targetPath, JSON.stringify(targetPkg, null, 2) + "\n", "utf-8");
  } else {
    // mode === "remove"
    if (!fs.existsSync(targetPath)) return;
    if (!fs.existsSync(sourcePath)) return;

    let targetPkg: any;
    try {
      targetPkg = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    } catch (e) {
      throw new Error(`目标文件 package.json 解析失败: ${e}`);
    }

    let sourcePkg: any;
    try {
      sourcePkg = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
    } catch {
      return; // 源文件解析失败时跳过
    }

    if (targetPkg.devDependencies && sourcePkg.devDependencies) {
      for (const name of Object.keys(sourcePkg.devDependencies)) {
        delete targetPkg.devDependencies[name];
      }
    }

    fs.writeFileSync(targetPath, JSON.stringify(targetPkg, null, 2) + "\n", "utf-8");
  }
}

// ============================================================================
// DD-6: 文件操作模块
// ============================================================================

type OpType = "创建" | "更新" | "删除" | "跳过" | "合并";

interface FileOperation {
  type: OpType;
  path: string;
  reason?: string;
}

/** 部署单个文件 */
function deployFile(
  sourceDir: string,
  targetDir: string,
  relativePath: string,
  dryRun: boolean
): FileOperation {
  const sourcePath = path.join(sourceDir, relativePath);
  const targetPath = path.join(targetDir, relativePath);

  if (!fs.existsSync(sourcePath)) {
    return { type: "跳过", path: relativePath, reason: "源文件不存在" };
  }

  const exists = fs.existsSync(targetPath);
  const opType: OpType = exists ? "更新" : "创建";

  if (!dryRun) {
    try {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.copyFileSync(sourcePath, targetPath);
    } catch (e: any) {
      if (e.code === "EACCES" || e.code === "EPERM") {
        return { type: "跳过", path: relativePath, reason: `权限错误: ${e.message}` };
      }
      throw e;
    }
  }

  return { type: opType, path: relativePath };
}

/** 删除单个文件 */
function removeFile(targetDir: string, relativePath: string, dryRun: boolean): FileOperation {
  const targetPath = path.join(targetDir, relativePath);

  if (!fs.existsSync(targetPath)) {
    return { type: "跳过", path: relativePath, reason: "文件不存在" };
  }

  if (!dryRun) {
    try {
      fs.unlinkSync(targetPath);
    } catch (e: any) {
      if (e.code === "EACCES" || e.code === "EPERM") {
        return { type: "跳过", path: relativePath, reason: `权限错误: ${e.message}` };
      }
      throw e;
    }
  }

  return { type: "删除", path: relativePath };
}

/** 删除空目录 */
function removeEmptyDirs(targetDir: string, dirs: string[], dryRun: boolean): FileOperation[] {
  const ops: FileOperation[] = [];

  // 按路径深度降序排列，先删除深层目录
  const sorted = [...dirs].sort((a, b) => b.split("/").length - a.split("/").length);

  for (const dir of sorted) {
    const fullPath = path.join(targetDir, dir);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const entries = fs.readdirSync(fullPath);
      if (entries.length === 0 || (entries.length === 1 && entries[0] === ".gitkeep")) {
        if (!dryRun) {
          // Remove .gitkeep if present
          const gitkeepPath = path.join(fullPath, ".gitkeep");
          if (fs.existsSync(gitkeepPath)) fs.unlinkSync(gitkeepPath);
          fs.rmdirSync(fullPath);
        }
        ops.push({ type: "删除", path: dir });
      }
    } catch {
      // 忽略无法读取的目录
    }
  }

  return ops;
}

/** 输出操作日志 */
function logOperation(op: FileOperation): void {
  const icons: Record<OpType, string> = {
    "创建": "📄",
    "更新": "🔄",
    "删除": "🗑️",
    "跳过": "⏭️",
    "合并": "🔀",
  };
  const icon = icons[op.type] || "•";
  const suffix = op.reason ? ` (${op.reason})` : "";
  console.log(`  ${icon} [${op.type}] ${op.path}${suffix}`);
}


// ============================================================================
// DD-7: 命令实现
// ============================================================================

/** install 子命令 */
async function cmdInstall(opts: CLIOptions, sourceDir: string): Promise<void> {
  const { target, force, dryRun, skipDeps } = opts;

  // 检查是否已安装
  const existingManifest = readManifest(target);
  if (existingManifest) {
    console.error(`❌ 错误: SpecForge 已安装 (v${existingManifest.version})`);
    console.error(`   建议: 使用 \`upgrade\` 子命令来更新版本`);
    process.exit(1);
  }

  // 冲突检测
  if (!force) {
    const report = detectConflicts(target, null);
    if (report.hasConflicts) {
      console.error(`❌ 错误: 检测到 ${report.conflicts.length} 个文件冲突`);
      for (const c of report.conflicts) {
        console.error(`   • ${c.path}: ${c.detail}`);
      }
      console.error(`   建议: 解决冲突后重试，或使用 --force 强制安装`);
      process.exit(1);
    }
  }

  console.log(dryRun ? "🔍 [DRY-RUN] 模拟安装..." : "📦 正在安装 SpecForge...");
  console.log(`   源目录: ${sourceDir}`);
  console.log(`   目标目录: ${target}`);
  console.log("");

  // 部署文件
  const deployedFiles: string[] = [];
  const ops: FileOperation[] = [];

  for (const relativePath of FILE_REGISTRY) {
    const op = deployFile(sourceDir, target, relativePath, dryRun);
    ops.push(op);
    logOperation(op);
    if (op.type === "创建" || op.type === "更新") {
      deployedFiles.push(relativePath);
    }
  }

  // 合并配置文件
  console.log("");
  console.log("  🔀 [合并] opencode.json");
  if (!dryRun) {
    mergeOpenCodeJson(target, sourceDir, "add");
  }

  console.log("  🔀 [合并] package.json");
  if (!dryRun) {
    mergePackageJson(target, sourceDir, "add");
  }

  // 写入清单
  if (!dryRun) {
    const manifest = await buildManifest(sourceDir, target, deployedFiles);
    writeManifest(target, manifest);
    console.log("");
    console.log(`  📋 清单已写入 (v${manifest.version}, ${Object.keys(manifest.files).length} 个文件)`);

    // 完整性校验
    let integrityOk = true;
    for (const [filePath, expectedHash] of Object.entries(manifest.files)) {
      const fullPath = path.join(target, filePath);
      if (fs.existsSync(fullPath)) {
        const actualHash = await computeSHA256(fullPath);
        if (actualHash !== expectedHash) {
          console.error(`  ⚠️ 完整性校验失败: ${filePath}`);
          integrityOk = false;
        }
      }
    }
    if (integrityOk) {
      console.log("  ✅ 完整性校验通过");
    }
  }

  // 摘要
  const created = ops.filter((o) => o.type === "创建").length;
  const updated = ops.filter((o) => o.type === "更新").length;
  const skipped = ops.filter((o) => o.type === "跳过").length;

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ 安装完成: ${created} 创建, ${updated} 更新, ${skipped} 跳过`);
  console.log("");
  console.log("后续步骤:");
  console.log("  1. 运行 `bun install` 安装依赖");
  console.log("  2. 运行 `bun scripts/sf-installer.ts verify` 验证安装完整性");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 自动依赖安装
  if (!dryRun && !skipDeps) {
    runDepsInstall(target);
  }
}

/** upgrade 子命令 */
async function cmdUpgrade(opts: CLIOptions, sourceDir: string): Promise<void> {
  const { target, force, dryRun, skipDeps } = opts;

  // 检查是否已安装
  const manifest = readManifest(target);
  if (!manifest) {
    console.error(`❌ 错误: SpecForge 未安装`);
    console.error(`   建议: 使用 \`install\` 子命令来安装`);
    process.exit(1);
  }

  // 比较版本
  const sourceVersion = getSourceVersion(sourceDir);
  if (sourceVersion === manifest.version && !force) {
    console.log(`✅ 已是最新版本 (v${manifest.version})`);
    process.exit(0);
  }

  // 冲突检测
  if (!force) {
    const report = detectConflicts(target, manifest);
    if (report.hasConflicts) {
      console.error(`❌ 错误: 检测到 ${report.conflicts.length} 个文件冲突`);
      for (const c of report.conflicts) {
        console.error(`   • ${c.path}: ${c.detail}`);
      }
      console.error(`   建议: 解决冲突后重试，或使用 --force 强制升级`);
      process.exit(1);
    }
  }

  console.log(dryRun ? "🔍 [DRY-RUN] 模拟升级..." : "⬆️ 正在升级 SpecForge...");
  console.log(`   当前版本: v${manifest.version}`);
  console.log(`   目标版本: v${sourceVersion}`);
  console.log("");

  const newFiles: string[] = [];
  const updatedFiles: string[] = [];
  const removedFiles: string[] = [];
  const ops: FileOperation[] = [];

  // 计算差异并部署
  for (const relativePath of FILE_REGISTRY) {
    const sourcePath = path.join(sourceDir, relativePath);
    const targetPath = path.join(target, relativePath);

    if (!fs.existsSync(sourcePath)) {
      ops.push({ type: "跳过", path: relativePath, reason: "源文件不存在" });
      continue;
    }

    const sourceHash = await computeSHA256(sourcePath);
    const manifestHash = manifest.files[relativePath];

    if (!manifestHash) {
      // 新文件
      const op = deployFile(sourceDir, target, relativePath, dryRun);
      ops.push(op);
      logOperation(op);
      newFiles.push(relativePath);
    } else if (sourceHash !== manifestHash) {
      // 文件已变化，检查用户是否修改过
      if (fs.existsSync(targetPath) && !force) {
        const currentHash = await computeSHA256(targetPath);
        if (currentHash !== manifestHash) {
          // 用户修改过此文件
          console.log(`  ⚠️ [已修改] ${relativePath} — 用户已修改，使用 --force 覆盖`);
          ops.push({ type: "跳过", path: relativePath, reason: "用户已修改" });
          continue;
        }
      }
      const op = deployFile(sourceDir, target, relativePath, dryRun);
      ops.push(op);
      logOperation(op);
      updatedFiles.push(relativePath);
    } else {
      // 校验和相同，跳过
    }
  }

  // 删除清单中有但源目录已移除的文件
  for (const manifestPath of Object.keys(manifest.files)) {
    if (!FILE_REGISTRY.includes(manifestPath)) {
      const op = removeFile(target, manifestPath, dryRun);
      ops.push(op);
      logOperation(op);
      if (op.type === "删除") removedFiles.push(manifestPath);
    }
  }

  // 合并配置
  console.log("");
  console.log("  🔀 [合并] opencode.json");
  if (!dryRun) mergeOpenCodeJson(target, sourceDir, "add");

  console.log("  🔀 [合并] package.json");
  if (!dryRun) mergePackageJson(target, sourceDir, "add");

  // 更新清单
  if (!dryRun) {
    const allDeployed = FILE_REGISTRY.filter((f) =>
      fs.existsSync(path.join(target, f))
    );
    const newManifest = await buildManifest(sourceDir, target, allDeployed);
    writeManifest(target, newManifest);
  }

  // 摘要
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ 升级完成: ${newFiles.length} 新增, ${updatedFiles.length} 更新, ${removedFiles.length} 删除`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 自动依赖安装
  if (!dryRun && !skipDeps) {
    runDepsInstall(target);
  }
}

/** uninstall 子命令 */
async function cmdUninstall(opts: CLIOptions): Promise<void> {
  const { target, purge, dryRun } = opts;

  // 检查是否已安装
  const manifest = readManifest(target);
  if (!manifest) {
    console.error(`❌ 错误: SpecForge 未安装`);
    console.error(`   建议: 目标目录中未找到清单文件`);
    process.exit(1);
  }

  console.log(dryRun ? "🔍 [DRY-RUN] 模拟卸载..." : "🗑️ 正在卸载 SpecForge...");
  console.log(`   版本: v${manifest.version}`);
  console.log("");

  const ops: FileOperation[] = [];

  // 删除清单中的所有文件
  for (const relativePath of Object.keys(manifest.files)) {
    const op = removeFile(target, relativePath, dryRun);
    ops.push(op);
    logOperation(op);
  }

  // 从 opencode.json 移除 sf-* agent
  console.log("");
  console.log("  🔀 [合并] opencode.json — 移除 sf-* agents");
  if (!dryRun) {
    mergeOpenCodeJson(target, manifest.source_dir, "remove");
  }

  // 从 package.json 移除 SF devDependencies
  console.log("  🔀 [合并] package.json — 移除 SF devDependencies");
  if (!dryRun) {
    mergePackageJson(target, manifest.source_dir, "remove");
  }

  // 删除空目录
  const sfDirs = [
    ".opencode/agents",
    ".opencode/tools/lib",
    ".opencode/tools",
    ".opencode/plugins",
    ".opencode/skills/sf-workflow-feature-spec",
    ".opencode/skills/sf-workflow-bugfix-spec",
    ".opencode/skills/sf-workflow-design-first",
    ".opencode/skills/sf-workflow-quick-change",
    ".opencode/skills/superpowers-brainstorming",
    ".opencode/skills/superpowers-code-review",
    ".opencode/skills/superpowers-subagent-driven-development",
    ".opencode/skills/superpowers-systematic-debugging",
    ".opencode/skills/superpowers-tdd",
    ".opencode/skills/superpowers-verification-before-completion",
    ".opencode/skills/superpowers-writing-plans",
    ".opencode/skills",
    ".opencode",
    "specforge/agents/contracts",
    "specforge/agents",
    "specforge/config",
  ];

  console.log("");
  const dirOps = removeEmptyDirs(target, sfDirs, dryRun);
  for (const op of dirOps) {
    logOperation(op);
    ops.push(op);
  }

  // --purge: 删除运行时数据
  if (purge) {
    console.log("");
    console.log("  🗑️ [PURGE] 删除运行时数据...");
    const allSpecforgeDirs = [
      ...RUNTIME_DIRS,
      "specforge/runtime",
      "specforge",
    ];
    for (const dir of allSpecforgeDirs) {
      const fullPath = path.join(target, dir);
      if (fs.existsSync(fullPath)) {
        if (!dryRun) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
        ops.push({ type: "删除", path: dir });
        logOperation({ type: "删除", path: dir });
      }
    }
  }

  // 删除清单文件本身
  if (!dryRun) {
    const manifestPath = path.join(target, "specforge", "manifest.json");
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
    }
  }

  // 摘要
  const deleted = ops.filter((o) => o.type === "删除").length;
  const skipped = ops.filter((o) => o.type === "跳过").length;

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ 卸载完成: ${deleted} 删除, ${skipped} 跳过`);
  if (!purge) {
    console.log("   运行时数据已保留。使用 --purge 完全删除。");
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

/** verify 子命令 */
async function cmdVerify(opts: CLIOptions): Promise<void> {
  const { target } = opts;

  const manifest = readManifest(target);
  if (!manifest) {
    console.error(`❌ 错误: SpecForge 未安装`);
    console.error(`   建议: 目标目录中未找到清单文件`);
    process.exit(1);
  }

  console.log(`🔍 正在校验 SpecForge 安装完整性...`);
  console.log(`   版本: v${manifest.version}`);
  console.log(`   安装时间: ${manifest.installed_at}`);
  console.log("");

  const intact: string[] = [];
  const modified: string[] = [];
  const missing: string[] = [];

  for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
    const fullPath = path.join(target, relativePath);

    if (!fs.existsSync(fullPath)) {
      missing.push(relativePath);
      console.log(`  ❌ [缺失] ${relativePath}`);
    } else {
      const actualHash = await computeSHA256(fullPath);
      if (actualHash === expectedHash) {
        intact.push(relativePath);
      } else {
        modified.push(relativePath);
        console.log(`  ⚠️ [已修改] ${relativePath}`);
      }
    }
  }

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (modified.length === 0 && missing.length === 0) {
    console.log(`✅ 安装完整: ${intact.length} 个文件全部通过校验`);
  } else {
    console.log(`⚠️ 发现问题: ${intact.length} 完整, ${modified.length} 已修改, ${missing.length} 缺失`);
    console.log("");
    console.log("   建议: 运行 `bun scripts/sf-installer.ts upgrade --force` 恢复文件到预期状态");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (modified.length > 0 || missing.length > 0) {
    process.exit(1);
  }
}

// ============================================================================
// DD-8: 依赖管理集成
// ============================================================================

/** 检查 bun 是否可用 */
function isBunAvailable(): boolean {
  try {
    const result = Bun.spawnSync(["bun", "--version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/** 执行 bun install */
function runBunInstall(targetDir: string): { success: boolean; output: string } {
  try {
    const result = Bun.spawnSync(["bun", "install"], {
      cwd: targetDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = result.stdout.toString() + result.stderr.toString();
    return { success: result.exitCode === 0, output };
  } catch (e: any) {
    return { success: false, output: e.message };
  }
}

/** 运行依赖安装 */
function runDepsInstall(targetDir: string): void {
  console.log("");
  if (isBunAvailable()) {
    console.log("📦 正在执行 bun install...");
    const result = runBunInstall(targetDir);
    if (result.success) {
      console.log("  ✅ 依赖安装完成");
    } else {
      console.log("  ⚠️ 依赖安装失败，请手动运行 `bun install`");
    }
  } else {
    console.log("💡 提示: 请手动运行 `bun install` 安装依赖");
  }
}

// ============================================================================
// 主入口
// ============================================================================

async function main(): Promise<void> {
  // 获取源目录（安装器所在目录的父目录）
  const scriptDir = path.dirname(path.resolve(process.argv[1] || __filename));
  const sourceDir = path.dirname(scriptDir);

  // 解析参数（跳过 bun 和脚本路径）
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  // --version 处理
  if (opts.showVersion) {
    showVersion(opts.target);
    process.exit(0);
  }

  // 无子命令时显示用法
  if (!opts.subcommand) {
    showUsage();
    process.exit(0);
  }

  // 路由到对应子命令
  try {
    switch (opts.subcommand) {
      case "install":
        await cmdInstall(opts, sourceDir);
        break;
      case "upgrade":
        await cmdUpgrade(opts, sourceDir);
        break;
      case "uninstall":
        await cmdUninstall(opts);
        break;
      case "verify":
        await cmdVerify(opts);
        break;
    }
  } catch (e: any) {
    console.error(`❌ 错误: ${e.message}`);
    if (e.path) console.error(`   路径: ${e.path}`);
    console.error(`   建议: 检查文件权限和路径是否正确`);
    process.exit(1);
  }
}

// 导出供测试使用
export {
  computeSHA256,
  readManifest,
  writeManifest,
  buildManifest,
  getSourceVersion,
  parseArgs,
  showUsage,
  showVersion,
  isSpecForgeFile,
  detectConflicts,
  checkOpenCodeJsonConflicts,
  mergeOpenCodeJson,
  mergePackageJson,
  deployFile,
  removeFile,
  removeEmptyDirs,
  logOperation,
  isBunAvailable,
  runBunInstall,
  FILE_REGISTRY,
  MERGE_FILES,
  RUNTIME_DIRS,
};

export type { CLIOptions, ManifestFile, ConflictReport, FileOperation, OpType };

// 执行主函数（仅在直接运行时，不在测试导入时）
const isMainModule =
  typeof Bun !== "undefined" &&
  Bun.main !== undefined &&
  import.meta.path === Bun.main;

if (isMainModule) {
  main();
}
