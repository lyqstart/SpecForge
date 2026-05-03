#!/bin/bash
# SpecForge 安装脚本
# 用法: bash scripts/install.sh <目标项目路径>
#
# 示例: bash scripts/install.sh D:/code/temp/test1

set -e

SPECFORGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$1"

if [ -z "$TARGET_DIR" ]; then
  echo "用法: bash scripts/install.sh <目标项目路径>"
  echo "示例: bash scripts/install.sh D:/code/temp/test1"
  exit 1
fi

echo "================================================"
echo "  SpecForge 安装脚本"
echo "================================================"
echo "源目录: $SPECFORGE_DIR"
echo "目标目录: $TARGET_DIR"
echo ""

# 创建目标目录（如果不存在）
mkdir -p "$TARGET_DIR"

# === 复制 .opencode 目录 ===
echo "📁 复制 .opencode/ ..."
mkdir -p "$TARGET_DIR/.opencode/agents"
mkdir -p "$TARGET_DIR/.opencode/tools/lib"
mkdir -p "$TARGET_DIR/.opencode/plugins"
mkdir -p "$TARGET_DIR/.opencode/skills/superpowers-brainstorming"
mkdir -p "$TARGET_DIR/.opencode/skills/superpowers-verification-before-completion"

# Agent 定义文件
cp "$SPECFORGE_DIR/.opencode/agents/"*.md "$TARGET_DIR/.opencode/agents/"

# Custom Tools
cp "$SPECFORGE_DIR/.opencode/tools/"*.ts "$TARGET_DIR/.opencode/tools/"
cp "$SPECFORGE_DIR/.opencode/tools/lib/"*.ts "$TARGET_DIR/.opencode/tools/lib/"

# Plugin
cp "$SPECFORGE_DIR/.opencode/plugins/sf_event_logger.ts" "$TARGET_DIR/.opencode/plugins/"

# Skills
cp "$SPECFORGE_DIR/.opencode/skills/superpowers-brainstorming/SKILL.md" \
   "$TARGET_DIR/.opencode/skills/superpowers-brainstorming/"
cp "$SPECFORGE_DIR/.opencode/skills/superpowers-verification-before-completion/SKILL.md" \
   "$TARGET_DIR/.opencode/skills/superpowers-verification-before-completion/"

# === 复制 specforge 目录 ===
echo "📁 复制 specforge/ ..."
mkdir -p "$TARGET_DIR/specforge/agents/contracts"
mkdir -p "$TARGET_DIR/specforge/config"
mkdir -p "$TARGET_DIR/specforge/specs"
mkdir -p "$TARGET_DIR/specforge/runtime/checkpoints"
mkdir -p "$TARGET_DIR/specforge/sessions"
mkdir -p "$TARGET_DIR/specforge/archive/agent_runs"
mkdir -p "$TARGET_DIR/specforge/logs"

# Agent Constitution 和契约
cp "$SPECFORGE_DIR/specforge/agents/AGENT_CONSTITUTION.md" "$TARGET_DIR/specforge/agents/"
cp "$SPECFORGE_DIR/specforge/agents/contracts/"*.md "$TARGET_DIR/specforge/agents/contracts/"

# 配置
cp "$SPECFORGE_DIR/specforge/config/"*.json "$TARGET_DIR/specforge/config/"

# 运行时初始文件
cp "$SPECFORGE_DIR/specforge/runtime/state.json" "$TARGET_DIR/specforge/runtime/"
cp "$SPECFORGE_DIR/specforge/runtime/events.jsonl" "$TARGET_DIR/specforge/runtime/"

# 日志文件（创建空文件）
touch "$TARGET_DIR/specforge/logs/app.log"
touch "$TARGET_DIR/specforge/logs/error.log"
touch "$TARGET_DIR/specforge/logs/gate.log"
touch "$TARGET_DIR/specforge/logs/trace.jsonl"

# === 复制根目录文件 ===
echo "📁 复制配置文件 ..."
cp "$SPECFORGE_DIR/AGENTS.md" "$TARGET_DIR/"

# opencode.json 特殊处理：如果目标已有则提示合并
if [ -f "$TARGET_DIR/opencode.json" ]; then
  echo "⚠️  目标项目已有 opencode.json，SpecForge 配置保存为 opencode.specforge.json"
  echo "    请手动将 agent 配置段合并到你的 opencode.json 中"
  cp "$SPECFORGE_DIR/opencode.json" "$TARGET_DIR/opencode.specforge.json"
else
  cp "$SPECFORGE_DIR/opencode.json" "$TARGET_DIR/"
fi

# package.json 特殊处理
if [ -f "$TARGET_DIR/package.json" ]; then
  echo "⚠️  目标项目已有 package.json，SpecForge 依赖保存为 package.specforge.json"
  echo "    请手动合并 devDependencies"
  cp "$SPECFORGE_DIR/package.json" "$TARGET_DIR/package.specforge.json"
else
  cp "$SPECFORGE_DIR/package.json" "$TARGET_DIR/"
fi

# tsconfig.json 特殊处理
if [ -f "$TARGET_DIR/tsconfig.json" ]; then
  echo "⚠️  目标项目已有 tsconfig.json，SpecForge 配置保存为 tsconfig.specforge.json"
  cp "$SPECFORGE_DIR/tsconfig.json" "$TARGET_DIR/tsconfig.specforge.json"
else
  cp "$SPECFORGE_DIR/tsconfig.json" "$TARGET_DIR/"
fi

echo ""
echo "================================================"
echo "  ✅ SpecForge 文件复制完成"
echo "================================================"
echo ""
echo "后续步骤:"
echo "  1. cd $TARGET_DIR"
echo "  2. bun install          # 安装依赖"
echo "  3. opencode             # 启动 OpenCode"
echo "  4. 切换到 sf-orchestrator agent（按 Tab）"
echo "  5. 调用 sf_doctor 工具验证安装"
echo ""
