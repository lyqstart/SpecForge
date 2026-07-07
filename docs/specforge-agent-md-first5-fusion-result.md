# Package 3：第一批 5 个 Agent MD 完整融合结果

本包基于 GitHub `main` 分支当前 5 个 Agent MD 原文生成完整替换文件。

## 融合原则

- 保留原文件全部内容，不做缩写覆盖。
- 不采用末尾统一追加。
- 将新增规则插入到原角色职责对应章节。
- 不新增孤儿 Agent。
- 不修改 workflow JSON / TypeScript gate。

## 文件与插入结果

### `_AGENT_BASE.md`

- 插入结果：插入 Governance Model（四问模型）到“完成的定义”和“执行流程”之间。
- 原文件行数：501
- 新文件行数：557
- 增加行数：56

### `sf-orchestrator.md`

- 插入结果：在 Role 后加入编排职责四问；在 workflow_path 选择规则后加入四问模型路径约束。
- 原文件行数：811
- 新文件行数：834
- 增加行数：23

### `sf-requirements.md`

- 插入结果：在 Role 后加入需求四问边界；在 Responsibilities 的需求澄清前加入 Intake 承接检查和 Must REQ 输出增强。
- 原文件行数：550
- 新文件行数：601
- 增加行数：51

### `sf-design.md`

- 插入结果：在 Role 后加入设计四问；在 DD1 后加入 DD1A 依据规则和 DD1B Requirements Coverage。
- 原文件行数：492
- 新文件行数：531
- 增加行数：39

### `sf-task-planner.md`

- 插入结果：在 Role 后加入 Task Planner 四问；在 T2 上下文充分原则后加入当前实现上下文、三层完成条件、集成闭环任务。
- 原文件行数：513
- 新文件行数：558
- 增加行数：45

## 本地替换方式

把 `files/setup/userlevel-opencode/agents/` 下的 5 个文件复制覆盖到：

```text
D:\code\temp\SpecForge\setup\userlevel-opencode\agents\
```

然后检查：

```powershell
cd D:\code\temp\SpecForge
git diff --stat
git diff -- setup/userlevel-opencode/agents/_AGENT_BASE.md setup/userlevel-opencode/agents/sf-orchestrator.md setup/userlevel-opencode/agents/sf-requirements.md setup/userlevel-opencode/agents/sf-design.md setup/userlevel-opencode/agents/sf-task-planner.md
```

确认后提交：

```powershell
git add setup/userlevel-opencode/agents/_AGENT_BASE.md setup/userlevel-opencode/agents/sf-orchestrator.md setup/userlevel-opencode/agents/sf-requirements.md setup/userlevel-opencode/agents/sf-design.md setup/userlevel-opencode/agents/sf-task-planner.md
git commit -m "docs(agents): fuse governance model into core agent roles"
git push origin fix/evidence-based-role-contract
```
