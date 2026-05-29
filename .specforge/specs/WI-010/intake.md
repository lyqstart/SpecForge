# WI-010 Intake — SpecForge V6 目录结构治理 P0

**工作流类型**：refactor
**创建日期**：2026-05-29
**输入文档**：`docs/proposals/2026-05-29-directory-structure-governance.md`（方案 A）

---

## 1. 重构的目标和动机

### 1.1 现状问题（已实证）

SpecForge V6 项目存在**系统性目录路径混乱**，根因有 4 条：

| 编号 | 根因 | 实证来源 |
|------|------|----------|
| R1 | 架构决策与文档不同步 | ADR-006 明确选 `.specforge/`（带点），但 README、AGENTS.md、8 个 SKILL.md、4 个 Agent prompt 全部写 `specforge/`（不带点） |
| R2 | 代码内部三方约定不一致 | WI-004 impact_analysis.md：daemon-core 用 `.specforge/`；部署态 tools 用 `specforge/`；Agent prompt 用 `specforge/`，影响 40+ 文件 |
| R3 | 仓库自身的开发目录与"用户项目目录"语义混淆 | 仓库根同时存在 `.specforge/`（committed）和 `specforge/`（gitignored 但实际跑数据） |
| R4 | 没有任何编译/运行期约束 | 路径全部是源码里的硬编码字符串字面量，无法在编译期或 PR 期被拦截 |

### 1.2 实证案例（本次会话直接暴露）

在 2026-05-29 的诊断会话中，仅"确认 daemon 是否健康"这一基础问题，sf-orchestrator 走了 **6 轮对话弯路**：

1. 误判 plugin 需要外部依赖 → 让用户加错 file: 依赖触发 workspace 解析失败
2. 误判 `plugin_loaded.txt` 是当前 plugin 写的（实际是旧版残留）
3. 在 `specforge/logs/trace.jsonl`（不带点）找今天的日志 → 实际 daemon 写到 `~/.specforge/runtime/events.jsonl`

最终确认：**系统其实一直正常**，所有诊断弯路都源于"多套路径并存 + 文档与代码不一致"。普通用户根本无法自助排查。

### 1.3 P0 阶段目标

建立**单一真相源（Single Source of Truth）的基础设施**，为 P1 全量切换和 P2 强制约束打地基。本阶段**只新增不修改**现有路径，风险最低。

---

## 2. 涉及的代码范围

P0 阶段的代码变更**仅限新增**，不触动现有路径硬编码：

### 2.1 新增文件清单

| 文件 | 角色 | 预估行数 |
|------|------|----------|
| `packages/types/src/directory-layout.ts` | 唯一路径常量源（权威 Schema） | ~150 行 |
| `packages/types/src/meta-schema.ts` | `_meta.json` 的 zod schema | ~80 行 |
| `packages/types/tests/directory-layout.test.ts` | 单元测试覆盖所有 LAYOUT key | ~120 行 |
| `packages/types/tests/meta-schema.test.ts` | meta-schema 测试 | ~60 行 |
| `scripts/migrations/v6-dir-rename.ts` | 数据迁移脚本：`specforge/` → `.specforge/` | ~200 行 |
| `scripts/migrations/v6-dir-backup.ts` | 迁移前自动备份机制 | ~100 行 |
| `docs/adr/ADR-006-specforge-dir-naming.md` | 补录 ADR-006（关联本提案） | ~50 行 |

**总计**：约 760 行新增代码，零行修改。

### 2.2 现有代码影响面

P0 阶段**不修改**以下代码（留给 P1）：

- daemon-core 12 个 core 文件中的 `join(baseDir, ".specforge", ...)` 调用
- `.opencode/tools/lib/*` 中的 `specforge/` 路径
- 8 个 SKILL.md + 4 个 Agent prompt 中的路径引用
- sf-installer.ts 的源目录读取逻辑

### 2.3 输入文档

- 主输入：`docs/proposals/2026-05-29-directory-structure-governance.md` §6（Schema 设计）+ §9 Phase P0
- 关联：`docs/proposals/2026-05-29-engineering-playbook-framework.md`（方案 B，P0 不涉及）

---

## 3. 不变行为的边界（关键）

P0 阶段是**纯新增**，必须严格保证以下行为零变化：

### 3.1 用户可见行为

- ✅ daemon 启动行为不变（端口、handshake 写入位置不变）
- ✅ Plugin 加载行为不变
- ✅ 所有现有工作流（feature_spec / bugfix_spec / refactor / investigation 等）能正常执行
- ✅ 所有现有 Work Item 的状态机和 Gate 行为不变
- ✅ 用户项目首次初始化的目录结构不变（仍按现状创建）
- ✅ 现有 `.specforge/` 和 `specforge/` 双目录并存现状不被破坏

### 3.2 代码层不变接口

- ✅ daemon-core 所有公共 API 签名不变
- ✅ PersonalPathResolver / EnterprisePathResolver 接口不变
- ✅ 所有 sf_* tool 的输入/输出 schema 不变
- ✅ sf-installer.ts 的 install/upgrade/verify/uninstall 命令行为不变

### 3.3 测试基线

- ✅ 现有所有 unit / integration / property test 必须继续通过
- ✅ 新增测试只覆盖新增模块，不修改已有测试

### 3.4 配置文件不动

- ✅ `package.json`（根 + 各 package）的 dependencies 不变（types 包除外，新增 zod 依赖）
- ✅ `tsconfig.json` 不变（types 包除外，必要时新增 export）
- ✅ `vitest.config.ts` 不变

### 3.5 数据兼容性

- ✅ 迁移脚本（T4 / T5）**只生成代码，P0 阶段不执行**
- ✅ 备份机制必须可逆（设计层面保证 `~/.specforge/backups/<ts>/` 完整快照）
- ✅ 任何对现有数据的操作必须先备份

---

## 4. 风险评估初判

| 维度 | 评估 |
|------|------|
| 代码风险 | **低** —— 纯新增，无修改现有路径 |
| 数据风险 | **低** —— 迁移脚本不执行，仅准备 |
| 接口风险 | **低** —— 不改任何公共 API |
| 测试风险 | **极低** —— 新增测试，不动现有 |
| 回滚成本 | **极低** —— 删除新增文件即可 |

**最终风险路径预判**：`risk_path = low`（refactor 工作流允许 development → verification 直跳，不经 review）

正式判定由 refactor_plan_gate 完成。

---

## 5. 验收标准（出 P0 必须满足）

- [ ] `packages/types/src/directory-layout.ts` 存在，导出 `LAYOUT` 常量、`resolveProjectPath` 函数、`specPath` 函数、`agentRunArchivePath` 函数
- [ ] `packages/types/src/meta-schema.ts` 存在，导出 zod schema
- [ ] 单元测试覆盖所有 LAYOUT key（每个 key 至少 1 个 assertion）
- [ ] `scripts/migrations/v6-dir-rename.ts` 存在且通过 dry-run 测试
- [ ] `scripts/migrations/v6-dir-backup.ts` 存在，可独立执行备份
- [ ] `docs/adr/ADR-006-specforge-dir-naming.md` 存在，含 Context / Decision / Consequences / Status 标准段
- [ ] `bun run test packages/types/tests/directory-layout.test.ts` 通过
- [ ] `bun run test packages/types/tests/meta-schema.test.ts` 通过
- [ ] 整个仓库的现有测试套件继续全部通过

---

## 6. 下一阶段输入

进入 `refactor_analysis` 阶段后，sf-design Agent 需要：
- 阅读本 intake.md
- 阅读 `docs/proposals/2026-05-29-directory-structure-governance.md` 全文
- 重点参考 §6（Schema 设计）的接口定义
- 产出 `refactor_analysis.md`，重点完善"代码问题识别"和"不变行为声明"两段
