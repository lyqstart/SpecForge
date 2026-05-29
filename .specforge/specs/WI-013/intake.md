# Intake — WI-013 Refactor：目录治理"零真残留"收尾

## 背景

已完成 `docs/audit/2026-05-29-directory-governance-final-audit.md` 验收。
本次修复关闭验收报告中的 #1~#7、#8 共七个问题。
#3（lint 加固）和 #9（verifier 制度）由后续 P4 处理，本次不动。

## 重构目标

将 SpecForge 项目中所有遗漏的裸 `specforge/` 路径（无点前缀）修正为 `.specforge/`，
确保目录治理达到"零真残留"：daemon 启动后不会自动创建不带点的 `specforge/` 目录。

## 重构范围（严格限定，不允许扩散）

### R1：constants.ts 配置目录常量补点
- 文件：`packages/configuration/src/constants.ts`
- 行号：第 70 行
- `project: 'specforge/config'` → 使用 `SPEC_DIR_NAME` 常量拼接

### R2：fs-path-rules.ts 允许目录补点
- 文件：`packages/plugin-loader/src/static-checker/fs-path-rules.ts`
- 行号：第 818 行
- `allowedDirs: ['~/.specforge/config', 'specforge/config']` → 第二项加 `.specforge/config`（或常量）

### R3：sf-knowledge.md 路径补点
- 文件：`setup/userlevel-opencode/agents/sf-knowledge.md`
- 行号：第 78 行
- `specforge/archive/agent_runs/` → `.specforge/archive/agent_runs/`

### R4：sf-orchestrator.md 路径补点
- 文件：`setup/userlevel-opencode/agents/sf-orchestrator.md`
- 行号：第 82 行
- `specforge/runtime/checkpoints/` → `.specforge/runtime/checkpoints/`

### R5：定位并修复 `specforge/observability/events.jsonl` 的写入者（最关键）
- 根因调查：找出谁在写 `specforge/observability/events.jsonl`
- 修复：切换到 LAYOUT 常量
- 验证：删目录后跑 daemon 5 分钟确认不再创建

### R6：sf_doctor 自身路径常量切换
- 文件：`packages/daemon-core/src/tools/lib/sf_doctor_core.ts`
- doctor 检查路径改用 `path.join(projectRoot, SPEC_DIR_NAME, LAYOUT.xxx)` 常量

### R7：清理 `.specforge-/` 备份目录
- 删除 `D:\code\temp\SpecForge\.specforge-`（含完整 cas/ + observability/）
- 前置：git status 确认不在 tracking → 备份到 `.tmp/` → 用户二次确认 → 删除

### R8：补 WI-012 _meta.json
- `.specforge/specs/WI-012/_meta.json` 不存在
- 参考 WI-010/WI-011 模板，从 WI-012 的 spec 文件摘取信息，用 Schema 校验后写入

## 明确排除（不在本 WI 范围）

- ❌ 不碰 `scripts/lint/check-hardcoded-paths.ts` 正则
- ❌ 不扩展 lint 到 `.md`
- ❌ 不修改 README/AGENTS.md 加 marker
- ❌ 不修任何其它 pre-existing test 失败
- ❌ 不重命名 `specforge/observability/events.jsonl`，只删除

## 不变行为声明

- 所有现有测试必须继续通过
- daemon 启动/运行行为不变（只是路径从无点变带点）
- 不改变任何公共 API 接口
- sf_doctor 功能不变，只改内部路径常量
- sf-installer verify 必须通过

## 技术约束

- 路径常量必须使用 `SPEC_DIR_NAME` 或 `LAYOUT.xxx`，禁止新增 `.specforge/` 字面量
- 所有 shell 命令必须用 `sf_safe_bash`
- R5 和 R7 是高风险操作，需要风险评估
