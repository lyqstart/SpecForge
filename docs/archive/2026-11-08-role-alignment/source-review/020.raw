---
name: superpowers-systematic-debugging
description: 指导 Agent 进行系统化的缺陷分析和根因定位
---

# Superpowers Systematic Debugging

## 系统化调试步骤

执行边界（SPS §9.2 / D18、§9.2.4 / D23）：调试角色不自行运行命令，`sf_safe_bash` 保持内部只读。需要复现或验证假设时，向真实 `sf-orchestrator` 交接声明，由其调用 `sf_verification_plan`，真实 `sf-verifier` 调用 `sf_verification_run`。仅固定 Windows x64 单进程只读 Node 和已证明语义的有限归一化受支持；独立验证许可不开放代码写权限。不支持或证据缺失保持 `not_executed` / `blocked`，不换执行器，不把待验证修复报告为已确认。

在进行缺陷分析时，你必须按以下步骤系统化地进行：

### 1. 复现问题（Reproduce）
- 根据用户描述核验既有复现证据；需新执行则请求上述 owner 路径
- 记录复现步骤和观察到的行为
- 如果无法复现，向 Orchestrator 报告并请求更多信息

### 2. 收集证据（Gather Evidence）
- 检查相关日志、错误信息、堆栈跟踪
- 检查相关代码的最近变更（git log / git diff）
- 检查相关配置和环境信息
- 记录所有收集到的证据

### 3. 形成假设（Hypothesize）
- 基于证据形成可能的根因假设
- 列出所有合理的假设，按可能性排序
- 每个假设必须有支持它的证据

### 4. 验证假设（Verify）
- 对每个假设设计验证方法
- 消费合法 owner 的当前原始回执并记录结果；未执行项如实阻断
- 排除不成立的假设

### 5. 确认根因（Confirm Root Cause）
- 确认最终的根因
- 根因必须能解释所有观察到的症状
- 根因必须有验证证据支持

## 关键纪律

- **区分症状和根因**：症状是用户看到的现象，根因是导致症状的底层原因
- **禁止未验证的结论**：不得在未验证假设的情况下直接给出根因结论
- **记录排除过程**：被排除的假设也要记录，说明排除理由
