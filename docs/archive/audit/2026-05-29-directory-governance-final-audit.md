# SpecForge V6 目录结构治理 — 最终验收报告

**验收日期**：2026-05-29
**验收人**：sf-orchestrator（独立第三方会话，不依赖 P0/P1/P2 任何会话上下文）
**WI 范围**：WI-010 (P0) + WI-011 (P1) + WI-012 (P2)
**方法**：基于 `docs/proposals/handoff-final-verification.md` 检查清单，全部使用 sf_safe_bash 实测

---

## 总体结论

**conclusion = partial-pass**

| 指标 | 数值 |
|---|---|
| 总检查项 | 35 |
| 通过 (pass) | 21 |
| 失败 (fail) | 9 |
| 警告 / 数据不全 (warning) | 5 |

**核心判断**：A / C / D 三类基本到位（架构基础和文档完备），但 **B 类（代码全量切换）存在多处真实的硬编码路径遗漏**，最严重的是仍在运行期写入老路径 `specforge/observability/events.jsonl`。这与 WI-011 自身的"零残留"结论直接冲突。**不建议直接进入方案 B**，需先关闭 B 类残留。

---

## 类别 A：Schema 与决策档案

| 项 | 状态 | 证据 |
|---|---|---|
| A1 | pass | `packages/types/src/directory-layout.ts` 存在；导出 `SPEC_DIR_NAME='.specforge'`、`LAYOUT`（含 configFiles 嵌套）、`resolveProjectPath()`、`specPath()`、`agentRunArchivePath()`、`LayoutKey` 类型 |
| A2 | pass | `packages/types/src/meta-schema.ts` 存在；line 137 导出 `WorkItemMetaSchema = z.object(...)`；line 160 导出 `WorkItemMeta = z.infer<typeof WorkItemMetaSchema>` |
| A3 | pass | `docs/adr/ADR-006-specforge-dir-naming.md` 4 段标准结构完整：Status (L3) / Context (L14) / Decision (L35) / Consequences (L66) |
| A4 | pass | `scripts/migrations/v6-dir-rename.ts` 和 `v6-dir-backup.ts` 均存在 |
| A5 | pass | `bun test packages/types/tests/` → **74 pass / 0 fail / 203 expect() calls**（实际比 handoff 要求的 58 还多 16 个，质量提升） |
| A6 | pass | `bun run tsc --noEmit -p packages/types` → exit 0，无类型错误 |

**A 类小结**：6/6 全 pass，Schema 与决策档案基础非常扎实，是本治理项目最稳的部分。

---

## 类别 B：代码全量切换

| 项 | 状态 | 证据 |
|---|---|---|
| B1 | **partial-fail** | daemon-core 内部 `tools/lib/*.ts` 中的 `.specforge` 全部位于注释或描述字符串中（pass）；但 daemon-core 通过依赖链调用的 `packages/configuration/src/constants.ts:70` 和 `packages/plugin-loader/src/static-checker/fs-path-rules.ts:818` 仍然存在不带点的真实路径常量 |
| B2 | n/a → 重定向到 setup/ | `.opencode/` 目录在仓库根**完全不存在**（已迁移到 `setup/userlevel-opencode/`），原 B2 检查目标失效；按 setup/ 重新扫描，未发现 `'specforge/'` 字面量裸路径（仅 markdown 中的描述性文本） |
| B3 | pass | `setup/userlevel-opencode/skills/**/SKILL.md` 8 个文件均未发现 `specforge/specs/`（不带点）路径 |
| B4 | **fail** | 2 个 Agent prompt 仍残留不带点的 `specforge/`：<br>• `setup/userlevel-opencode/agents/sf-knowledge.md:78` — `"retro_report_path": "specforge/archive/agent_runs/<run_id>/retro_report.md"`<br>• `setup/userlevel-opencode/agents/sf-orchestrator.md:82` — `"读取最新 checkpoint recovery 文件（specforge/runtime/checkpoints/*.recovery.md）"` |
| B5 | **fail** | `packages/permission-engine/src/` 内"specforge/"出现行均为 `@specforge/...` 包名（pass）；但全包依赖的 `packages/plugin-loader/src/static-checker/fs-path-rules.ts:818` 的 `allowedDirs: ['~/.specforge/config', 'specforge/config']` 中第二项仍为不带点路径 |
| B6 | pass | `setup/userlevel-opencode/`、`setup/userlevel-scripts-lib/`、`setup/userlevel-templates/` 均存在 |
| B7 | pass | `scripts/sf-installer.ts` 9 处 `path.join(sourceDir, ...)` 全部使用 `"setup"` 而非 `".opencode"` |
| B8 | pass | `scripts/render-layout.ts` 存在 |
| B9 | **fail** | `Select-String -Path README.md, AGENTS.md -Pattern "BEGIN: directory-layout"` 返回空集合；README.md 顶部确实有 docs/conventions 入口指引（D5 通过），但**生成器标记 `<!-- BEGIN: directory-layout -->` 缺失**，意味着若改 schema 后用 `render-layout.ts` 重写时找不到注入点 |
| B10 | pass | `.specforge/specs/README.md` 存在；含 `WI-001` `WI-010` `WI-011` `WI-012` 共 4 处匹配 |
| B11 | **FAIL（严重）** | `specforge/`（不带点）目录仍然存在，且 `specforge/observability/events.jsonl` 于 **2026-05-29 8:38:02**（验收会话期间）被新写入 2560 bytes —— 这意味着**仍有运行时代码路径在写老目录**。`.specforge/observability/events.jsonl` 也存在（4:52:28），新事件却没全部落到带点路径 |
| B12 | **partial-fail** | `.opencode-/` 和 `opencode.json` 均不存在（pass）；但根目录存在 `.specforge-/` 备份目录（包含完整 cas/ + observability/ 子目录、含大量 CAS blob 文件，单文件 >1MB），属于迁移备份残留 |

**B 类小结**：3 个真实硬编码遗漏（constants.ts、fs-path-rules.ts、2 个 Agent prompt）+ 1 个活跃的运行期老路径写入 + 1 个缺失的文档注入点 + 1 个备份目录残留。**B 类是本治理项目最薄弱环节**。

---

## 类别 C：强制约束

| 项 | 状态 | 证据 |
|---|---|---|
| C1 | pass | `scripts/lint/check-hardcoded-paths.ts` 存在（289 行，配套 `.lintrc-layout.json` 白名单） |
| C2 | **partial-fail** | `bun run scripts/lint/check-hardcoded-paths.ts` exit 0、报 0 violations；但**实际人工已发现至少 4 处真违规**（见 B1/B4/B5）。原因分析：<br>1. **正则缺陷**：模式 2 `/['"]specforge\/['"]/g` 要求 `/` 后紧跟引号，因此 `'specforge/config'`（带 subpath）不会被命中<br>2. **覆盖缺陷**：`collectTsFiles` 只扫 `.ts`，**完全跳过 .md 文件**，所以 Agent prompt 中的路径泄漏永远抓不到<br>3. **白名单**自身合理，问题不在白名单 |
| C3 | pass | `tests/architecture/directory-layout.test.ts` 存在 |
| C4 | pass | `bun test tests/architecture/` → **28 pass / 0 fail / 175 expect() calls** |
| C5 | pass | 在 `.tmp/lint-trigger-test.ts` 写入 `const x = '.specforge/runtime/state.json'`，跑 lint → 正确报 1 violation、exit 1；立即清理临时文件，仓库无污染 |

**C 类小结**：架构测试和"故意触发"机制都到位，但**lint 工具本身存在显著盲区**——既看不到带 subpath 的 `'specforge/xxx'`，也看不到 `.md` 文件。这意味着 CI 防线虚胖，B 类残留之所以滑过去不是偶然。

---

## 类别 D：文档

| 项 | 状态 | 证据 |
|---|---|---|
| D1 | pass | `docs/conventions/README.md` 存在 |
| D2 | pass | `docs/conventions/directory-layout.md` 存在 |
| D3 | pass | `docs/conventions/wi-lifecycle.md` 存在 |
| D4 | pass | `docs/conventions/glossary.md` 存在 |
| D5 | pass | README.md 顶部 9-12 行明确含 `docs/conventions/README.md` 和 `docs/conventions/directory-layout.md` 入口链接 |

**D 类小结**：5/5 全 pass，治理文档体系完备。

---

## 类别 E：行为不变性

| 项 | 状态 | 证据 |
|---|---|---|
| E1 | pass（with caveat） | `sf_doctor` → `daemon_components` 全部 ok（stateManager / workflowEngine / eventBus / eventLogger / permissionEngine）；但 installation 检查报错——sf_doctor 内部仍检查 `specforge/runtime/state.json`（不带点）和 `specforge/config/project.json`（不带点），路径不存在 → 报 error。这意味着 **doctor 工具自身的路径常量也没切换干净**（与 B 类问题一脉相承） |
| E2 | **inconclusive** | `bun test` 全量回归未能完整跑完——日志增长到 6052 行后停止（最后一条 pass 是 `Help Command Integration > should handle --help flag`），无 `Ran N tests` 总结行，bun 进程被 daemon 心跳超时间接中断。已观测 **1168 pass / 341 fail**（部分数据）。失败 top 类目：Tool HTTP Shell Validation(72)、readAndValidateManifest(22)、scope_consistency_checker(17)、Skill Autoload(15) 等。**无 baseline 可直接比对**，不能断言是否引入新失败。建议在干净 CI 环境重跑 |
| E3 | pass | `bun scripts/sf-installer.ts verify` → "✓ 校验通过（X 个文件完整）"，exit 0 |
| E4 | **skipped** | 验收员主动跳过——创建测试 WI 会写入 state.json + 触发 KG/knowledge 落档，会污染验收环境且引入与 P0/P1/P2 范围无关的运行时副作用。建议由用户在生产环境另行验证 |

**E 类小结**：daemon 基本可用、sf-installer verify 通过，但**全量回归数据残缺**且 doctor 自身还有路径切换尾巴。

---

## 类别 F：知识沉淀

| 项 | 状态 | 证据 |
|---|---|---|
| F1 | pass | 3 个 verification_report.md 全部存在且结论均标注 PASS：<br>• WI-010：`**最终结论**: **PASS** ✅`<br>• WI-011：`**最终结论**: **PASS** ✅`（但参见下文"发现的问题 #1"——其"零残留 observability/events.jsonl"声明与实测冲突）<br>• WI-012：`结论 \| pass` |
| F2 | **partial-fail** | `.specforge/specs/WI-010/_meta.json` exists；`.specforge/specs/WI-011/_meta.json` exists；**`.specforge/specs/WI-012/_meta.json` MISSING** |
| F3 | **fail** | `~/.specforge/knowledge/` 不存在；`.specforge/knowledge/graph.json` 文件存在（66 KB），但 `sf_knowledge_query(get_overview)` 返回 `total_nodes=0, total_edges=0, work_items=[]`——KG 索引为空，或者 graph.json 与 daemon 查询路径不一致 |

**F 类小结**：自洽性最差的一类。本来应该 completed 后自动触发 sf-knowledge 沉淀，但 WI-012 的 _meta.json 都没生成、KG 也是空的。

---

## 发现的问题（按严重度排序）

### 🔴 #1 — 运行时仍在写老路径 `specforge/observability/events.jsonl`
- **严重度**：high
- **描述**：仓库根存在 `specforge/observability/events.jsonl`，文件 mtime = 2026-05-29 8:38:02（验收会话期间），说明仍有活跃代码路径写到不带点的老目录。这与 WI-011 verification_report.md 中"permission-engine 路径切换 ✅ pass | 7 文件，**零残留 observability/events.jsonl**"的声明直接冲突
- **影响范围**：observability 事件可能在新旧两个目录之间分裂，导致下游分析、CAS、replay 等环节数据不完整；CI 也会因为目录残留检查项失败
- **建议处理**：开新 WI（建议 refactor 工作流），用 `sf_safe_bash` + grep 全包定位实际写入者（猜测在某个 EventLogger 工厂函数中），切换到 `LAYOUT.observability` / `LAYOUT.archive` 之类常量后再删除 `specforge/observability/`

### 🔴 #2 — 真实硬编码路径常量未切换（lint 没抓到）
- **严重度**：high
- **描述**：
  1. `packages/configuration/src/constants.ts:70` — `CONFIG_DIRS.project = 'specforge/config'`（应为 `.specforge/config`，与 user 那一项形成不对称）
  2. `packages/plugin-loader/src/static-checker/fs-path-rules.ts:818` — `allowedDirs: ['~/.specforge/config', 'specforge/config']`（第二项漏点）
- **影响范围**：配置加载层和插件静态检查器会在错误目录寻找配置文件，导致部分场景退化或误报合规
- **建议处理**：开新 WI 替换为 `path.join(SPEC_DIR_NAME, LAYOUT.configFiles.* ...)`；同时修复 lint 正则

### 🔴 #3 — Lint 工具有显著覆盖盲区
- **严重度**：high
- **描述**：`scripts/lint/check-hardcoded-paths.ts` 报 0 违规，但实际多处真违规未被检出：
  - **正则盲区**：模式 2 `/['"]specforge\/['"]/g` 要求 `/` 后紧跟引号，因此 `'specforge/config'`、`'specforge/runtime/state.json'` 等带 subpath 的字面量 100% 漏检
  - **文件类型盲区**：`collectTsFiles` 只扫 `.ts`，完全跳过 `.md`，所以 Agent prompt、SKILL.md、docs/ 里的路径污染永远不会被检测
- **影响范围**：C 类"强制约束"防线虚胖，B 类残留之所以漏出来是必然结果
- **建议处理**：开新 WI 修复正则（改为 `/['"]specforge\/[^'"]*['"]/g`）并把 `.md` 加入扫描扩展名（带白名单）

### 🟡 #4 — Agent prompt 路径残留
- **严重度**：medium
- **描述**：
  - `setup/userlevel-opencode/agents/sf-knowledge.md:78` — retro_report_path 模板用了 `specforge/...`
  - `setup/userlevel-opencode/agents/sf-orchestrator.md:82` — 描述 checkpoint 路径时用了 `specforge/runtime/checkpoints/...`
- **影响范围**：Agent 读取这些 prompt 后可能按老路径找文件，导致 Knowledge / Checkpoint 流程出错。运行期影响取决于 prompt 中这段文字是否被 LLM 取作字面路径
- **建议处理**：开新 WI 把这两个文件里的 `specforge/` 改成 `.specforge/`，同时把 lint 扩展到 `.md`（与 #3 联动）

### 🟡 #5 — `.specforge-/` 备份目录残留
- **严重度**：medium
- **描述**：仓库根存在 `.specforge-/`，是迁移备份目录，包含完整 `cas/`（含 18 个 hash bucket、多个 1MB+ 大文件）和 `observability/`。占空间且与 `.specforge/` 同名混淆，且会被许多通配符脚本误扫
- **影响范围**：存储空间浪费；如果 git 没正确忽略，可能误提交备份；CI / lint 扫描可能误报路径
- **建议处理**：确认数据已迁移后用 cleanup 脚本删除（建议保留至少 1 个 git stash 作为最终兜底）

### 🟡 #6 — README/AGENTS.md 缺少 directory-layout 注入 marker
- **严重度**：medium
- **描述**：`scripts/render-layout.ts` 设计为通过 `<!-- BEGIN: directory-layout -->` / `<!-- END: directory-layout -->` marker 把当前布局自动写入文档，但 README.md 和 AGENTS.md 中均未找到这两个 marker
- **影响范围**：未来改 Schema 时 render-layout.ts 找不到注入点，导致目录约定文档脱离 Schema 真相源
- **建议处理**：在 README.md（或更合适的 docs/conventions/directory-layout.md）中加 marker 对，并把 render-layout.ts 在 CI 中作为"生成-验证"步骤

### 🟡 #7 — sf_doctor 自身路径未切换
- **严重度**：medium
- **描述**：doctor 检查项命名为 `项目运行时: specforge/runtime/state.json`、`项目运行时: specforge/config/project.json`（均无点），实际项目用的是 `.specforge/runtime/state.json` 等。doctor 因此**永远会对一个已经正确迁移的项目报告 installation = error**
- **影响范围**：用户首次跑 doctor 会得到误导性"项目未初始化"红色报告；CI 的 doctor 检查会假阳性失败
- **建议处理**：把 doctor 检查清单中的路径常量替换为 LAYOUT 引用

### 🟡 #8 — WI-012 缺少 _meta.json，KG 为空
- **严重度**：medium
- **描述**：
  - `.specforge/specs/WI-012/_meta.json` 不存在（WI-010/WI-011 都有）
  - `sf_knowledge_query(get_overview)` 返回 `total_nodes=0`，graph.json 文件 66KB 看似有数据但被解析为空
- **影响范围**：知识沉淀阶段对 WI-012 没有正确收尾；下游 KG 查询、归档统计都会缺这部分
- **建议处理**：手动补 _meta.json 或重跑 sf-knowledge for WI-012；排查 daemon 的 KG loader 为何把 graph.json 解析为 0 节点

### 🟢 #9 — WI-011 verification_report 与实测冲突
- **严重度**：low（事后归类问题，非新引入）
- **描述**：WI-011 报告写"permission-engine 路径切换 ✅ pass | 7 文件，零残留 observability/events.jsonl"，但实测发现 `specforge/observability/events.jsonl` 仍在被写入。说明 WI-011 的 sf-verifier 阶段或者没有跑端到端写入测试，或者把"模块内不再硬编码"等价于"运行期不再写老路径"，导致**漏验证**
- **影响范围**：让本治理项目的"零残留"自我宣言失效，是 #1 滑过去的根因
- **建议处理**：在 sf-verifier 的 refactor / change_request 模板中加一条"端到端冒烟检查：把日志/事件目录列文件名 + mtime，确认无新增老路径文件"

---

## 已知 pre-existing 问题（与本治理项目无关，记录留档）

1. **daemon-core SessionRegistry 5 个测试失败**（WI-010 已声明）
2. **permission-engine 3 个测试文件 PermissionDecision 导出缺失**（WI-012 已声明：crash-recovery / e2e-permission-flow / bearer-token-enforcement-property-16）
3. **`tests/integration/service-management/plugin-reconnect-real.test.ts:170` 语法错误**：`"test.event', { value: 42 })` 引号不匹配，导致整文件 unhandled error。与目录治理无关，但建议顺手修一下
4. **CLI 测试中 yargs "version is a reserved word" 警告**：reproducible warning，不影响 pass，但污染 stderr

---

## 治理项目最终评价

| 维度 | 评级 | 理由 |
|---|---|---|
| 设计完整性 | **A** | LAYOUT/SPEC_DIR_NAME schema、ADR-006、迁移脚本、render-layout、架构测试均设计到位，是国内 spec-driven 项目里相当扎实的模板 |
| 实施质量 | **C** | A/C/D 三类基本到位，但 B 类有 3 处真硬编码遗漏 + 1 处活跃运行期老路径写入，再加上 lint 工具自身有盲区——执行层"做了 80% 但说自己做了 100%" |
| 文档完备性 | **A-** | docs/conventions/ 4 件、ADR-006、README 入口链接均到位；扣分点：render-layout marker 缺失、约定文档未与 generator pipeline 闭环 |
| 风险管控 | **B** | 有 backup 脚本（v6-dir-backup）、有架构测试、有故意触发测试机制；但 verifier 把"代码不再硬编码"误同等于"零残留运行期路径"，导致 #1 滑过；备份目录无清理策略 |

---

## 建议下一步

**❌ 不建议**直接进入方案 B（Engineering Playbook 框架）。

**建议路径**：

1. **立即（24h 内）**：开 1 个 refactor WI **完成"零真残留"收尾**
   - 修 constants.ts:70、fs-path-rules.ts:818、sf-knowledge.md:78、sf-orchestrator.md:82
   - 定位并修复 `specforge/observability/events.jsonl` 的实际写入者
   - 清理 `.specforge-/` 备份目录（带 git stash 兜底）
   - 修复 doctor 的路径常量
   - 验证标准：`Test-Path specforge`=false 且 `Test-Path .specforge-`=false 且 doctor 报 healthy

2. **短期（1 周内）**：开 1 个 change_request WI **加固 lint 防线**
   - 修复正则 `/['"]specforge\/[^'"]*['"]/g`
   - 扩展扫描到 `.md`（含白名单：`docs/audit/**`、`.specforge/specs/**` 中的历史文档）
   - 把"端到端文件系统冒烟"加入 sf-verifier 在 refactor / change_request 模板中
   - 在 README.md 加 `<!-- BEGIN: directory-layout -->` marker 并把 render-layout.ts 纳入 CI

3. **中期（与方案 B 同期）**：把 WI-010 → WI-012 的经验沉淀为团队最佳实践
   - 在 CHANGELOG **不要**标"Directory Layout v1.0 Locked"——等 #1~#3 关闭后再 lock
   - 把"verifier 必须做端到端 fs 冒烟"作为通用 lesson 入 superpowers-verification-before-completion
   - 把"lint 正则覆盖 + 文件类型双盲区"作为典型反例

4. **可选**：补做完整 `bun test` 全量回归（在干净 CI 环境），与 P0 前 baseline 比对，确认 E2 是否引入新失败。

---

## 验收员附注

- 本报告所有结论均基于实际命令输出，未使用任何 P0/P1/P2 会话的记忆缓存
- 所有"FAIL"判定均附具体文件路径 + 行号 + 实际内容
- 验收过程对仓库的修改：仅 `.tmp/lint-trigger-test.ts` 临时文件（用于 C5），已删除并确认 `Test-Path` = False
- 验收期间未主动调度子 Agent、未创建 Work Item、未触发 sf_state_transition
- 报告作者：sf-orchestrator（独立验收会话）
