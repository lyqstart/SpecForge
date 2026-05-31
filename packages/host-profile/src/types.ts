/**
 * Host Profile 类型定义
 *
 * Schema：见 docs/engineering-lessons/universal/host-environment-detection.md
 *
 * schema_version: 1.0
 */

/** Shell 名称（封闭枚举） */
export type ShellName = 'pwsh' | 'powershell' | 'cmd' | 'bash' | 'zsh' | 'sh' | 'dash' | 'fish';

/** 工具名称（开放——但工具列表常用的几个固定） */
export type CommonToolName =
  | 'git'
  | 'bun'
  | 'node'
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'rg'
  | 'curl'
  | 'wget'
  | 'python'
  | 'python3'
  | 'docker'
  | 'jq'
  | 'gh'
  | 'cargo'
  | 'rustc'
  | 'go';

/** OS 信息 */
export interface OsInfo {
  /** Node 风格 platform: 'win32' | 'darwin' | 'linux' | 'freebsd' | 'openbsd' | 'sunos' | 'aix' */
  platform: NodeJS.Platform;
  /** 内核版本（os.release()） */
  release: string;
  /** 人类可读的 OS 版本（如 "Windows 11 Pro 24H2" / "macOS 14.5 Sonoma"） */
  version: string;
  /** CPU 架构 */
  arch: NodeJS.Architecture;
  /** 总内存（GB，整数） */
  totalmem_gb: number;
  /** 逻辑 CPU 核数 */
  cpu_count: number;
}

/** Locale 信息 */
export interface LocaleInfo {
  /** 系统语言（zh-CN / en-US / ja-JP 等） */
  system_lang: string;
  /** 控制台代码页（仅 Windows 有意义） */
  console_codepage: number | null;
  /** 推荐的运行时编码（统一推荐 UTF-8） */
  encoding: 'UTF-8';
  /** IANA 时区名（Asia/Shanghai 等） */
  timezone: string;
  /** 时区偏移（分钟，UTC+8 = 480） */
  tz_offset_minutes: number;
  /** 扫描时刻（ISO 8601 UTC 毫秒） */
  datetime_now: string;
}

/** Shell 探测结果 */
export interface ShellInfo {
  name: ShellName;
  /** 绝对路径，未找到为 null */
  path: string | null;
  /** 版本号，未找到为 null */
  version: string | null;
  /** 该 shell 默认编码（pwsh=UTF-8 / powershell=UTF-16-LE / cmd=GBK 等） */
  default_encoding: string;
  /** 是否需要工具显式注入编码设置 */
  needs_encoding_fix: boolean;
  /** 是否可用 */
  available: boolean;
  /** 是否是首选 shell（每个平台只有一个 preferred=true） */
  preferred: boolean;
  /** 备注（如"Windows 上未安装 bash"） */
  note?: string;
}

/** 工具探测结果 */
export interface ToolInfo {
  available: boolean;
  /** 版本号（提取失败时为 null） */
  version: string | null;
  /** 绝对路径（未找到为 null） */
  path: string | null;
  /** 备注（如"探测超时"） */
  note?: string;
}

/** Shell 执行规则（基于探测结果归纳的可执行规则） */
export interface ShellRules {
  /** 首选 shell 名称 */
  preferred_shell: ShellName | null;
  /** 命令行最大长度（字节） */
  max_command_length: number;
  /** 编码注入命令（每次 spawn 时前置注入） */
  encoding_setup_command: string;
  /** 路径分隔符（'\\' | '/'） */
  path_separator: '\\' | '/';
  /** 路径含空格是否必须引号包裹 */
  path_quote_required_for_spaces: boolean;
  /** shell 是否原生支持 glob 展开（cmd 不支持） */
  supports_glob_in_shell: boolean;
  /** 是否在 CI 环境 */
  ci_mode: boolean;
}

/** 用户信息 */
export interface UserInfo {
  username: string;
  home_dir: string;
  /** shell 历史文件路径（可选） */
  shell_history_file: string | null;
}

/** SpecForge 相关路径 */
export interface SpecForgePaths {
  /** ~/.specforge 路径 */
  install_root: string;
  /** ~/.specforge/logs */
  logs_dir: string;
}

/** 完整的 Host Profile */
export interface HostProfile {
  schema_version: '1.0';
  /** 扫描时间戳（ISO 8601） */
  scanned_at: string;
  /** 扫描器版本（与 SpecForge 主版本一致） */
  scanner_version: string;
  /** 主机名（用来检测换机器） */
  hostname: string;
  os: OsInfo;
  locale: LocaleInfo;
  shells: ShellInfo[];
  tools: Record<string, ToolInfo>;
  shell_rules: ShellRules;
  user: UserInfo;
  specforge: SpecForgePaths;
}

/** 探测错误（不阻塞流程，写入档案的 note 字段） */
export interface ProbeError {
  kind: 'timeout' | 'spawn_error' | 'parse_error' | 'unknown';
  message: string;
}
