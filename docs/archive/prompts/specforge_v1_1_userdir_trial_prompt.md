
# SpecForge v1.1 用户级目录真实运行试验提示词（适合新会话）

## 当前状态（完整背景）
- main HEAD commit: 7042295
- 用户级 OpenCode 目录部署路径: C:\Users\luo\.config\opencode\
- 已部署 v1.1 工具（6/6）: sf_gate_run, sf_user_decision_record, sf_merge_run, sf_code_permission, sf_changed_files_audit, sf_close_gate
- 已部署 v1.1 Agent（3/3）: sf-extension, sf-evidence-collector, sf-investigator
- workflow skills 已更新（8/8）: 所有 workflow skill 已迁移到 v1.1 主链路
- README 已修复：移除 sf_state_transition 主流程引用，组件数量改为非硬编码
- 端到端测试通过 330/330 (scripts + daemon-core + workflow-runtime)
- 残留 legacy note 均为只读或调试功能，不影响 v1.1 主链路

## 本轮目标（适合新会话）
1. 修复 README 漂移和 untracked docs/prompts 文件。
2. 在 daemon 运行环境下执行真实用户 WI 端到端流程验证，确保 v1.1 主链路完全可执行。
3. 保留 trial 报告到 docs/audit/specforge-post-v1.1-userdir-runtime-trial-report.md。
4. 不做文件清理、不打 tag、不声明 production ready。

## 操作步骤
1. checkout main 分支，pull 最新。
2. 创建新分支：post-v1.1-userdir-runtime-trial。
3. 处理 untracked docs/prompts 文件（纳入仓库或删除临时文件，解释处理结果）。
4. 修复 README 组件数量漂移：删除硬编码数量，保留 v1.1 主链路说明。
5. 执行真实用户 WI 端到端试运行，至少覆盖以下场景：
   - code_only_fast_path
   - requirement_change_path
   - Extension Subflow
   - 越界写入场景
6. 运行 bun test scripts/daemon-core/workflow-runtime，确认 330/330 通过。
7. 生成报告到 docs/audit/specforge-post-v1.1-userdir-runtime-trial-report.md

## 禁止事项
- 删除或移动文件
- 清理 legacy tools
- 修改核心 runtime/daemon-core/workflow-runtime/installer
- 修改 package.json 或 workspace
- 打 tag 或声明 production ready
- 用单元测试代替真实 WI 试运行
- 建议立即清理文件

## 最终回执格式（key=value）
BRANCH=
BASE_MAIN_COMMIT=
HEAD_COMMIT=
NEW_COMMIT=
PUSHED=
TAGGED=

UNTRACKED_DOCS_PROMPTS_RESOLVED=
README_COUNT_DRIFT_FIXED=
README_STATE_TRANSITION_MAIN_FLOW_ABSENT=

DAEMON_STARTED=
OPENCODE_SESSION_STARTED=
REAL_WI_CODE_ONLY_TRIAL=
REAL_WI_EXTENSION_SUBFLOW_TRIAL=

CODE_ONLY_WI_PATH=
EXTENSION_WI_PATH=
CODE_ONLY_REQUIRED_FILES_VERIFIED=
EXTENSION_REQUIRED_FILES_VERIFIED=

V1_1_TOOLS_INVOKED_IN_REAL_TRIAL=
WRITE_GUARD_VERIFIED_IN_REAL_TRIAL=
CLOSE_GATE_VERIFIED_IN_REAL_TRIAL=
EXTENSION_REQUEST_BLOCKING_VERIFIED_IN_REAL_TRIAL=

MODIFIED_CORE_RUNTIME=
MODIFIED_DAEMON_CORE=
MODIFIED_WORKFLOW_RUNTIME=
MODIFIED_INSTALLER=
DELETED_FILES=
MOVED_FILES=
TAGGED=
PRODUCTION_READY_CLAIMED=

TEST_RESULT=
TEST_BASELINE_STATUS=

REPORT_REL_PATH=

BLOCKING_ENVIRONMENT_GAPS=
BLOCKING_RUNTIME_GAPS=
RECOMMEND_MERGE=
RECOMMEND_NEXT_ACTION=
