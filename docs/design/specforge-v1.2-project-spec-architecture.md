# SpecForge v1.2 Project Spec Architecture

## 1. 问题定义

v1.1 解决了 WI 执行链路，但仍存在一个架构问题：

```text
规格不能长期散落在 .specforge/work-items/WI-XXXX/** 中。
```

WI 是过程，不是项目长期规格主线。

## 2. 目标目录

v1.2 建议引入项目级规格目录：

```text
.specforge/project/
  requirements/
  design/
  architecture/
  modules/
  trace/
  decisions/
  extensions/
```

其中：

```text
.specforge/project/** 是长期规格主线。
.specforge/work-items/WI-XXXX/** 是一次变更过程证据。
```

## 3. WI 与项目级规格的关系

WI 的职责：

- intake；
- change classification；
- impact analysis；
- candidate artifacts；
- user decision；
- merge evidence；
- implementation evidence；
- verification evidence；
- close evidence。

项目级规格的职责：

- 当前有效 requirements；
- 当前有效 design；
- 当前有效 architecture；
- 当前有效 module specs；
- 当前有效 trace matrix；
- 当前有效 extension registry。

## 4. Candidate 合并规则

v1.2 应明确：

```text
candidate artifacts 不能直接等于最终规格。
只有通过 gate、user decision、merge 后，才能写入 .specforge/project/**。
```

code_only_fast_path 可无 spec candidate，但必须留下 no-spec-impact 证据。

## 5. 冲突检测

如果多个 WI 修改同一项目级规格区域，应检测：

- base spec version；
- target spec path；
- overlapping section；
- stale candidate；
- unresolved conflict。

冲突时不得自动合并，应进入 approval_required 或 blocked。

## 6. 验收项

v1.2 项目级规格体系通过条件：

1. 新建 feature_spec 能写入 project requirements/design；
2. quick_change 不产生 project spec 改动，但留下 no-spec-impact 证据；
3. change_request 能修改 project spec；
4. stale base version 必须 fail-fast；
5. work_item.json 仍不得承载状态或审批权威。
