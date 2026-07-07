# Package 4：第二批 Agent/Skill MD 融合结果

本包基于 GitHub `main` 当前文件生成第二批 Agent/Skill MD 完整替换文件。

## 本轮已生成完整替换文件

### `setup/userlevel-opencode/agents/sf-reviewer.md`

- 原行数：363
- 新行数：428
- 增加：65 行
- 插入结果：
  - 在 Role 后加入 reviewer 的四问审查职责。
  - 在 Required Output 后加入治理模型输出增强。

### `setup/userlevel-opencode/agents/sf-verifier.md`

- 原行数：616
- 新行数：683
- 增加：67 行
- 插入结果：
  - 在 Role 后加入 verifier 的证据闭环职责。
  - 在报告规则后加入 required evidence 输出结构。

### `setup/userlevel-opencode/agents/sf-evidence-collector.md`

- 原行数：132
- 新行数：173
- 增加：41 行
- 插入结果：
  - 在 Role 后加入证据标准化约束。

### `setup/userlevel-opencode/agents/sf-debugger.md`

- 原行数：306
- 新行数：324
- 增加：18 行
- 插入结果：
  - 在系统化调试流程后加入缺陷分类和上游回退规则。

### `setup/userlevel-opencode/agents/sf-investigator.md`

- 原行数：140
- 新行数：164
- 增加：24 行
- 插入结果：
  - 在 Role 后加入调查作为依据生产者的约束。

### `setup/userlevel-opencode/agents/sf-knowledge.md`

- 原行数：287
- 新行数：304
- 增加：17 行
- 插入结果：
  - 在治理契约后加入知识沉淀结构约束。

### `setup/userlevel-opencode/agents/sf-extension.md`

- 原行数：494
- 新行数：505
- 增加：11 行
- 插入结果：
  - 在 Role 后加入扩展子流程四问约束。

### `setup/userlevel-opencode/skills/sf-intake/SKILL.md`

- 原行数：325
- 新行数：362
- 增加：37 行
- 插入结果：
  - 在 B1 用户需求收集后加入四问模型 intake 约束。

## 暂缓文件

`setup/userlevel-opencode/agents/sf-executor.md` 未生成完整替换文件。原因：下载工具将该 raw markdown 误判为 Python 脚本并阻断保存。为避免不完整或伪造替换文件，本包只提供 `docs/sf-executor-fusion-deferred.md`，下一轮再基于本地仓库真实文件生成完整替换版。

## 本地替换

将 `files/setup/userlevel-opencode/agents/` 和 `files/setup/userlevel-opencode/skills/` 下文件复制覆盖到本地仓库相同路径；将 `files/docs/` 下两个说明文件复制到 `docs/`。

```powershell
cd D:\code\temp\SpecForge
git diff --stat
```

## 提交建议

```powershell
git add docs/specforge-agent-md-second-batch-fusion-result.md docs/sf-executor-fusion-deferred.md setup/userlevel-opencode/agents setup/userlevel-opencode/skills/sf-intake/SKILL.md
git commit -m "docs(agents): fuse governance model into verification roles"
git push origin fix/evidence-based-role-contract
```