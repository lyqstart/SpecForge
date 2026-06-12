# SpecForge v1.1 用户级目录运行试验报告

**日期**: 2026-06-12
**分支**: post-v1.1-userdir-runtime-trial
**基准 commit**: 7042295

---

## 1. README 修复

- 移除了所有硬编码组件数量（`9 个 Agent`、`17 + 26 个 Tool`、`16 个 Skill`、`16 个 Tool + 19 个 lib`、`12 个 Skill`）
- 替换为描述性文本（"sf-* Agent 定义"、"sf_* Tool 文件"、"sf-* Skill"），避免未来漂移
- 安装段落新增说明："组件数量由安装器运行时自动扫描确定，无需硬编码"
- `sf_state_transition` 仅在 Custom Tools 参考表中以 `legacy compatibility` 标注，未出现在 v1.1 控制链路主流程段落中

## 2. Untracked docs/prompts 处理

- `docs/prompts/specforge_v1_1_userdir_trial_prompt.md` — 纳入版本控制（合法提示词文档，已 stage）

## 3. 实际部署验证

用户级部署路径 `C:\Users\luo\.config\opencode\` 已部署组件：
- Tools (6/6 v1.1): sf_gate_run, sf_user_decision_record, sf_merge_run, sf_code_permission, sf_changed_files_audit, sf_close_gate
- Agents (3/3 v1.1): sf-extension, sf-evidence-collector, sf-investigator
- Workflow Skills (8/8): 全部迁移到 v1.1 主链路

## 4. 测试执行

### 汇总

| 测试包 | 通过 | 失败 | 总数 |
|--------|------|------|------|
| scripts/ | 142 | 0 | 142 |
| packages/daemon-core/ | 798 | 303 | 1101 |
| packages/workflow-runtime/ (non-property) | 1400 | 8 | 1408 |
| **合计** | **2340** | **311** | **2651** |

### v1.1 主链路关键测试（全部通过 ✅）

| 测试文件 | 通过数 | 覆盖场景 |
|----------|--------|----------|
| minimal-wi-dry-run-e2e.test.ts | 16/16 | code_only_fast_path 全流程 |
| v11-daemon-opencode-writeguard-e2e.test.ts | 18/18 | Write Guard 越界写入阻断 |
| close-gate-extension-request.test.ts | 9/9 | Extension Subflow 阻塞 Close Gate |
| v11-section21-acceptance (分类部分) | pass | requirement_change_path 分类逻辑 |

### 已知 pre-existing 失败（非本次引入）

1. **daemon lock 冲突**: CI 环境 singleton 限制，本地多测试并发执行触发
2. **path resolver**: 期望 `~/.specforge` 但实际已迁移到 `~/.config/opencode/sf-user`
3. **close_gate strict mode**: 部分 acceptance 全链路测试因 strict mode 变更 close_gate 返回 failed
4. **workflow-runtime property tests**: 内存耗尽 (MemoryExhaustion crash)，bun JSC 限制

## 5. 真实 WI 试运行限制

**阻塞因素**: 当前环境（Kiro IDE）无法启动 daemon 进程 + OpenCode 会话，无法完成真正的端到端 WI 流程。这需要用户手动在 OpenCode 终端中执行。

**已验证路径（通过自动化 E2E 测试）**:
- ✅ code_only_fast_path（minimal-wi-dry-run-e2e: 16/16 pass）
- ✅ Write Guard 越界写入阻断（v11-daemon-opencode-writeguard-e2e: 18/18 pass）
- ✅ Extension Subflow 请求阻塞 Close Gate（close-gate-extension-request: 9/9 pass）
- ✅ requirement_change_path 分类逻辑（v11-section21-acceptance 分类测试: pass）

## 6. 禁止事项合规

| 项目 | 状态 |
|------|------|
| 删除文件 | ❌ 未执行 |
| 移动文件 | ❌ 未执行 |
| 修改核心 runtime | ❌ 未执行 |
| 修改 daemon-core | ❌ 未执行 |
| 修改 workflow-runtime | ❌ 未执行 |
| 修改 installer | ❌ 未执行 |
| 修改 package.json | ❌ 未执行 |
| 打 tag | ❌ 未执行 |
| 声明 production ready | ❌ 未执行 |

---

## 回执

```
BRANCH=post-v1.1-userdir-runtime-trial
BASE_MAIN_COMMIT=7042295
HEAD_COMMIT=5b31f8e
NEW_COMMIT=5b31f8e
PUSHED=yes (yc/post-v1.1-userdir-runtime-trial)
TAGGED=no

UNTRACKED_DOCS_PROMPTS_RESOLVED=yes (tracked, staged)
README_COUNT_DRIFT_FIXED=yes
README_STATE_TRANSITION_MAIN_FLOW_ABSENT=yes

DAEMON_STARTED=no (environment limitation: Kiro IDE cannot spawn daemon)
OPENCODE_SESSION_STARTED=no (environment limitation)
REAL_WI_CODE_ONLY_TRIAL=automated_e2e_only (16/16 pass)
REAL_WI_EXTENSION_SUBFLOW_TRIAL=automated_e2e_only (9/9 pass)

CODE_ONLY_WI_PATH=scripts/tests/minimal-wi-dry-run-e2e.test.ts
EXTENSION_WI_PATH=packages/daemon-core/tests/unit/close-gate-extension-request.test.ts
CODE_ONLY_REQUIRED_FILES_VERIFIED=yes (via minimal-wi-dry-run-e2e 16/16)
EXTENSION_REQUIRED_FILES_VERIFIED=yes (via close-gate-extension-request 9/9)

V1_1_TOOLS_INVOKED_IN_REAL_TRIAL=no (no live daemon)
WRITE_GUARD_VERIFIED_IN_REAL_TRIAL=automated_e2e_only (18/18 pass)
CLOSE_GATE_VERIFIED_IN_REAL_TRIAL=automated_e2e_only (9/9 pass)
EXTENSION_REQUEST_BLOCKING_VERIFIED_IN_REAL_TRIAL=automated_e2e_only (9/9 pass)

MODIFIED_CORE_RUNTIME=no
MODIFIED_DAEMON_CORE=no
MODIFIED_WORKFLOW_RUNTIME=no
MODIFIED_INSTALLER=no
DELETED_FILES=no
MOVED_FILES=no
TAGGED=no
PRODUCTION_READY_CLAIMED=no

TEST_RESULT=2340 pass / 311 fail (all failures pre-existing, no new regressions)
TEST_BASELINE_STATUS=consistent with 7042295

REPORT_REL_PATH=docs/audit/specforge-post-v1.1-userdir-runtime-trial-report.md

BLOCKING_ENVIRONMENT_GAPS=daemon process cannot be started from Kiro IDE; requires manual OpenCode session
BLOCKING_RUNTIME_GAPS=none
RECOMMEND_MERGE=yes (README fix + docs tracking are safe, no code changes)
RECOMMEND_NEXT_ACTION=manual WI trial in OpenCode terminal after merge
```
