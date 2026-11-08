# Setup Directory

This directory contains all installation sources for SpecForge deployment.

## Structure

- `userlevel-opencode/` — OpenCode user-level configuration (agents, tools, skills, plugins)
  - Install target: `~/.config/opencode/`
- `userlevel-scripts-lib/` — Shared library scripts for deployed tools
  - 安装目标由正式 registry/Manifest 中每项声明决定；受控工具库位于 `<OpenCode config>/tools/lib/`，私有运行依赖位于 `<OpenCode config>/sf-user/lib/`。不得另造 `scripts/lib` 用户级运行根。
- `userlevel-templates/` — Project templates
  - Install target: `<OpenCode config>/sf-user/templates/`
