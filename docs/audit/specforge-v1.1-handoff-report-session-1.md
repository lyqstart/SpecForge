# SpecForge v1.1 Session 1 交接报告

**日期**: 2026-06-13
**当前分支**: `post-v1.1-tool-registry-writeguard-fix`
**当前 HEAD**: `932af2f`
**main HEAD**: `2665d61`（未合并当前分支）

---

## 1. 已修复内容

| # | 修复项 | Commit 范围 | 状态 |
|---|--------|-------------|------|
| 1 | Handshake 路径对齐 | daemon source 已正确，dist 重建 | ✅ 已合并 main |
| 2 | Event ingest 协议对齐 | plugin postEvent 参数顺序 + payload 截断 + daemon normalization | ✅ 已合并 main |
| 3 | Tool registry 别名 | sf_gate_run → sf_v11_gate_run 等 6 个工具 | 在当前分支 |
| 4 | sf_changed_files_audit handler | 新建独立 handler | 在当前分支 |
| 5 | WriteGuard todowrite 误拦截 | NON_FILESYSTEM_PLANNING_TOOLS allowlist | 在当前分支 |
| 6 | sf* prefix bypass 移除 | 显式 SPECFORGE_CONTROL_TOOLS 替代 | 在当前分支 |
| 7 | sf_safe_bash 归入 SHELL_TOOLS | 不再因 sf 前缀绕过 | 在当前分支 |
| 8 | python/base64/node 写入检测 | isBashReadOnly + isBashWriteCommand 增强 | 在当前分支 |
| 9 | Plugin client API 补齐 | checkWrite/bashGuard/changedFilesAudit/recordEscapedWrite | 在当前分支 |
| 10 | WI ID 格式校验 | validateWorkItemId (WI-xxxx) | 在当前分支 |
| 11 | sf_state_transition WI ID 校验 | 拒绝 wi-blue-hello-page 等 | 在当前分支 |
| 12 | sf_code_permission enable 支持 | 处理 enable action + 创建 work_item.json | 在当前分支 |
| 13 | sf_code_permission hard_stop | 缺 allowed_write_files 返回 hard_stop:true | 在当前分支 |
| 14 | bashGuard 阻断 .specforge/work-items/ | WI_ARTIFACT_WRITE_REQUIRES_CONTROLLED_TOOL | 在当前分支 |
| 15 | checkWrite 阻断 .specforge/work-items/ | 同上 | 在当前分支 |
| 16 | Plugin 传递 projectDir | checkWrite/bashGuard/changedFilesAudit 携带 directory | 在当前分支 |
| 17 | Extension loading 修复 | daemon 禁用 plugin extension（OpenCode plugin 不是 daemon plugin） | 在当前分支 |
| 18 | Build layout 统一 | render-workflow-docs → setup/userlevel-opencode | 在当前分支 |
| 19 | Registry 清理 | 移除 3 个不存在的 engineering-lessons 文件 | 在当前分支 |
| 20 | Orchestrator/Skill prompt | 要求 action="enable" + allowed_write_files | 在当前分支 |
| 21 | 43 个新测试 | tool registry + WriteGuard + WI ID + dispatch | 在当前分支 |

## 2. 仍未闭环的问题

| # | 问题 | 严重程度 | 真实运行证据 |
|---|------|----------|-------------|
| 1 | **hard_stop 无 plugin/runtime latch** | Critical | Agent 调用工具失败后继续推进 |
| 2 | **WI 产物通过 sf_safe_bash 写入** | Critical | powershell Set-Content .specforge/work-items/... |
| 3 | **trigger_result.json 非法 JSON** | Critical | 实际写入转义混乱的内容 |
| 4 | **sf_code_permission enable 不传 allowed_write_files** | Critical | Agent 忽略 prompt 约束 |
| 5 | **code_change_allowed=false 但 Agent 继续写** | Critical | work_item.json 与实际行为矛盾 |
| 6 | **JSON schema validation 未实现** | High | trigger_result/candidate_manifest 可写非法内容 |
| 7 | **changed_files_audit 无 code_permission 前置检查** | High | 未启用权限时 audit 仍可通过 |
| 8 | **artifact writer 未强化** | High | sf_artifact_write 无 schema 校验 |
| 9 | **close_gate 证据闭环未验证** | High | 真实 trial 从未到达 close_gate |

## 3. 为什么不能 Merge

- `REAL_WI_CODE_ONLY_TRIAL=not_executed`
- `BLOCKING_RUNTIME_GAPS` 非空
- 真实运行证明 Agent 能绕过所有"返回 hard_stop"的工具继续执行
- `RECOMMEND_MERGE=no`（按本项目硬性判定规则）

## 4. 建议新分支

```
分支名: post-v1.1-hard-stop-artifact-closure
基于: post-v1.1-tool-registry-writeguard-fix @ 932af2f
```

## 5. 新分支必须完成的 Closure 范围

### 5.1 Hard Stop Plugin/Runtime Latch
- Plugin `tool.execute.after` 检查 SpecForge 工具返回的 `hard_stop:true`
- 写入 `.specforge/work-items/<WI>/hard_stop.json`
- 后续工具调用前检查 hard_stop 状态
- blocked 状态下拒绝：sf_state_transition, sf_artifact_write, sf_code_permission, sf_safe_bash, sf_changed_files_audit, sf_close_gate, write, edit, bash
- 只允许：sf_state_read, read 类工具

### 5.2 Artifact Writer Schema Validation
- sf_artifact_write handler 增加 JSON schema 校验
- 至少校验：work_item.json, trigger_result.json, candidate_manifest.json, evidence_manifest.json
- 最低要求：合法 JSON + 必需字段 + work_item_id 匹配 + workflow_path 枚举校验
- 非法 JSON 返回 `hard_stop:true`，不落盘

### 5.3 changed_files_audit 前置条件
- 检查 code_change_allowed=true
- 检查 allowed_write_files 非空
- 检查无 hard_stop blocked
- 不满足则返回 `CODE_PERMISSION_NOT_ENABLED` + `hard_stop:true`

### 5.4 close_gate 证据闭环
- 验证 changed_files_audit.md 存在
- 验证 evidence_manifest.json 存在
- 验证 code_permission 曾经 enabled 且已 revoked
- 验证无 hard_stop

### 5.5 真实 OpenCode Clean Project Trial
- 新建干净项目
- 输入 code-only 请求
- 验证完整 v1.1 产物结构
- 验证 code_permission + allowed_write_files + WriteGuard + changed_files_audit + close_gate 全部闭环

## 6. 当前分支 Commit 历史

```
932af2f fix(hard-stop): WI ID validation in sf_state_transition, hard_stop on missing allowed_write_files, block .specforge/work-items/ writes via bash
3398163 fix(orchestrator+skill+plugin): enforce allowed_write_files in enable call, add action=enable to skill/orchestrator prompts, pass projectDir to all audit calls
785b827 fix(daemon): disable plugin extension loading — OpenCode plugins are not daemon extensions
7ede358 fix(build): unify source dir to setup/userlevel-opencode, remove 3 missing registry entries, re-render workflow docs
605db55 fix(client+handlers): add checkWrite/bashGuard/changedFilesAudit/recordEscapedWrite to plugin client, add WI ID validation, add 13 more tests
df0a826 fix(writeguard): remove sf* prefix bypass, add sf_safe_bash to SHELL_TOOLS, add 30 new tests
e3f1db7 fix(tools+writeguard): register v1.1 tool aliases, fix todowrite false positive, block python/base64 write bypass
```

## 7. 新会话一键复制提示词

```
# SpecForge v1.1 Hard Stop + Artifact Closure 修复

## 当前状态
- 仓库路径: D:\code\temp\SpecForge
- 当前分支: post-v1.1-tool-registry-writeguard-fix
- 当前 HEAD: 932af2f
- main HEAD: 2665d61（未合并当前分支）

## 本轮前置操作
git checkout post-v1.1-tool-registry-writeguard-fix
git checkout -b post-v1.1-hard-stop-artifact-closure

## 已修复（不要重复修）
- Tool registry aliases（6 个 v1.1 工具已注册）
- Plugin client API（checkWrite/bashGuard/changedFilesAudit/recordEscapedWrite）
- WriteGuard 分类（todowrite 不拦截，sf_safe_bash 作为 shell）
- python/base64/node 写入检测
- WI ID 格式校验（sf_state_transition + sf_code_permission + sf_changed_files_audit）
- sf_code_permission enable 支持（创建 work_item.json + hard_stop 返回）
- .specforge/work-items/ bash 写入阻断
- Extension loading 修复（daemon 不加载 OpenCode plugin）
- Build layout 统一（render-workflow-docs + installer + registry）
- 43 个新测试

## 本轮必须完成
1. **Hard Stop Plugin Latch**
   - sf_specforge.ts tool.execute.after 检查 hard_stop:true
   - 写入 .specforge/work-items/<WI>/hard_stop.json
   - blocked 状态下拒绝后续写入/状态推进工具
   - 只允许 read 类工具

2. **Artifact Writer Schema Validation**
   - sf_artifact_write handler 增加 JSON schema 校验
   - work_item.json: 合法 JSON + work_item_id 匹配
   - trigger_result.json: 合法 JSON + workflow_path 枚举
   - candidate_manifest.json: 合法 JSON + code_only_fast_path 下 entries=[]
   - evidence_manifest.json: 合法 JSON
   - 非法 → hard_stop:true，不落盘

3. **changed_files_audit 前置条件**
   - 检查 code_change_allowed=true
   - 检查 allowed_write_files 非空
   - 检查无 hard_stop
   - 不满足 → CODE_PERMISSION_NOT_ENABLED + hard_stop:true

4. **close_gate 证据闭环**
   - changed_files_audit.md 存在
   - evidence_manifest.json 存在
   - code_permission revoked
   - 无 hard_stop

5. **真实 OpenCode Clean Project Trial**
   - 新建干净项目
   - 用户请求: "新建一个网页，里面有一个h1标题'hello' 字体是蓝色"
   - 验证完整 v1.1 产物 + WriteGuard + close_gate 闭环

## 禁止事项
- 不要 merge 到 main
- 不要打 tag
- 不要清理文件
- 不要只改 prompt
- 不要把 schema validation 写成 future work
- 不要在 hard_stop 后允许 Agent 继续写文件
- 真实 OpenCode trial 必须由用户手动执行

## 判定规则
RECOMMEND_MERGE=yes 的条件：
- hard_stop latch 实现 + 测试通过
- artifact writer schema validation 实现 + 测试通过
- changed_files_audit 前置条件实现 + 测试通过
- 真实 OpenCode clean project trial 通过（用户提供证据）
- 无 hard_stop 被 Agent 绕过
- 无 WI artifact 通过 bash 写入
- trigger_result.json 是合法 JSON
- candidate_manifest.entries=[]
- close_gate executed
```

---

**本交接报告完成。当前会话结束。**
