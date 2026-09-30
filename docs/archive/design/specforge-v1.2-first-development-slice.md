# SpecForge v1.2 First Development Slice

<!-- SF_V12_FIRST_DEVELOPMENT_SLICE -->

## 1. 第一轮开发目标

第一轮开发只做最小可验证闭环：

```text
Project Spec Store + Candidate Merge Contract
```

## 2. 新增能力

### 2.1 ProjectSpecStore

职责：

- 初始化 `.specforge/project/**`；
- 读取 project manifest；
- 读取 project spec version；
- 写 candidate；
- merge candidate 到 project spec；
- 写 spec_versions.jsonl。

### 2.2 Candidate Manifest 扩展

```json
{
  "base_project_spec_version": "PSV-0001",
  "entries": [
    {
      "candidate_path": ".specforge/work-items/WI-0001/candidates/requirements.md",
      "target_project_path": ".specforge/project/requirements/requirements.md",
      "merge_mode": "replace_section"
    }
  ]
}
```

### 2.3 No Spec Impact Evidence

quick_change 必须写：

```text
no_spec_impact.json
```

证明本次不修改 project spec。

## 3. 第一轮不做

不做：

- 完整 shell parser；
- 完整 Extension Subflow；
- 多人协作；
- UI 产品化；
- release packaging。

## 4. 第一轮测试

建议新增：

```text
packages/daemon-core/tests/v12-project-spec-store.test.ts
packages/daemon-core/tests/v12-candidate-merge-contract.test.ts
packages/daemon-core/tests/v12-no-spec-impact.test.ts
```

必须覆盖：

- positive feature_spec merge；
- positive quick_change no-spec-impact；
- negative stale base version；
- negative direct project spec write；
- negative candidate without target path。

## 5. 真实运行验收

临时项目：

```text
D:\code\temp\SpecForge-v12-project-spec-store-acceptance
```

验收：

1. 初始化项目级规格；
2. 创建 feature_spec；
3. 生成 requirements candidate；
4. 用户审批；
5. merge 到 `.specforge/project/requirements/requirements.md`；
6. project spec version 增加；
7. close_gate 通过；
8. 再跑 quick_change，证明不改 project spec 但有 no-spec-impact 证据。

## 6. 完成 tag

```text
v1.2-project-spec-store-slice-complete
```
