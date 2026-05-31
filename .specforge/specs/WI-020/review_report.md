{
  "conclusion": "request_changes",
  "summary": "WI-020 安装路径统一重构的核心变更（7 个指定文件）整体质量良好，部署路径统一、install.json 写入、旧路径清理等关键功能已正确实现。但发现 3 个 blocking 级别问题：（1）sf_plugin_client.ts 存在 SPEC_DIR_NAME 的 import 和 const 双重定义（编译错误）；（2）scripts/lib/compatibility.ts（安装器侧）仍使用旧路径 ~/.config/opencode/specforge-manifest.json；（3）upgrade 回滚逻辑将 manifest 恢复到旧位置 ~/.config/opencode/specforge-manifest.json 而非 ~/.specforge/specforge-manifest.json。另有 2 个 warning 级别问题和 1 个 info 级别观察。",
  "dimensions": {
    "correctness": "fail",
    "coverage": "fail",
    "quality": "warning",
    "security": "pass",
    "performance": "pass",
    "maintainability": "warning"
  },
  "project_rules_lint": {
    "config_hardcoded": false,
    "dependency_undeclared": false,
    "version_incompatible": false,
    "empty_catch_blocks": 0
  },
  "findings": [
    {
      "severity": "blocking",
      "category": "code_quality",
      "file": "setup/userlevel-opencode/scripts/lib/sf_plugin_client.ts",
      "line": "16-20",
      "description": "SPEC_DIR_NAME 存在 import 和 const 双重定义。L16 从 './paths' import 了 SPEC_DIR_NAME，但 L20 又用 `const SPEC_DIR_NAME = \".specforge\" as const;` 重新声明了同名常量。在 TypeScript 中，局部 const 会遮蔽（shadow）import，不会报编译错误，但这意味着 L16 的 import 实际上未被使用，而 L20 的局部定义生效。这与重构计划（Step 5）中要求的「删除本地 const，改为 import」意图不符——代码表面上加了 import，但本地 const 没有删除。",
      "suggestion": "删除 L20 的 `const SPEC_DIR_NAME = \".specforge\" as const;`，使代码真正使用从 paths.ts 导入的 SPEC_DIR_NAME。"
    },
    {
      "severity": "blocking",
      "category": "spec_compliance",
      "file": "scripts/lib/compatibility.ts",
      "line": "134-135",
      "description": "安装器侧的 compatibility.ts（scripts/lib/compatibility.ts，非 setup/ 下的运行时版本）在 L134-135 仍使用旧路径 `join(userLevelDir, \"specforge-manifest.json\")`，即 `~/.config/opencode/specforge-manifest.json`。此文件是 scripts/lib/ 下的安装器辅助模块，虽然不作为运行时工具使用，但它被安装器内部的 reconcile 流程和测试引用。如果此模块的 assertCompatibility 被安装器流程调用，会读取错误位置的 manifest。refactor_plan.md 未将此文件列入变更范围，但它包含需要迁移的 manifest 路径引用。",
      "suggestion": "将 L134-135 的 `const userLevelDir = resolveUserLevelDirectory(); const userManifestPath = join(userLevelDir, \"specforge-manifest.json\")` 改为使用 `~/.specforge/specforge-manifest.json` 路径（与 manifest.ts 和 setup/ 下的 compatibility.ts 保持一致）。"
    },
    {
      "severity": "blocking",
      "category": "spec_compliance",
      "file": "scripts/sf-installer.ts",
      "line": "624-635",
      "description": "upgrade 回滚逻辑（cmdUpgrade catch 块）中，L633 将 manifest 备份恢复到 `path.join(userLevelDir, \"specforge-manifest.json\")`，即旧位置 `~/.config/opencode/specforge-manifest.json`。在重构后，manifest 已迁移到 `~/.specforge/specforge-manifest.json`，回滚逻辑应恢复到新位置。此错误意味着：如果 upgrade 失败触发回滚，manifest 会被恢复到错误的位置，导致后续所有依赖 manifest 的操作（verify、uninstall、showVersion）全部失败。",
      "suggestion": "将 L633 的 `const manifestTarget = path.join(userLevelDir, \"specforge-manifest.json\")` 改为 `const manifestTarget = path.join(getSpecForgeUserDir(), \"specforge-manifest.json\")`。同时需要确认 backupFile 函数在 upgrade 开头备份 manifest 时（L417）备份的是哪个位置的文件——由于 writeUserManifest 现在写入 ~/.specforge/，backupFile(userLevelDir, \"specforge-manifest.json\") 可能找不到要备份的文件。"
    },
    {
      "severity": "warning",
      "category": "spec_compliance",
      "file": "setup/userlevel-opencode/tools/lib/sf_doctor_core.ts",
      "line": "48",
      "description": "sf_doctor_core.ts L48 使用 `join(resolveUserLevelDirectory(), \"specforge-manifest.json\")` 读取用户级 manifest，即仍指向旧位置 `~/.config/opencode/specforge-manifest.json`。重构后 manifest 已迁移到 `~/.specforge/specforge-manifest.json`，此路径会导致 sf_doctor 工具的版本兼容性检查（assertCompatibility）始终报「共享组件未安装」错误。注意：此文件虽不在审查的 7 个文件列表中，但它是重构的直接影响范围——manifest 路径迁移后所有读取者都必须更新。",
      "suggestion": "将 L48 的 `join(resolveUserLevelDirectory(), \"specforge-manifest.json\")` 改为 `join(homedir(), SPEC_DIR_NAME, \"specforge-manifest.json\")` 或通过 resolveSpecForgeHome() 获取路径。注意 sf_doctor_core.ts 有自己内联的 assertCompatibility 函数（非 import），需一并更新。"
    },
    {
      "severity": "warning",
      "category": "code_quality",
      "file": "setup/userlevel-opencode/tools/lib/utils.ts",
      "line": "139-153",
      "description": "tryCheckCompatibility 内部内联了 install.json 读取逻辑（~15 行），与 sf_specforge.ts L9-16 和 paths.ts 的 resolveSpecForgeHome() 存在 3 处重复。这三处代码做完全相同的事情：读取 ~/.specforge/install.json → 解析 base_dir → 展开 ~。如果 install.json 格式变更或路径逻辑调整，需要同时修改 3 处。",
      "suggestion": "建议在未来迭代中提取为共享模块（如部署到 ~/.specforge/lib/install-info.ts），让 utils.ts 和 sf_specforge.ts 都通过绝对路径 import 使用。当前由于 utils.ts 与 paths.ts 在部署后不在同一目录，内联是合理的折中方案，但应添加同步注释标注。当前代码已做了注释说明（L9），可接受。"
    },
    {
      "severity": "info",
      "category": "code_quality",
      "file": "scripts/sf-installer.ts",
      "line": "297-327, 502-530",
      "description": "cmdInstall 和 cmdUpgrade 中部署 lib/ 文件到 ~/.specforge/lib/ 的代码块几乎完全相同（约 30 行 × 2）。虽然重构计划已将原来的 3 处合并为 2 处（从 P-4 改善），但仍有进一步 DRY 空间。",
      "suggestion": "建议提取为 `deploySpecForgeLib(sourceDir: string): number` 辅助函数，在 cmdInstall 和 cmdUpgrade 中复用。非 blocking，可后续优化。"
    }
  ],
  "traceability": {
    "requirements_covered": [
      "C-1: scripts/lib 部署到 ~/.specforge/lib/（sf-installer.ts L295-327, L500-530）",
      "C-2: package.json + bun install 改到 ~/.specforge/（sf-installer.ts L944 getSpecForgeUserDir()）",
      "C-3: utils.ts 动态 import 改绝对路径（utils.ts L137-163）",
      "C-4: sf_specforge.ts import 改绝对路径（sf_specforge.ts L18-20）",
      "C-5: manifest 迁移到 ~/.specforge/（manifest.ts L100, L163, L368, L570）",
      "C-6: install.json 写入（sf-installer.ts L344-353, L540-549）",
      "C-7: uninstall/upgrade 旧路径清理（sf-installer.ts L580-595, L776-791）",
      "C-8: SPEC_DIR_NAME 统一导出（paths.ts L189, compatibility.ts L13 import, sf_plugin_client.ts L16 import）"
    ],
    "requirements_missing": [
      "scripts/lib/compatibility.ts（安装器侧）的 manifest 路径未更新",
      "sf_doctor_core.ts 的 manifest 路径未更新",
      "upgrade 回滚逻辑的 manifest 恢复路径未更新"
    ]
  },
  "invariant_verification": {
    "INV-1_OpenCode加载入口不变": {
      "status": "PASS",
      "evidence": "~/.config/opencode/ 下的 agents/、tools/、skills/、plugins/ 仍通过 SHARED_COMPONENT_REGISTRY 部署，路径和内容未变。opencode.json 的 merge 逻辑未修改。"
    },
    "INV-2_安装器4个子命令外部行为不变": {
      "status": "FAIL",
      "evidence": "upgrade 回滚逻辑恢复 manifest 到错误位置（~/.config/opencode/ 而非 ~/.specforge/），导致回滚后 verify/uninstall 失败。CLI 接口未变，但行为语义异常。"
    },
    "INV-3_zod依赖解析链正常工作": {
      "status": "PASS",
      "evidence": "utils.ts 使用 pathToFileURL + 绝对路径 import ~/.specforge/lib/compatibility.ts，zod 从 ~/.specforge/node_modules/ 解析（deployScriptsPackageJson 已改为 getSpecForgeUserDir()）。"
    },
    "INV-4_manifest格式和用途不变": {
      "status": "PASS",
      "evidence": "manifest JSON schema 不变（validateUserManifest 函数未修改），仅物理位置从 ~/.config/opencode/ 迁移到 ~/.specforge/。manifest.ts 的 4 处读写路径已全部更新。"
    },
    "INV-5_tryCheckCompatibility行为不变": {
      "status": "PASS",
      "evidence": "utils.ts 的 tryCheckCompatibility 保持「兼容时静默通过，不兼容时抛出错误，失败时静默降级」的行为。绝对路径 import 链路正确。"
    },
    "INV-6_Plugin的hook注册行为不变": {
      "status": "PASS",
      "evidence": "sf_specforge.ts 的 7 个 hooks 注册代码完全未修改，仅 import 语句改为动态绝对路径。wrap 函数和 postEvent 函数不变。"
    },
    "INV-7_Daemon客户端降级模式行为不变": {
      "status": "PASS",
      "evidence": "ReconnectingDaemonClient 的重连/退避/降级逻辑未修改。handshakePath 仍指向 ~/.specforge/runtime/handshake.json。SPEC_DIR_NAME 变量遮蔽问题不影响运行时行为（值相同），但应修复。"
    },
    "INV-8_模板库部署路径不变": {
      "status": "PASS",
      "evidence": "deployTemplates 函数目标仍为 getSpecForgeUserDir()/templates/，逻辑未变。"
    }
  },
  "file_reviews": {
    "scripts/sf-installer.ts": {
      "status": "PASS_WITH_ISSUES",
      "summary": "核心安装器变更正确：lib/ 部署统一到 ~/.specforge/lib/、install.json 写入、旧路径清理、manifest 路径迁移。但 upgrade 回滚逻辑（L624-635）存在 blocking bug。",
      "details": [
        "✅ L295-327: lib/ 部署到 ~/.specforge/lib/ 正确",
        "✅ L344-353: install.json 写入正确",
        "✅ L944: deployScriptsPackageJson 目标改为 getSpecForgeUserDir()",
        "✅ L580-595: upgrade 旧路径清理正确",
        "✅ L763-771: uninstall 删除 manifest + install.json 正确",
        "✅ L776-791: uninstall 旧路径清理正确",
        "❌ L624-635: upgrade 回滚恢复 manifest 到旧位置 userLevelDir"
      ]
    },
    "setup/userlevel-opencode/tools/lib/utils.ts": {
      "status": "PASS",
      "summary": "tryCheckCompatibility 正确改用绝对路径 + pathToFileURL + install.json 读取。错误处理保持原有降级策略。",
      "details": [
        "✅ L137-163: 动态 import 使用 pathToFileURL 兼容 Windows",
        "✅ L139-153: install.json 读取逻辑正确",
        "✅ L160-163: 失败时调用 logErrorToFile 静默降级",
        "ℹ️ L139-153: install.json 读取逻辑与其他 2 处重复"
      ]
    },
    "setup/userlevel-opencode/plugins/sf_specforge.ts": {
      "status": "PASS",
      "summary": "top-level await 动态 import 正确使用绝对路径 + pathToFileURL。路径解析策略与 utils.ts 一致。",
      "details": [
        "✅ L4-7: require 导入 Node.js 模块正确",
        "✅ L9-16: install.json 读取逻辑正确",
        "✅ L18-20: pathToFileURL + join 拼接绝对路径正确",
        "✅ L16: catch 块正确降级到默认路径"
      ]
    },
    "setup/userlevel-scripts-lib/paths.ts": {
      "status": "PASS",
      "summary": "新增 resolveSpecForgeHome() 和 SPEC_DIR_NAME 导出正确。resolveUserLevelDirectory() 语义未变。",
      "details": [
        "✅ L189: SPEC_DIR_NAME 导出常量",
        "✅ L197-214: resolveSpecForgeHome() 实现，含 install.json 读取和 ~ 展开",
        "✅ L167-170: resolveUserLevelDirectory() 未修改，仍返回 ~/.config/opencode/"
      ]
    },
    "setup/userlevel-scripts-lib/compatibility.ts": {
      "status": "PASS",
      "summary": "SPEC_DIR_NAME 改为从 paths.ts import，manifest 路径改为 ~/.specforge/specforge-manifest.json。",
      "details": [
        "✅ L13: SPEC_DIR_NAME 从 ./paths 导入",
        "✅ L25: 旧 const 定义已删除（仅保留注释说明）",
        "✅ L140-142: manifest 路径使用 home + SPEC_DIR_NAME"
      ]
    },
    "scripts/lib/manifest.ts": {
      "status": "PASS",
      "summary": "所有 manifest 读写路径已迁移到 ~/.specforge/specforge-manifest.json。",
      "details": [
        "✅ L99-100: readUserManifest 使用 ~/.specforge/",
        "✅ L162-163: readAndValidateManifest 使用 ~/.specforge/",
        "✅ L367-368: writeUserManifest 使用 ~/.specforge/",
        "✅ L569-570: writeManifest（reconcile）使用 ~/.specforge/"
      ]
    },
    "setup/userlevel-opencode/scripts/lib/sf_plugin_client.ts": {
      "status": "FAIL",
      "summary": "SPEC_DIR_NAME 存在 import 和 const 双重定义，const 遮蔽了 import。",
      "details": [
        "✅ L16: 从 ./paths 导入 SPEC_DIR_NAME",
        "❌ L20: 本地 const SPEC_DIR_NAME 遮蔽了 import，import 变为 unused"
      ]
    }
  },
  "self_check": {
    "passed": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "failed": [],
    "notes": "全部 10 项自检通过：审查了所有 7 个指定文件、验证了 8 条不变行为、执行了项目规则 Lint 检查（无硬编码 IP、无未声明依赖、无空 catch 块）。"
  },
  "out_of_scope_observations": [
    {
      "file": "setup/userlevel-opencode/tools/lib/sf_doctor_core.ts",
      "line": "48",
      "description": "sf_doctor_core.ts 的 assertCompatibility 使用旧路径 ~/.config/opencode/specforge-manifest.json 读取用户级 manifest。重构后 manifest 已迁移到 ~/.specforge/，此路径会导致 sf_doctor 的兼容性检查误报「共享组件未安装」。此文件不在审查的 7 个文件列表中，但属于 manifest 路径迁移的直接影响范围。",
      "severity": "warning"
    },
    {
      "file": "scripts/lib/compatibility.ts",
      "line": "134-135",
      "description": "安装器侧的 compatibility.ts 仍使用旧路径 join(userLevelDir, 'specforge-manifest.json')。此文件不在审查的 7 个文件列表中，但包含需要迁移的路径引用。已在 blocking findings 中记录。",
      "severity": "blocking"
    },
    {
      "file": "setup/userlevel-opencode/tools/lib/thin-client.ts",
      "line": "13",
      "description": "thin-client.ts 有独立的 SPEC_DIR_NAME 本地定义（const SPEC_DIR_NAME = '.specforge'）。此文件仅引用 handshake.json 路径（~/.specforge/runtime/handshake.json），不涉及 manifest 路径迁移，无需立即修改。",
      "severity": "info"
    }
  ]
}