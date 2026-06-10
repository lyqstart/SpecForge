# SpecForge 安装指南

## 前提条件
- Node.js >= 18
- OpenCode CLI 已安装
- pnpm 或 bun

## 安装步骤
1. 克隆仓库：`git clone https://github.com/lyqstart/specforge.git`
2. 安装依赖：`pnpm install`
3. 执行安装器：`npx sf-installer install`

## 安装目标
- 默认：`~/.config/opencode/sf-user/`
- XDG：`$XDG_CONFIG_HOME/opencode/sf-user/`

## 安装产物
- `sf-user/plugins/sf_specforge.ts` — OpenCode 写入控制插件
- `sf-user/lib/` — 共享库
- `sf-user/tools/` — 工具定义
- `sf-user/agents/` — Agent 定义
- `sf-user/install.json` — 安装记录

## 验证安装
```bash
cat ~/.config/opencode/sf-user/install.json
```

## 不写入的路径
- `~/.specforge/` — 旧版路径，不再使用
