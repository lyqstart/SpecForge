# SpecForge Git Governance v1 设计方案

## 0. 术语说明

* Git：版本控制工具，用来记录代码历史。
* Git Governance：Git 治理，指 SpecForge 对分支、提交、远程仓库、合并、标签、忽略规则等开发流程的管理。
* Work Item：工作项，SpecForge 中一次需求、修复、调查或运维任务的治理单元。
* branch：分支，用来隔离一组代码修改。
* commit：提交，用来保存一次代码快照。
* push：推送，把本地提交上传到远程仓库。
* merge：合并，把一个分支的代码并入另一个分支。
* tag：标签，用来标记某个版本点。
* remote：远程仓库，服务器上的 Git 仓库。
* PR：Pull Request，拉取请求 / 合并请求，请求把一个分支的变更合并到目标分支。GitHub 叫 PR，GitLab / Gitee 通常叫 MR。
* worktree：工作树，Git 的并行工作目录机制，可让多个任务在不同目录并行开发。
* checkpoint：检查点，用来保存当前开发状态，便于回滚和审计。
* baseline：基线，SpecForge 接管项目时确认的起点状态。
* hard stop：硬停止，发现高风险或不可判断情况时强制停止。
* OpenCode：用户使用的 AI 编程入口。
* SpecForge：基于 OpenCode 的规格驱动治理系统。

---

## 1. 总目标

SpecForge Git Governance v1 的目标是：

把 AI 编程从“一个脏工作区里连续乱改”变成：

1. 有明确任务边界；
2. 有清晰分支上下文；
3. 有可审计提交；
4. 有持续忽略规则分析；
5. 有远程仓库管理；
6. 有合并前后验证；
7. 用户可授权自动动作；
8. 高风险动作必须受控。

核心原则：

> Work Item 是治理意图，branch 是代码隔离上下文，commit 是审计快照，remote 是协作和备份目标。它们要显式关联，但不能机械绑死。

---

## 2. 当前问题

当前 SpecForge 已经能管理：

1. Work Item；
2. 需求；
3. 设计；
4. 任务；
5. code_permission；
6. changed_files_audit；
7. semantic closure；
8. close gate。

但 Git 生命周期还没有被完整纳入治理，因此 OpenCode 可能出现：

1. 直接在 main 上开发；
2. 没有分支；
3. 没有及时 commit；
4. 没有 push；
5. 多个任务混在一个工作区；
6. 不知道哪些代码属于哪个 Work Item；
7. 构建产物、缓存、密钥等文件可能混入提交。

这会破坏 SpecForge 的审计闭环。

---

## 3. 设计边界

### 3.1 不强制所有项目使用 Git

新项目初始化时，SpecForge 必须询问用户是否启用 Git Governance。

用户可以选择：

1. 不启用 Git；
2. 只启用本地 Git；
3. 启用本地分支和 commit；
4. 启用远程分支 push；
5. 启用 PR / MR 流程。

如果用户选择不用 Git，SpecForge 仍可运行，但必须降级：

1. 无分支隔离；
2. 无 base commit 审计；
3. 回滚能力有限；
4. changed_files_audit 只能做文件快照级弱审计。

### 3.2 不机械绑定“新 Work Item = 新 branch”

规则是：

1. 会产生代码或项目文件变更的 Work Item，必须有明确 Git 隔离上下文；
2. investigation / no-code 审查类 Work Item 默认不需要 branch；
3. ops / environment 类型 Work Item 根据是否修改项目文件决定；
4. 一个 Work Item 可以有一个主 branch，也可以有 child branch；
5. 一个 branch 可以服务一个父 Work Item 下的多个 task，但必须记录清楚。

### 3.3 分支名必须有业务含义

不能只叫：

```text
WI-0036
```

建议格式：

```text
<type>/<semantic-slug>-wi-<id>
```

示例：

```text
feature/today-check-dashboard-wi-0036
fix/no-code-audit-hardstop-wi-0037
ops/android-sdk-toolchain-wi-0038
```

分支名由 OpenCode 根据任务生成，用户确认。
如果项目策略允许自动确认，则 OpenCode 可采用推荐名，但必须记录。

### 3.4 SpecForge 管理开发流程，但高风险动作分级授权

可自动：

1. Git 只读检查；
2. 本地 branch 创建；
3. checkpoint commit；
4. Work Item branch push，前提是用户已授权。

默认需要用户确认：

1. merge 到 main；
2. push main；
3. tag release。

默认禁止：

1. git add .；
2. git add -A；
3. 直接在 main 写业务代码；
4. force push；
5. 系统静默 resolve hard stop；
6. shell / node / python 手写治理产物绕过工具。

---

## 4. 目录设计

目录必须服从 SpecForge 现有目录模型。

### 4.1 项目级、提交到 Git 的配置

路径：

```text
.specforge/project/git_policy.json
.specforge/project/git_ignore_decisions.json
```

用途：

* `git_policy.json`：项目级 Git 治理策略。
* `git_ignore_decisions.json`：用户对不确定文件的长期决策。

这些文件可以提交，因为它们是项目规则，不含密钥。

### 4.2 项目级、本机运行时配置，不提交

路径：

```text
.specforge/runtime/git_remote.json
.specforge/runtime/git_local_env.json
.specforge/runtime/git_ignore_assessment.json
.specforge/runtime/git_preflight_cache.json
```

用途：

* `git_remote.json`：本机当前项目 remote 配置。
* `git_local_env.json`：本机 Git / SSH / 工具链环境摘要。
* `git_ignore_assessment.json`：最近一次忽略规则扫描结果。
* `git_preflight_cache.json`：最近一次 Git 预检缓存。

这些文件属于 runtime，不提交。

### 4.3 Work Item 级 Git 上下文，提交

路径：

```text
.specforge/work-items/<WI-ID>/git_context.json
.specforge/work-items/<WI-ID>/git_audit.md
```

用途：

* `git_context.json`：记录本 Work Item 的 branch、base commit、remote、push 策略、merge 策略。
* `git_audit.md`：记录本 Work Item 的 Git 审计结果。

### 4.4 用户级认证配置

不能新增：

```text
~/.config/specforge/
```

必须归属 OpenCode 用户目录。具体路径必须由现有 directory layout 统一定义，不能各工具硬编码。

候选路径：

```text
~/.config/opencode/sf-user/git/auth_profiles.json
```

或：

```text
~/.config/opencode/sf-user/runtime/git/auth_profiles.json
```

实现时必须在现有 directory layout 中新增统一常量，例如：

```text
USER_GIT_AUTH_PROFILES
```

所有工具引用该常量，不允许自行拼路径。

---

## 5. 配置分级

### 5.1 项目级配置

放：

```text
.specforge/project/git_policy.json
```

包括：

1. 是否启用 Git Governance；
2. Git 治理模式；
3. 默认主线分支；
4. 分支命名规则；
5. 是否禁止 main 写业务代码；
6. 是否禁止 git add .；
7. commit 策略；
8. merge 策略；
9. tag 策略；
10. ignore 分析策略。

### 5.2 用户级配置

放 OpenCode 用户目录。

包括：

1. SSH key 路径引用；
2. SSH host alias；
3. GitHub / GitLab / Gitee 用户身份；
4. HTTPS token 引用；
5. 默认认证 profile；
6. 用户是否授权自动 commit；
7. 用户是否授权自动 push Work Item branch。

不得保存私钥内容。

### 5.3 项目本机级配置

放：

```text
.specforge/runtime/git_remote.json
```

包括：

1. remote name；
2. fetch URL；
3. push URL；
4. provider type；
5. auth profile 引用；
6. default branch；
7. 最近一次远程连接检查结果。

### 5.4 Work Item 级配置

放：

```text
.specforge/work-items/<WI-ID>/git_context.json
```

包括：

1. Work Item ID；
2. branch name；
3. base branch；
4. base commit；
5. branch relationship；
6. 是否使用 worktree；
7. remote name；
8. push policy；
9. merge policy。

---

## 6. 忽略规则分析

### 6.1 忽略规则分析是持续工作

ignore analysis 不是初始化动作，而是持续门禁。

触发时机：

1. 项目初始化；
2. 现存项目接管；
3. 新建 Work Item 前；
4. code_permission 授权前；
5. executor 写入后；
6. checkpoint commit 前；
7. changed_files_audit 前；
8. merge 前；
9. post-merge verification 后。

### 6.2 自动忽略的典型文件

Java / Maven：

```text
target/
*.class
```

Node / React Native：

```text
node_modules/
npm-debug.log*
yarn-error.log*
```

Android：

```text
.gradle/
build/
app/build/
local.properties
*.apk
*.aab
```

通用：

```text
.DS_Store
Thumbs.db
*.log
```

敏感文件：

```text
*.keystore
*.jks
*.pem
*.key
.env
.env.*
```

敏感文件默认 hard stop，除非用户明确强授权。

### 6.3 不确定项交给用户决策

例如：

```text
deploy/release.zip
doc/*.xlsx
scripts/tmp-data.sql
```

SpecForge 要输出：

1. 文件路径；
2. 判断依据；
3. 建议；
4. 让用户选择 track / ignore / hard stop。

用户决策写入：

```text
.specforge/project/git_ignore_decisions.json
```

### 6.4 自动 commit 也必须先做 ignore audit

用户授权自动 commit 只表示不再询问“是否提交”。

不表示：

1. 可以跳过 ignore audit；
2. 可以提交未知文件；
3. 可以提交敏感文件；
4. 可以 git add .；
5. 可以 git add -A。

---

## 7. 远程仓库设计

### 7.1 不绑定 GitHub

SpecForge 面向 generic Git remote。

支持：

1. GitHub；
2. GitLab；
3. Gitee；
4. Gitea；
5. Bitbucket；
6. 公司自建 Git；
7. bare repo。

基础能力只依赖 Git 命令，不依赖 GitHub API。

### 7.2 远程配置需要的信息

项目本机级：

1. remote name；
2. fetch URL；
3. push URL；
4. default branch；
5. provider type；
6. auth profile 引用；
7. 是否允许自动 push Work Item branch；
8. 是否允许自动 push main。

用户级：

1. SSH key 引用；
2. SSH host alias；
3. HTTPS token 引用；
4. 账号提示；
5. 认证 profile ID。

### 7.3 先有本地仓库

流程：

1. 检查是否 Git 仓库；
2. 检查工作区是否干净；
3. 检查 remote；
4. 无 remote 时询问用户；
5. 用户提供 URL；
6. SpecForge 添加 remote；
7. 验证 git ls-remote；
8. 检查本地 main 与远程 main 是否同源；
9. 写入 runtime remote 配置。

如果本地和远程无共同历史，必须 hard stop。

### 7.4 先有远程仓库

流程：

1. 用户提供远程 URL；
2. SpecForge clone 到用户指定本地目录；
3. 检查默认分支；
4. 初始化 `.specforge/`；
5. 写入 Git policy；
6. 进入正常治理流程。

如果远程为空：

1. 本地初始化项目；
2. baseline commit；
3. 添加 remote；
4. push main。

---

## 8. Work Item 开发流程

### 8.1 新功能开发

流程：

1. 用户提出任务；
2. SpecForge 判断 Work Item 类型；
3. Git preflight；
4. 如果需要 branch，OpenCode 生成分支名候选；
5. 用户确认分支名，或按项目策略自动确认；
6. SpecForge 创建 branch；
7. 写入 `git_context.json`；
8. code_permission 授权；
9. OpenCode 开发；
10. 持续 ignore analysis；
11. checkpoint commit；
12. 验证；
13. changed_files_audit；
14. push Work Item branch；
15. gate；
16. 用户确认 merge；
17. merge main；
18. post-merge verification；
19. push main；
20. close Work Item。

### 8.2 开发到一半发现新问题

SpecForge 判断并询问用户选择：

1. 加入当前 Work Item 的 task；
2. 从 main 新建独立 Work Item；
3. 从当前 branch 派生 child Work Item；
4. 使用 worktree 隔离处理。

派生前必须 checkpoint commit。

---

## 9. 现存项目接管

### 9.1 接管目标

对已经开发一半、没有规范 Git 管理的项目，SpecForge 不伪造历史，只建立接管基线。

### 9.2 接管流程

1. 检查是否 Git 仓库；
2. 检查当前 branch；
3. 检查工作区；
4. 扫描文件；
5. 自动识别构建产物、缓存、日志、密钥；
6. 对不确定项询问用户；
7. 写入 `.gitignore`；
8. 建立 baseline commit；
9. 写入 adoption report；
10. 从 baseline 开始进入 Git Governance。

### 9.3 正常情况

正常结果：

1. 工作区被分类；
2. 构建产物不进入 Git；
3. 密钥不进入 Git；
4. 有 baseline commit；
5. 有 adoption report；
6. 后续 Work Item 从 baseline 后开始治理。

### 9.4 异常情况

必须 hard stop：

1. 发现密钥准备提交；
2. 本地和远程无共同历史；
3. 工作区文件无法分类；
4. 用户拒绝接管；
5. `.gitignore` 冲突无法自动处理。

---

## 10. 四阶段实施计划

## 阶段一：防止继续一锅粥

目标：

1. main 不可写；
2. 开发前 Git preflight；
3. 语义化 branch name；
4. 精确 checkpoint commit；
5. 禁止 git add .；
6. 持续 ignore analysis 最小闭环。

交付：

1. directory layout 路径常量；
2. `git_policy.json` schema；
3. `git_context.json` schema；
4. `sf_git_preflight`；
5. `sf_git_branch_plan`；
6. `sf_git_branch_create`；
7. `sf_git_ignore_analyze` 基础版；
8. `sf_git_checkpoint_commit`；
9. main write guard。

正常情况：

1. 在 main 上尝试写业务代码会被 hard stop；
2. 新 feature / bugfix 会先生成 branch plan；
3. branch 名有业务含义；
4. commit 只提交授权文件；
5. 构建产物不会被提交；
6. 不确定文件会要求用户决策。

---

## 阶段二：完整 Work Item Git 生命周期

目标：

1. Work Item 与 branch 显式关联；
2. 记录 base commit；
3. changed files audit 基于 base commit；
4. 自动 push Work Item branch；
5. merge 前 gate；
6. post-merge verification 必须执行。

交付：

1. `sf_git_changed_files_audit`；
2. `sf_git_push_branch`；
3. `sf_git_merge_plan`；
4. `sf_git_merge_run` 增强；
5. `sf_git_post_merge_verify`；
6. Work Item Git audit 报告。

正常情况：

1. 即使工作区干净，也能审计 branch 相对 base commit 改了哪些文件；
2. Work Item branch 可自动 push；
3. main merge 前必须 gate 通过；
4. main merge 后必须重新验证；
5. push main 默认需要用户确认，除非项目策略明确授权。

---

## 阶段三：旧项目接管与远程仓库通用化

目标：

1. 支持现存项目 adoption；
2. 支持本地先有仓库；
3. 支持远程先有仓库；
4. 支持 GitHub / GitLab / Gitee / 自建 Git；
5. 用户认证配置归属 OpenCode 用户目录；
6. 项目 remote 配置归属 `.specforge/runtime/`。

交付：

1. `sf_git_project_adopt`；
2. `sf_git_remote_config`；
3. `sf_git_auth_profile_config`；
4. `git_ignore_decisions.json`；
5. adoption report；
6. remote connectivity report。

正常情况：

1. 旧项目接管时建立 baseline；
2. 不伪造历史；
3. 用户级密钥不进项目仓库；
4. 一个 GitHub SSH key 可被多个项目通过 auth profile 引用；
5. remote 不绑死 GitHub。

---

## 阶段四：高级协作能力

目标：

1. PR / MR 管理；
2. worktree 并行开发；
3. child Work Item；
4. stacked branch；
5. release tag 管理；
6. 多 agent 并行冲突控制。

交付：

1. `sf_git_pr_plan`；
2. `sf_git_pr_create`；
3. `sf_git_worktree_create`；
4. `sf_git_child_wi_branch`；
5. `sf_git_tag_release`；
6. conflict risk report。

正常情况：

1. 多个 Work Item 可以并行；
2. 子 Work Item 可从父 branch 派生；
3. worktree 隔离不同任务；
4. tag 必须用户确认；
5. PR / MR 不依赖 GitHub，能根据 provider 能力降级。

---

## 11. 实施要求

每个阶段开始前，OpenCode 必须先阅读本文件。

每个阶段都必须：

1. 先确认当前 SpecForge 代码目录布局；
2. 不凭空新增目录；
3. 不写复杂脚本；
4. 尽量直接改完整代码文件；
5. 先做设计对齐；
6. 再实现；
7. 再验证；
8. 再提交；
9. 失败也形成可审计报告。

禁止：

1. `git add .`；
2. `git add -A`；
3. `git clean -fd`；
4. `git restore .`；
5. `git push --mirror`；
6. 在 main 上直接写业务代码；
7. 未经用户授权 push main；
8. 未经用户授权 tag；
9. 手写治理产物绕过 SpecForge 工具。

---

## 12. 第一阶段启动提示词

给 OpenCode 的提示词：

```text
你现在开始实现 SpecForge Git Governance v1 第一阶段。

先阅读：
docs/design/specforge_git_governance_v1.md

第一阶段目标：
1. 防止继续一锅粥；
2. main 不可写；
3. 开发前 Git preflight；
4. 语义化 branch name；
5. 精确 checkpoint commit；
6. 禁止 git add . / git add -A；
7. 持续 ignore analysis 基础版。

要求：
1. 先只读检查当前 SpecForge 仓库目录布局；
2. 必须参考现有 directory layout，不允许凭空新增 ~/.config/specforge；
3. 用户级配置必须归属 OpenCode 用户目录；
4. 项目级配置放 .specforge/project；
5. 项目运行时配置放 .specforge/runtime；
6. Work Item 级 Git 事实放 .specforge/work-items/<WI-ID>/；
7. 尽量不要写脚本；
8. 不要一点一点零散改，按第一阶段完整方案一次性实现；
9. 不允许 git add .；
10. 不允许在 main 上写业务代码；
11. 实现完成后，给出验证结果和正常/异常说明。
```
