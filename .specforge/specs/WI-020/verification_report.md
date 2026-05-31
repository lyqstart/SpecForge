{
  "work_item_id": "WI-020",
  "verifier": "sf-orchestrator",
  "timestamp": "2026-05-30T03:50:00Z",
  "result": "pass",
  "invariant_checks": [
    {"id": "INV-1", "description": "OpenCode 加载入口不变", "status": "pass", "evidence": "~/.config/opencode/ 下的 agents/tools/skills/plugins/AGENTS.md/opencode.json 未改变位置"},
    {"id": "INV-2", "description": "安装器 4 个子命令外部行为不变", "status": "pass", "evidence": "install/upgrade/verify/uninstall 命令均正常执行，退出码 0"},
    {"id": "INV-3", "description": "zod 依赖解析链正常工作", "status": "pass", "evidence": "~/.specforge/lib/types.ts 可正常 import zod（来自 ~/.specforge/node_modules/）"},
    {"id": "INV-4", "description": "specforge-manifest.json 格式和用途不变", "status": "pass", "evidence": "manifest 已迁移到 ~/.specforge/，schema_version=1.0, 75 个文件条目"},
    {"id": "INV-5", "description": "tryCheckCompatibility 行为不变", "status": "pass", "evidence": "sf_doctor 健康检查通过，兼容性检查正常"},
    {"id": "INV-6", "description": "Plugin hook 注册行为不变", "status": "pass", "evidence": "sf_specforge.ts 使用 top-level await 动态 import，插件结构未变"},
    {"id": "INV-7", "description": "Daemon 客户端降级模式不变", "status": "pass", "evidence": "sf_plugin_client.ts 逻辑未变，仅 SPEC_DIR_NAME 来源改为 import"},
    {"id": "INV-8", "description": "模板库部署路径不变", "status": "pass", "evidence": "~/.specforge/templates/ 部署 19 个文件"}
  ],
  "directory_structure_verification": {
    "specforge_home": {
      "path": "~/.specforge/",
      "contents": ["install.json", "specforge-manifest.json", "package.json", "node_modules/", "lib/ (27 .ts files)", "templates/ (19 files)"],
      "status": "pass"
    },
    "opencode_config": {
      "path": "~/.config/opencode/",
      "contents": ["opencode.json", "AGENTS.md", "agents/", "tools/", "skills/", "plugins/"],
      "status": "pass"
    },
    "old_paths_cleaned": {
      "~/.config/scripts/": "不存在",
      "~/.config/opencode/scripts/": "不存在",
      "~/.config/opencode/specforge-manifest.json": "不存在",
      "status": "pass"
    }
  },
  "command_verification": {
    "install": {"exit_code": 0, "deployed": 103, "status": "pass"},
    "upgrade": {"exit_code": 0, "upgraded": 103, "old_paths_cleaned": true, "status": "pass"},
    "verify": {"exit_code": 0, "files_checked": 74, "status": "pass"},
    "version": {"exit_code": 0, "version": "6.0.0-dev", "files": 75, "status": "pass"},
    "sf_doctor": {"healthy": true, "all_checks": "ok", "status": "pass"}
  },
  "review_fixes_verified": {
    "B1_sf_plugin_client_double_definition": "fixed - SPEC_DIR_NAME only imported from ./paths",
    "B2_scripts_lib_compatibility_old_path": "fixed - manifest path uses ~/.specforge/",
    "B3_upgrade_rollback_manifest_path": "fixed - rollback restores to ~/.specforge/",
    "W1_sf_doctor_core_old_path": "fixed - both copies updated to use ~/.specforge/"
  },
  "e2e_tests": {
    "description": "端到端测试：完整安装生命周期验证",
    "steps": [
      {
        "step": 1,
        "name": "首次安装",
        "command": "bun scripts/sf-installer.ts install",
        "expected": "103 个文件部署成功，~/.specforge/ 下生成 install.json + specforge-manifest.json + lib/ + node_modules/ + templates/",
        "actual": "103 个文件部署成功，install.json 已写入 ~/.specforge/install.json，模板库 19 个文件已部署",
        "exit_code": 0,
        "status": "pass"
      },
      {
        "step": 2,
        "name": "版本显示",
        "command": "bun scripts/sf-installer.ts --version",
        "expected": "显示版本号和文件数",
        "actual": "SpecForge v6.0.0-dev, 75 个文件, 目录 ~/.specforge/",
        "exit_code": 0,
        "status": "pass"
      },
      {
        "step": 3,
        "name": "完整性校验",
        "command": "bun scripts/sf-installer.ts verify",
        "expected": "74 个文件通过 SHA-256 校验",
        "actual": "校验通过（74 个文件完整）",
        "exit_code": 0,
        "status": "pass"
      },
      {
        "step": 4,
        "name": "升级 + 旧路径清理",
        "command": "bun scripts/sf-installer.ts upgrade --force",
        "expected": "升级成功，旧路径 ~/.config/scripts/ 和 ~/.config/opencode/scripts/ 被清理",
        "actual": "103 个文件升级成功，3 个旧路径已清理（~/.config/scripts, ~/.config/opencode/scripts, ~/.config/opencode/specforge-manifest.json）",
        "exit_code": 0,
        "status": "pass"
      },
      {
        "step": 5,
        "name": "sf_doctor 健康检查",
        "command": "sf_doctor 工具调用",
        "expected": "所有检查项通过，状态 healthy",
        "actual": "healthy=true, 11 个检查项全部 ok（包含用户级文件、项目运行时、兼容性检查）",
        "exit_code": 0,
        "status": "pass"
      }
    ],
    "summary": {
      "total": 5,
      "passed": 5,
      "failed": 0,
      "status": "pass"
    }
  }
}
