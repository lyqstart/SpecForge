# SpecForge v1.2 Acceptance Matrix

<!-- SF_V12_ACCEPTANCE_MATRIX -->

## 1. 目标

每个 v1.2 开发包必须证明新规则生效，不能只证明旧流程还能跑通。

## 2. Project Spec Architecture

| ID | 类型 | 验收项 | 预期 |
|---|---|---|---|
| PSA-P1 | 正向 | feature_spec 创建 project requirements | `.specforge/project/requirements/**` 更新 |
| PSA-P2 | 正向 | architecture_change 更新 architecture | `.specforge/project/architecture/**` 更新 |
| PSA-P3 | 正向 | quick_change 不改 project spec | 生成 no-spec-impact 证据 |
| PSA-P4 | 正向 | merge 后 project spec version 增加 | spec_versions.jsonl 新增记录 |
| PSA-N1 | 负向 | stale base project spec version | gate fail-fast |
| PSA-N2 | 负向 | 未审批 candidate 写 project spec | 拒绝 |
| PSA-N3 | 负向 | 直接写 `.specforge/project/**` | Write Guard 拒绝 |
| PSA-N4 | 负向 | candidate manifest 无目标路径 | gate failed |

## 3. Write Guard Control Plane

| ID | 类型 | 验收项 | 预期 |
|---|---|---|---|
| WG-P1 | 正向 | allowed file 写入 | 通过 |
| WG-P2 | 正向 | read-only verification command | 通过 |
| WG-P3 | 正向 | project spec merge 专用工具写入 | 通过 |
| WG-N1 | 负向 | 未 enable code permission 写入 | 拒绝 |
| WG-N2 | 负向 | 非 implementation_running 写入 | 拒绝 |
| WG-N3 | 负向 | shell 写 out_of_scope 文件 | 拒绝或记录 violation |
| WG-N4 | 负向 | revoke 后写入 | 拒绝 |
| WG-N5 | 负向 | blocked_write_attempts > 0 后 close | close_gate fail-fast |

## 4. Extension Subflow

| ID | 类型 | 验收项 | 预期 |
|---|---|---|---|
| EXT-P1 | 正向 | 缺少 artifact type | 生成 extension request |
| EXT-P2 | 正向 | proposal gate passed | 进入 approval_required |
| EXT-P3 | 正向 | user approved | registry 更新 |
| EXT-P4 | 正向 | parent workflow resume | 回到 return_state |
| EXT-N1 | 负向 | user rejected | parent blocked/rejected |
| EXT-N2 | 负向 | stale registry version | merge 拒绝 |
| EXT-N3 | 负向 | 未审批 registry 写入 | 拒绝 |
| EXT-N4 | 负向 | extension agent 递归开子流程 | 拒绝 |

## 5. v1.1 回归保护

| ID | 验收项 | 预期 |
|---|---|---|
| REG-1 | v1.1 final state set | 不变 |
| REG-2 | StateManager/events 权威 | 不变 |
| REG-3 | work_item.json metadata only | 不变 |
| REG-4 | user_response_quote | 仍强制 |
| REG-5 | auto_approval_policy_id | 仍强制 |
| REG-6 | sf_merge_run 职责 | 不被绕过 |
| REG-7 | sf_code_permission 职责 | 不被绕过 |
| REG-8 | sf_changed_files_audit | 仍必需 |
| REG-9 | sf_close_gate mismatch fail-fast | 仍必需 |
