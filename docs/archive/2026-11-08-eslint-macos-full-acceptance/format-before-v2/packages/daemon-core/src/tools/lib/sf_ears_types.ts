/**
 * sf_ears_types — EARS 格式验证类型定义
 *
 * 定义 EARS（Easy Approach to Requirements Syntax）格式验证所需的所有类型、
 * 常量和正则表达式。解析器使用固定正则表达式，绝不从 AC 内容动态构造 regex。
 *
 * Requirements: 7.1-7.10, 2.1, 5.2
 */

// ============================================================
// EarsPattern — EARS 六种模式
// ============================================================

/**
 * EARS 定义的 5 种基础模式 + 1 种组合模式
 */
export type EarsPattern =
  | "Ubiquitous"
  | "Event-driven"
  | "State-driven"
  | "Optional-feature"
  | "Unwanted-behavior"
  | "Complex"

// ============================================================
// ValidationMode — 验证模式
// ============================================================

/**
 * strict: requirements_format: ears — 格式错误为 blocking
 * legacy: 无 front-matter 或 requirements_format: legacy — 格式错误为 warning
 */
export type ValidationMode = "strict" | "legacy"

// ============================================================
// EarsIssueCode — 问题代码枚举
// ============================================================

/**
 * 机器可识别的问题代码
 */
export type EarsIssueCode =
  | "MISSING_SHALL"          // 缺少 SHALL 关键词
  | "MISSING_THE"            // 缺少 THE 关键词
  | "MISSING_THEN"           // IF 模式缺少 THEN
  | "MISSING_COMMA"          // 条件子句后缺少逗号
  | "MISSING_LABEL"          // 缺少 [Pattern-label] 前缀
  | "LABEL_MISMATCH"         // 标签与实际模式不匹配
  | "INVALID_PATTERN"        // 未匹配任何有效 EARS 模式
  | "INVALID_LABEL"          // [Pattern-label] 不属于合法枚举
  | "EMPTY_AC"               // AC 内容为空
  | "COMPLEX_WHEN_IF"        // Complex 模式同时使用 WHEN 和 IF
  | "COMPLEX_ORDER"          // Complex 模式条件子句顺序错误
  | "INVALID_FORMAT_VALUE"   // requirements_format 值无效
  | "AC_TOO_LONG"            // 单条 AC 超过 2000 字符

// ============================================================
// ACIssue — 单个验证问题
// ============================================================

export interface ACIssue {
  /** 问题代码，用于机器识别 */
  code: EarsIssueCode
  /** 严重程度 */
  severity: "warning" | "blocking"
  /** 人类可读的错误消息 */
  message: string
}

// ============================================================
// ACValidationResult — 单条 AC 的验证结果
// ============================================================

export interface ACValidationResult {
  /** AC 在文档中的序号（从 1 开始） */
  index: number
  /** 原始 AC 文本 */
  raw: string
  /** 从 [Pattern-label] 提取的声明模式 */
  declaredPattern?: EarsPattern
  /** 通过关键词检测得到的实际模式 */
  detectedPattern?: EarsPattern
  /** 验证状态 */
  status: "pass" | "warning" | "fail"
  /** 具体问题列表 */
  issues: ACIssue[]
}

// ============================================================
// ExtractedAC — 从文档中提取的 AC 条目
// ============================================================

export interface ExtractedAC {
  /** 所属需求 ID（如 "Requirement 1"） */
  requirementId: string
  /** 所属 section 标题 */
  sectionTitle: string
  /** AC 在该 section 中的序号（从 1 开始） */
  index: number
  /** 原始 AC 文本（含编号） */
  raw: string
  /** 起始行号（从 1 开始） */
  lineStart: number
  /** 结束行号（从 1 开始） */
  lineEnd: number
}

// ============================================================
// EarsGateDetails — Gate 结果中的 EARS 验证详情
// ============================================================

export interface EarsGateDetails {
  /** 验证模式 */
  mode: ValidationMode
  /** AC 总数 */
  total_acs: number
  /** 通过数 */
  passed: number
  /** 警告数 */
  warnings: number
  /** 失败数 */
  failed: number
  /** 逐条验证结果 */
  results: ACValidationResult[]
}

// ============================================================
// EARS_KEYWORDS — EARS 关键词常量
// ============================================================

/**
 * EARS 结构化关键词（大写形式）
 */
export const EARS_KEYWORDS = ["WHEN", "WHILE", "WHERE", "IF", "THEN", "THE", "SHALL"] as const

// ============================================================
// VALID_PATTERN_LABELS — 合法的 Pattern-label 值
// ============================================================

/**
 * 合法的 [Pattern-label] 枚举值
 * 用于验证 AC 前缀中的模式标签是否合法
 */
export const VALID_PATTERN_LABELS: readonly EarsPattern[] = [
  "Ubiquitous",
  "Event-driven",
  "State-driven",
  "Optional-feature",
  "Unwanted-behavior",
  "Complex",
] as const

// ============================================================
// 正则表达式常量 — 编译时确定，不从 AC 内容动态构造
// ============================================================

/** Step 1: 剥离编号前缀 — 匹配 "N." 或 "N. " 开头 */
export const RE_STRIP_NUMBER = /^\d+\.\s*/

/** Step 1: 提取 [Pattern-label] — 匹配 "[xxx]" 前缀 */
export const RE_PATTERN_LABEL = /^\[([^\]]+)\]\s*/

/** Step 2: 检测 Ubiquitous — 以 THE 开头（strict mode 仅大写） */
export const RE_UBIQUITOUS = /^THE\s+/

/** Step 2: 检测 Ubiquitous — legacy mode 大小写不敏感 */
export const RE_UBIQUITOUS_LEGACY = /^THE\s+/i

/** Step 2: 检测 Event-driven — 以 WHEN 开头（strict mode 仅大写） */
export const RE_EVENT_DRIVEN = /^WHEN\s+/

/** Step 2: 检测 Event-driven — legacy mode 大小写不敏感 */
export const RE_EVENT_DRIVEN_LEGACY = /^WHEN\s+/i

/** Step 2: 检测 State-driven — 以 WHILE 开头（strict mode 仅大写） */
export const RE_STATE_DRIVEN = /^WHILE\s+/

/** Step 2: 检测 State-driven — legacy mode 大小写不敏感 */
export const RE_STATE_DRIVEN_LEGACY = /^WHILE\s+/i

/** Step 2: 检测 Optional-feature — 以 WHERE 开头（strict mode 仅大写） */
export const RE_OPTIONAL_FEATURE = /^WHERE\s+/

/** Step 2: 检测 Optional-feature — legacy mode 大小写不敏感 */
export const RE_OPTIONAL_FEATURE_LEGACY = /^WHERE\s+/i

/** Step 2: 检测 Unwanted-behavior — 以 IF 开头（strict mode 仅大写） */
export const RE_UNWANTED_BEHAVIOR = /^IF\s+/

/** Step 2: 检测 Unwanted-behavior — legacy mode 大小写不敏感 */
export const RE_UNWANTED_BEHAVIOR_LEGACY = /^IF\s+/i

/** Step 2: 检测条件子句存在性（用于 Complex 判断）— strict mode 仅大写 */
export const RE_CONDITION_CLAUSES = /\b(WHERE|WHILE|WHEN|IF)\b/g

/** Step 2: 检测条件子句存在性 — legacy mode 大小写不敏感 */
export const RE_CONDITION_CLAUSES_LEGACY = /\b(WHERE|WHILE|WHEN|IF)\b/gi

/** 检测 SHALL 关键词（strict mode 仅大写） */
export const RE_HAS_SHALL = /\bSHALL\b/

/** 检测 SHALL 关键词（legacy mode 大小写不敏感） */
export const RE_HAS_SHALL_LEGACY = /\bSHALL\b/i

/** 检测 THE 关键词（strict mode 仅大写） */
export const RE_HAS_THE = /\bTHE\b/

/** 检测 THE 关键词（legacy mode 大小写不敏感） */
export const RE_HAS_THE_LEGACY = /\bTHE\b/i

/** 检测 THEN 关键词（strict mode 仅大写） */
export const RE_HAS_THEN = /\bTHEN\b/

/** 检测 THEN 关键词（legacy mode 大小写不敏感） */
export const RE_HAS_THEN_LEGACY = /\bTHEN\b/i

/** 检测条件子句后的逗号（WHEN/WHILE/WHERE/IF ... , THE/THEN） */
export const RE_COMMA_BEFORE_THE = /,\s*(THE|THEN)\b/

/** 检测条件子句后的逗号（legacy mode 大小写不敏感） */
export const RE_COMMA_BEFORE_THE_LEGACY = /,\s*(THE|THEN)\b/i

// ============================================================
// YAML Front-Matter 解析正则
// ============================================================

/** 匹配 YAML front-matter 块 */
export const RE_FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---/

/** 匹配 requirements_format 字段 */
export const RE_FORMAT_FIELD = /^requirements_format:\s*(.+)$/m

// ============================================================
// AC 提取正则
// ============================================================

/** 匹配 #### Acceptance Criteria 标题 */
export const RE_AC_SECTION = /^####\s+Acceptance\s+Criteria\s*$/m

/** 匹配编号列表项（N. ...） */
export const RE_NUMBERED_ITEM = /^(\d+)\.\s+(.+)$/

/** 匹配 fenced code block 开始/结束 */
export const RE_FENCED_CODE = /^```/

/** 匹配 ### Requirement 或同级/更高级标题（停止提取） */
export const RE_SECTION_BOUNDARY = /^#{1,3}\s+/

// ============================================================
// 常量
// ============================================================

/** 单条 AC 最大字符数 */
export const AC_MAX_LENGTH = 2000

/** 文件大小上限（1MB） */
export const FILE_SIZE_LIMIT = 1 * 1024 * 1024
