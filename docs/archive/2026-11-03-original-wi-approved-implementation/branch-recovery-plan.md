# 原 WI 实施前 Git 基线方案（尚未执行）

当前 Candidate 批准已经正式记录，规格已经原子合并到 PSV-0002，合并后门禁通过，Runtime 停在 `post_merge_verified`。不再要求重复批准这代 Candidate。

## 已确认的现场

- 原提交：`8a692e88c0823984647622294f5199c18bb0c587`。
- 原路径的 Git 目前处于 detached HEAD，`symbolic-ref -q HEAD` 和 `show-ref` 均无分支结果；正式 `sf_git_preflight` 独立确认当前无分支、无 remotes。
- 未跟踪变化均为 `.specforge/**` 治理现场；业务 README 原字节仍保留，其余四个实施文件未创建。
- 归档恢复明确没有证明旧默认分支、旧分支名和旧索引；不能宣称已恢复旧 `main`。

## 受控入口的实际限制

`setup/userlevel-opencode/tools/sf_git_branch_create.ts` 要求 `branch_name` 为用户确认后的语义分支名，`confirmed=true` 表示用户已确认该名称。此前 Candidate 审阅没有命名具体分支，所以当前“批准”不用于冒充分支名确认。

更重要的是，当前 `git-governance-core.ts#createBranch` 会先 `git switch <base_branch>`，而原仓库不存在可核验的基线分支。原 Agent 最终文本称确认名称后即可“从当前 detached HEAD 建立分支”，该描述**尚不受现有 owner 实现支持**。不能实际运行已知必败命令，也不能以 `HEAD`、`--detach` 等参数伪装成一个已证明的基线分支。

能力判断：现有审批与规格合并为 **SUPPORTED**；当前形态的 Git 分支建立为 **PARTIALLY_SUPPORTED**，首次缺口属于 Git Tool Contract/Handler/Runtime owner，而非 Executor。任何实施均须先补齐并验证这条受控路径。

## 建议的新分支身份

建议明确接受以下为**新建分支**：

| 身份 | 建议值 | 起点 |
|---|---|---|
| 新基线分支 | `main` | 原已核验提交 `8a692e88c0823984647622294f5199c18bb0c587` |
| WI 工作分支 | `codex/greet-library-wi-0001` | 同一提交，与新基线分支一致 |

正式语义计划原始建议为 `feature/greet-library-wi-0001`；上表采用本环境默认 `codex/` 前缀。用户可以给出其他具体名称。新建 `main` 不是恢复旧分支，也不创建新提交或修改 README。

## 执行前必须先完成的 owner 扩展

只有接受新分支身份后，才准备并验证正式 Git owner 的最小恢复合同：绑定当前 detached 原提交、两分支名及完整现场，拒绝现有冲突分支、实现漂移、链接和并发；保留不可变计划、实际命令审计和失败恢复；只由受控入口建立两条新引用并原子绑定 WI Git context。测试须覆盖正常既有分支路径保留、detached 正例、漂移零写入、冲突、并发及中断重试；同步 wrapper/schema/installer 和实际部署后，才能在原路径执行。

不得手工运行 Git 来替代原项目的受控 owner，不手写 `git_context.json`、不删除治理现场以迎合 clean 检查，不重新合并规格，不将项目切换为 filesystem 模式。完成分支绑定后再发放五个文件的 Code Permission。D18 的测试执行限制和将来默认主线 Git Merge 的独立确认均保持有效。
