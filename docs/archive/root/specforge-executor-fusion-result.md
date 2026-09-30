# sf-executor.md 融合结果

## 输入文件

基于用户上传的本地真实文件：

- `setup/userlevel-opencode/agents/sf-executor.md`

## 处理原则

- 保留原有 v1.1 Final Governance Contract；
- 保留原有 Code Permission、Allowed Write Files、Write Audit、Bash Guard、Candidate Production、Implementation Artifact Write Guard；
- 不删除原文；
- 不尾部追加；
- 将治理模型融合到 executor 现有职责位置。

## 插入结果

| 位置 | 新增内容 | 目的 |
|---|---|---|
| `# Role` 后、`# 完成的定义` 前 | Executor Governance Model：依据、承接、验证、融合 | 明确 executor 是单 task 高级执行开发人员，不是 WI 完成声明者 |
| `# 读取配置文件` 后、`# 执行流程` 前 | Task 合同预检 | 强制执行前检查 allowed_write_files、当前实现、框架式任务是否有真实接入 |
| `# 执行流程（8 步）` 内 | Step 1/Step 2 扩展 | 要求先读 task 合同和当前实现，再写代码 |
| `# 执行流程` 后、`# 代码硬规则` 前 | 真实行为完成规则 | 禁止 file-only、compile-only、mock-only、unconnected framework 报 success |
| `# Required Output` 后、`# v1.1 Concepts` 前 | Required Output 扩展字段 | 增加 basis_checked、task_completion、not_done_checks、basis_conflicts 等字段 |

## 行数变化

- 原行数：500
- 新行数：691
- 增加：191

## 本地替换路径

将包内：

```text
files/setup/userlevel-opencode/agents/sf-executor.md
```

复制覆盖到：

```text
D:\code\temp\SpecForge\setup\userlevel-opencode\agents\sf-executor.md
```

然后检查：

```powershell
cd D:\code\temp\SpecForge
git diff --stat
git diff -- setup/userlevel-opencode/agents/sf-executor.md
```
