{
  "conclusion": "request_changes",
  "summary": "WI-031 修复后重审：4 个原始 blocking 问题中，2 个完全修复（#1 ProjectManager WAL 构造参数、#3 SessionRegistry ID 体系），1 个部分修复（#4 Daemon.ts StateManager 路径已修正但 RecoverySubsystem 仍使用 runtimeDir 导致路径嵌套），1 个仅修复表层（#2 数据双重包装已消除但 sessionId/ts 仍嵌套在 daemon client 的 {type, data} 包裹内，daemon 端在顶层找不到 sessionId）。新增 1 个 blocking 级别发现：因 daemon client 的 postEventToDaemon 始终以 { type, data } 格式发送请求，而插件将 sessionId 和 ts 嵌入 data 内部，daemon 端 handleIngestEvent 抽取的 request.sessionId 始终为 undefined，导致除 opencode.event 外的所有事件子处理器均以空 sessionId 运行（touch/terminate/getProjectPath 全部静默失败）。2 个原始 warning 未修复（saveCheckpoint 格式偏差、per-project StateManager 与全局实例不一致）。建议修复 blocking 问题后再次审查。",
  "needs_design_change": false,
  "dimensions": {
    "correctness": "fail",
    "coverage": "warning",
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
      "category": "spec_compliance",
      "file": "packages/service-management/src/plugin/reconnecting-daemon-client.ts",
      "line": "82-102",
      "description": "postEventToDaemon 始终以 { type, data } 格式发送请求体（第 95 行），将插件嵌入 data 内的 sessionId/ts 再次包裹。daemon 端 handleIngestEvent（HTTPServer.ts:952）期望顶层字段 sessionId/ts，导致 request.sessionId 始终为 undefined。后果：(1) 除 shell.env（getShellEnv 正确发送顶层 sessionId）外的所有事件类型，handleIngestEvent 均触发 'Event received without sessionId' WARNING；(2) handleToolInvoking 以空 sessionId 调用 touch()/getProjectPath()，全部静默失败；(3) handleToolInvoked/handleChatParams/HandleChatHeaders 记录的 eventLogger 事件 projectId 为空；(4) handleOpenCodeEvent 虽因 SessionRegistry 内部从 data 提取 sessionId 而可工作，但 ts 参数仍为 0。对比 getShellEnv（reconnecting-daemon-client.ts:459）正确发送 { sessionId, type, data }，证实协议不一致。",
      "suggestion": "统一协议：将 postEventToDaemon 签名改为 (url, token, sessionId, type, data, ts?)，请求体改为 { sessionId, type, data, ts: ts ?? Date.now() }。插件端 postEvent 改为 daemonClient.postEvent(sessionId, type, data)。这与原始审查建议方案 A 一致。"
    },
    {
      "severity": "warning",
      "category": "spec_compliance",
      "file": "packages/daemon-core/src/daemon/Daemon.ts",
      "line": "54",
      "description": "RecoverySubsystem 构造仍使用 runtimeDir (= config.getRuntimeDir() = resolveDaemonRuntimeDir()) 作为 projectPath 参数。在 personal 模式下，resolveEventsPath(runtimeDir) 会生成 ~/.specforge/runtime/.specforge/runtime/events.jsonl（路径嵌套），与原始 blocking #4 中 StateManager 的同源问题一致。StateManager 已改用 os.homedir() 修复，但 RecoverySubsystem 未同步修复。",
      "suggestion": "Daemon 级 RecoverySubsystem 应使用统一策略：要么像 StateManager 一样用 os.homedir()，要么新增 resolveDaemonEventsPath()/resolveDaemonStatePath() 到 IPathResolver 接口。"
    },
    {
      "severity": "warning",
      "category": "spec_compliance",
      "file": "packages/daemon-core/src/recovery/RecoverySubsystem.ts",
      "line": "597",
      "description": "saveCheckpoint 仍直接写入 JSON.stringify(snapshotData)，而设计 DD-B6 要求包装格式 { sessionId, timestamp: Date.now(), data: snapshotData }。缺少 sessionId 和 timestamp 顶层字段影响 checkpoint 文件的独立可读性和恢复逻辑。此 warning 与原始审查 #5 一致，未修复。",
      "suggestion": "将第 597 行改为 JSON.stringify({ sessionId, timestamp: Date.now(), data: snapshotData }, null, 2)。"
    },
    {
      "severity": "warning",
      "category": "code_quality",
      "file": "packages/daemon-core/src/project/ProjectManager.ts",
      "line": "60-64",
      "description": "registerProject 创建的 per-project WAL 和 StateManager 实例与 daemon 全局实例不一致。HTTPServer 处理 state/transition API 时使用 daemon 全局 StateManager，而非 ProjectManager 的 per-project 实例，导致 per-project 实例实际未被使用。此 warning 与原始审查 #6 一致，未修复。",
      "suggestion": "明确职责划分：若 daemon 全局 StateManager 处理所有项目状态，ProjectManager 无需创建 per-project StateManager；若每个项目需独立 StateManager，需重构 HTTPServer 路由逻辑。"
    },
    {
      "severity": "warning",
      "category": "code_quality",
      "file": ".opencode-/plugins/sf_specforge.ts",
      "line": "84",
      "description": "插件启动时 register 调用使用硬编码 5s AbortSignal（通过 daemon client 内部实现），未使用构造函数配置的 timeout 参数。此 warning 与原始审查 #7 一致，未修复。",
      "suggestion": "使 register 的超时可配置。"
    },
    {
      "severity": "info",
      "category": "code_quality",
      "file": "packages/daemon-core/src/daemon/Daemon.ts",
      "line": "53",
      "description": "Daemon 级 StateManager 使用 os.homedir() 作为 projectPath。虽然避免了 personal 模式下的路径嵌套（相比原始 runtimeDir 方案），但语义上不清晰——daemon 自身状态不应关联到用户主目录。",
      "suggestion": "考虑在 IPathResolver 中新增 resolveDaemonStatePath() 专门用于 daemon 级状态存储，避免混淆 daemon 自身状态与项目状态的概念。"
    },
    {
      "severity": "info",
      "category": "project_rules",
      "file": "packages/daemon-core/src/http/HTTPServer.ts",
      "line": "129",
      "description": "硬编码 IP 地址 127.0.0.1 用于 HTTP server 监听。此为 daemon 仅本地访问的设计决策，但需注意 IPv6-only 环境的兼容性。与原始审查 info 一致。",
      "suggestion": "考虑使用 'localhost' 或支持 SPECFORGE_BIND_ADDRESS 环境变量覆盖。"
    },
    {
      "severity": "info",
      "category": "code_quality",
      "file": "packages/daemon-core/src 整体",
      "line": "N/A",
      "description": "daemon-core 源代码中仍有 59 处 console.log/warn/error 调用（含 EventBus、Daemon、HTTPServer、RecoverySubsystem、SessionRegistry 等核心模块），未使用结构化日志框架。此模式为预存在，非 WI-031 引入。",
      "suggestion": "非 WI-031 范围，建议后续版本引入统一 Logger 抽象。"
    }
  ],
  "traceability": {
    "requirements_covered": [
      "DD-A1: mode 配置模型 ✅",
      "DD-A2: IPathResolver 接口 ✅",
      "DD-A3: .gitignore 自动维护 ✅",
      "DD-A4: daemon.json 迁移 ✅",
      "DD-A5: ALL_STATES 完备性验证 ✅",
      "DD-B1: Register 端点 ✅",
      "DD-B2: Ingest 事件路由表 ✅",
      "DD-B3: PermissionEngine 接入 ✅",
      "DD-B4: SessionRegistry opencode.event ✅ (ID 映射已修复)",
      "DD-B5: EventLogger 接入 ⚠️ (sessionId 丢失影响 projectId)",
      "DD-B6: saveCheckpoint ⚠️ (格式偏差未修复)",
      "DD-B7: shell.env hook ✅",
      "DD-AB1: sessionId↔projectPath 绑定 ⚠️ (协议不匹配导致大部分事件丢失 sessionId)",
      "DD-AB2: Feature Flag ✅"
    ],
    "requirements_missing": [
      "DD-B5/B6: 因 sessionId 协议不匹配，EventLogger 事件的 projectId 字段为空",
      "CP-4: ingest 事件处理虽在 15s 内返回，但 sessionId 丢失导致实际处理为降级模式"
    ]
  },
  "fix_verification": {
    "fix_1_projectmanager_wal": "✅ 完全修复 — ProjectManager.ts:60 正确使用 pathResolver.resolveEventsPath(projectPath)",
    "fix_2_sf_specforge_double_wrap": "⚠️ 部分修复 — 双重包装已消除，但 sessionId/ts 仍嵌套在 daemon client 的 {type, data} 包裹内",
    "fix_3_sessionregistry_id_mapping": "✅ 完全修复 — handleOpenCodeEvent 实现 4 级 ID 解析策略（daemon sessionId → OpenCode sessionID → projectPath → 新注册）",
    "fix_4_daemon_statemanager_path": "⚠️ 部分修复 — StateManager 改用 os.homedir() 正确，但 RecoverySubsystem 仍使用 runtimeDir 存在路径嵌套"
  },
  "self_check": {
    "passed": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "failed": []
  },
  "out_of_scope_observations": []
}