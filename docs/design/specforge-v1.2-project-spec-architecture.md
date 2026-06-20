# SpecForge v1.2 Project Spec Architecture

<!-- SF_V12_PROJECT_SPEC_ARCHITECTURE -->

## 1. 核心规则

```text
.specforge/project/** 是项目级规格主线。
.specforge/work-items/WI-XXXX/** 是变更过程证据。
```

WI 不能替代长期项目规格。项目规格不能由 AI 直接绕过流程写入。

## 2. 建议目录

```text
.specforge/project/
  manifest.json
  requirements/
    requirements.md
    acceptance_criteria.md
  design/
    design.md
    decisions.md
  architecture/
    architecture.md
    boundaries.md
  modules/
    <module_id>/
      requirements.md
      design.md
      trace.md
  trace/
    trace_matrix.md
  extensions/
    extension_registry.json
  versions/
    spec_versions.jsonl
```

## 3. 职责边界

`.specforge/project/**` 保存当前有效规格：

- requirements；
- acceptance criteria；
- design；
- architecture；
- module specs；
- trace matrix；
- extension registry；
- project spec versions。

`.specforge/work-items/WI-XXXX/**` 保存过程证据：

- intake；
- change classification；
- impact analysis；
- candidate artifacts；
- user decision；
- merge evidence；
- implementation evidence；
- verification evidence；
- close evidence。

## 4. Candidate Merge Contract

候选规格不是最终规格。只有满足以下条件，才允许写入项目级规格主线：

1. `candidate_manifest.json` 明确列出目标 project spec 路径；
2. `base_project_spec_version` 明确；
3. candidate gate 通过；
4. user decision 通过；
5. `sf_merge_run` 或 project spec merge tool 执行；
6. project spec version 增加；
7. trace 更新；
8. events 记录合并事件。

## 5. quick_change no-spec-impact

`quick_change / code_only_fast_path` 通常不修改 project spec，但必须留下 no-spec-impact 证据：

```json
{
  "spec_impact": "none",
  "workflow_path": "code_only_fast_path",
  "candidate_entries": []
}
```

如果实际出现需求、设计、架构、验收标准变化，必须升级路径，不得继续 code_only_fast_path。

## 6. 冲突检测

必须检测：

- stale base project spec version；
- 同一路径并发候选；
- 同一 section 重叠修改；
- trace 断裂；
- extension registry 冲突；
- candidate manifest 与实际文件不一致。

冲突时必须 fail-fast，不得静默覆盖。

## 7. 建议新增能力

```text
ProjectSpecStore
sf_project_spec_read
sf_project_spec_candidate_write
sf_project_spec_merge
sf_project_spec_version
```

## 8. 验收项

正向：

- feature_spec 创建 project requirements；
- architecture_change 更新 architecture；
- quick_change 不改 project spec 但有 no-spec-impact；
- merge 后 project spec version 增加。

负向：

- stale base version 拒绝；
- 未审批 candidate 写 project spec 拒绝；
- 直接写 `.specforge/project/**` 拒绝；
- candidate manifest 无目标路径 gate failed。
