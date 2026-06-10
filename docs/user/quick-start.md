# SpecForge 快速开始

## 1. 启动 Daemon
```bash
cd <project-root>
npx specforge daemon start
```

## 2. 开始 Work Item
Work Item 通过 OpenCode 中的 sf-orchestrator 创建：
- 系统创建 `.specforge/work-items/<WI-ID>/work_item.json`
- 设置 `workflow_path` 和 `allowed_write_files`

## 3. 编写代码
只能修改 `allowed_write_files` 中声明的文件。

## 4. 关闭 Work Item
close_gate 基于文件证据判断：
- `evidence/evidence_manifest.json` 存在
- `verification_report.md` 存在
- `trace_delta.md` 存在
- `changed_files_audit.json` status=passed
