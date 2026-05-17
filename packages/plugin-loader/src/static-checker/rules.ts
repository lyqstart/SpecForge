/**
 * 禁止 API 规则集定义
 *
 * 职责：
 *   - 定义所有禁止的敏感 API 调用模式
 *   - 支持规则的启用/禁用
 *   - 支持按权限分类规则
 *
 * 规则设计原则：
 *   - 每条规则对应一个具体的 API 或 API 模式
 *   - 规则包含：ID、模式、严重级别、所需权限、错误信息
 *   - 支持通配符匹配（如 'child_process.*'）
 *   - 规则可按权限分组，便于权限验证
 *
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本模块为纯数据定义，无异步操作
 *   - 无资源泄漏风险
 */

/**
 * 规则严重级别
 */
export type RuleSeverity = 'error' | 'warning';

/**
 * 规则匹配类型
 */
export type RuleMatchType = 'function_call' | 'import' | 'variable_ref' | 'any';

/**
 * 单条规则定义
 */
export interface StaticCheckRule {
  /** 规则唯一标识符（如 'CHILD_PROCESS_EXEC'） */
  id: string;

  /** 规则名称（人类可读） */
  name: string;

  /** 规则描述 */
  description: string;

  /** 匹配模式（支持通配符 *） */
  pattern: string;

  /** 匹配类型 */
  matchType: RuleMatchType;

  /** 严重级别 */
  severity: RuleSeverity;

  /** 所需权限（如果声明了该权限则允许） */
  requiredPermission?: string;

  /** 错误信息模板 */
  errorMessage: string;

  /** 是否启用 */
  enabled: boolean;
}

/**
 * 规则集
 */
export interface RuleSet {
  /** 规则集版本 */
  version: string;

  /** 规则列表 */
  rules: StaticCheckRule[];
}

/**
 * 默认禁止 API 规则集
 *
 * 包含 10+ 条规则，覆盖以下敏感 API：
 *   1. child_process 模块（进程执行）
 *   2. fs 模块（文件系统访问）
 *   3. http/https 模块（网络访问）
 *   4. 路径逃逸攻击
 *   5. 环境变量访问
 */
export const DEFAULT_RULE_SET: RuleSet = {
  version: '1.0',
  rules: [
    // ========== child_process 规则 ==========
    {
      id: 'CHILD_PROCESS_EXEC',
      name: 'child_process.exec 调用',
      description: '禁止直接调用 child_process.exec（可执行任意 shell 命令）',
      pattern: 'child_process.exec',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'child_process',
      errorMessage:
        '禁止调用 child_process.exec（行 {line}）。需要声明 "child_process" 权限。',
      enabled: true,
    },
    {
      id: 'CHILD_PROCESS_EXEC_SYNC',
      name: 'child_process.execSync 调用',
      description: '禁止直接调用 child_process.execSync（同步执行 shell 命令）',
      pattern: 'child_process.execSync',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'child_process',
      errorMessage:
        '禁止调用 child_process.execSync（行 {line}）。需要声明 "child_process" 权限。',
      enabled: true,
    },
    {
      id: 'CHILD_PROCESS_SPAWN',
      name: 'child_process.spawn 调用',
      description: '禁止直接调用 child_process.spawn（启动子进程）',
      pattern: 'child_process.spawn',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'child_process',
      errorMessage:
        '禁止调用 child_process.spawn（行 {line}）。需要声明 "child_process" 权限。',
      enabled: true,
    },
    {
      id: 'CHILD_PROCESS_SPAWN_SYNC',
      name: 'child_process.spawnSync 调用',
      description: '禁止直接调用 child_process.spawnSync（同步启动子进程）',
      pattern: 'child_process.spawnSync',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'child_process',
      errorMessage:
        '禁止调用 child_process.spawnSync（行 {line}）。需要声明 "child_process" 权限。',
      enabled: true,
    },
    {
      id: 'CHILD_PROCESS_FORK',
      name: 'child_process.fork 调用',
      description: '禁止直接调用 child_process.fork（启动 Node.js 子进程）',
      pattern: 'child_process.fork',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'child_process',
      errorMessage:
        '禁止调用 child_process.fork（行 {line}）。需要声明 "child_process" 权限。',
      enabled: true,
    },
    {
      id: 'CHILD_PROCESS_EXEC_FILE',
      name: 'child_process.execFile 调用',
      description: '禁止直接调用 child_process.execFile（执行可执行文件）',
      pattern: 'child_process.execFile',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'child_process',
      errorMessage:
        '禁止调用 child_process.execFile（行 {line}）。需要声明 "child_process" 权限。',
      enabled: true,
    },
    {
      id: 'CHILD_PROCESS_EXEC_FILE_SYNC',
      name: 'child_process.execFileSync 调用',
      description: '禁止直接调用 child_process.execFileSync（同步执行可执行文件）',
      pattern: 'child_process.execFileSync',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'child_process',
      errorMessage:
        '禁止调用 child_process.execFileSync（行 {line}）。需要声明 "child_process" 权限。',
      enabled: true,
    },

    // ========== fs 模块规则 ==========
    {
      id: 'FS_READ_FILE',
      name: 'fs.readFile 调用',
      description: '禁止直接调用 fs.readFile（读取文件）',
      pattern: 'fs.readFile',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'filesystem.read',
      errorMessage:
        '禁止调用 fs.readFile（行 {line}）。需要声明 "filesystem.read" 权限。',
      enabled: true,
    },
    {
      id: 'FS_WRITE_FILE',
      name: 'fs.writeFile 调用',
      description: '禁止直接调用 fs.writeFile（写入文件）',
      pattern: 'fs.writeFile',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'filesystem.write',
      errorMessage:
        '禁止调用 fs.writeFile（行 {line}）。需要声明 "filesystem.write" 权限。',
      enabled: true,
    },
    {
      id: 'FS_UNLINK',
      name: 'fs.unlink 调用',
      description: '禁止直接调用 fs.unlink（删除文件）',
      pattern: 'fs.unlink',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'filesystem.write',
      errorMessage:
        '禁止调用 fs.unlink（行 {line}）。需要声明 "filesystem.write" 权限。',
      enabled: true,
    },
    {
      id: 'FS_RMDIR',
      name: 'fs.rmdir 调用',
      description: '禁止直接调用 fs.rmdir（删除目录）',
      pattern: 'fs.rmdir',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'filesystem.write',
      errorMessage:
        '禁止调用 fs.rmdir（行 {line}）。需要声明 "filesystem.write" 权限。',
      enabled: true,
    },

    // ========== http/https 模块规则 ==========
    {
      id: 'HTTP_REQUEST',
      name: 'http.request 调用',
      description: '禁止直接调用 http.request（发起 HTTP 请求）',
      pattern: 'http.request',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'network',
      errorMessage:
        '禁止调用 http.request（行 {line}）。需要声明 "network" 权限。',
      enabled: true,
    },
    {
      id: 'HTTPS_REQUEST',
      name: 'https.request 调用',
      description: '禁止直接调用 https.request（发起 HTTPS 请求）',
      pattern: 'https.request',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'network',
      errorMessage:
        '禁止调用 https.request（行 {line}）。需要声明 "network" 权限。',
      enabled: true,
    },
    {
      id: 'FETCH_API',
      name: 'fetch 调用',
      description: '禁止直接调用 fetch（发起网络请求）',
      pattern: 'fetch',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'network',
      errorMessage:
        '禁止调用 fetch（行 {line}）。需要声明 "network" 权限。',
      enabled: true,
    },

    // ========== 导入规则 ==========
    {
      id: 'IMPORT_CHILD_PROCESS',
      name: '导入 child_process 模块',
      description: '禁止导入 child_process 模块（未声明权限时）',
      pattern: 'child_process',
      matchType: 'import',
      severity: 'error',
      requiredPermission: 'child_process',
      errorMessage:
        '禁止导入 child_process 模块（行 {line}）。需要声明 "child_process" 权限。',
      enabled: true,
    },
    {
      id: 'IMPORT_FS',
      name: '导入 fs 模块',
      description: '禁止导入 fs 模块（未声明权限时）',
      pattern: 'fs',
      matchType: 'import',
      severity: 'error',
      requiredPermission: 'filesystem.read',
      errorMessage:
        '禁止导入 fs 模块（行 {line}）。需要声明 "filesystem.read" 或 "filesystem.write" 权限。',
      enabled: true,
    },
    {
      id: 'IMPORT_HTTP',
      name: '导入 http 模块',
      description: '禁止导入 http 模块（未声明权限时）',
      pattern: 'http',
      matchType: 'import',
      severity: 'error',
      requiredPermission: 'network',
      errorMessage:
        '禁止导入 http 模块（行 {line}）。需要声明 "network" 权限。',
      enabled: true,
    },
    {
      id: 'IMPORT_HTTPS',
      name: '导入 https 模块',
      description: '禁止导入 https 模块（未声明权限时）',
      pattern: 'https',
      matchType: 'import',
      severity: 'error',
      requiredPermission: 'network',
      errorMessage:
        '禁止导入 https 模块（行 {line}）。需要声明 "network" 权限。',
      enabled: true,
    },

    // ========== 环境变量规则 ==========
    {
      id: 'PROCESS_ENV_ACCESS',
      name: 'process.env 访问',
      description: '禁止访问 process.env（环境变量）',
      pattern: 'process.env',
      matchType: 'variable_ref',
      severity: 'warning',
      requiredPermission: 'env.read',
      errorMessage:
        '禁止访问 process.env（行 {line}）。需要声明 "env.read" 权限。',
      enabled: true,
    },

    // ========== 更多文件系统规则 ==========
    {
      id: 'FS_ACCESS',
      name: 'fs.access 调用',
      description: '禁止直接调用 fs.access（检查文件访问权限）',
      pattern: 'fs.access',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'filesystem.read',
      errorMessage:
        '禁止调用 fs.access（行 {line}）。需要声明 "filesystem.read" 权限。',
      enabled: true,
    },
    {
      id: 'FS_STAT',
      name: 'fs.stat 调用',
      description: '禁止直接调用 fs.stat（获取文件状态）',
      pattern: 'fs.stat',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'filesystem.read',
      errorMessage:
        '禁止调用 fs.stat（行 {line}）。需要声明 "filesystem.read" 权限。',
      enabled: true,
    },
    {
      id: 'FS_READDIR',
      name: 'fs.readdir 调用',
      description: '禁止直接调用 fs.readdir（读取目录内容）',
      pattern: 'fs.readdir',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'filesystem.read',
      errorMessage:
        '禁止调用 fs.readdir（行 {line}）。需要声明 "filesystem.read" 权限。',
      enabled: true,
    },
    {
      id: 'FS_MKDIR',
      name: 'fs.mkdir 调用',
      description: '禁止直接调用 fs.mkdir（创建目录）',
      pattern: 'fs.mkdir',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'filesystem.write',
      errorMessage:
        '禁止调用 fs.mkdir（行 {line}）。需要声明 "filesystem.write" 权限。',
      enabled: true,
    },
    {
      id: 'FS_RENAME',
      name: 'fs.rename 调用',
      description: '禁止直接调用 fs.rename（重命名文件/目录）',
      pattern: 'fs.rename',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'filesystem.write',
      errorMessage:
        '禁止调用 fs.rename（行 {line}）。需要声明 "filesystem.write" 权限。',
      enabled: true,
    },
    {
      id: 'FS_COPY_FILE',
      name: 'fs.copyFile 调用',
      description: '禁止直接调用 fs.copyFile（复制文件）',
      pattern: 'fs.copyFile',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'filesystem.write',
      errorMessage:
        '禁止调用 fs.copyFile（行 {line}）。需要声明 "filesystem.write" 权限。',
      enabled: true,
    },

    // ========== 更多网络访问规则 ==========
    {
      id: 'NET_CREATE_SERVER',
      name: 'http.createServer 调用',
      description: '禁止直接调用 http.createServer（创建 HTTP 服务器）',
      pattern: 'http.createServer',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'network',
      errorMessage:
        '禁止调用 http.createServer（行 {line}）。需要声明 "network" 权限。',
      enabled: true,
    },
    {
      id: 'HTTPS_CREATE_SERVER',
      name: 'https.createServer 调用',
      description: '禁止直接调用 https.createServer（创建 HTTPS 服务器）',
      pattern: 'https.createServer',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'network',
      errorMessage:
        '禁止调用 https.createServer（行 {line}）。需要声明 "network" 权限。',
      enabled: true,
    },
    {
      id: 'NET_LISTEN',
      name: 'server.listen 调用',
      description: '禁止直接调用 server.listen（启动网络服务器）',
      pattern: '*.listen',
      matchType: 'function_call',
      severity: 'error',
      requiredPermission: 'network',
      errorMessage:
        '禁止调用 server.listen（行 {line}）。需要声明 "network" 权限。',
      enabled: true,
    },

    // ========== 操作系统相关规则 ==========
    {
      id: 'OS_PLATFORM',
      name: 'os.platform 访问',
      description: '禁止访问 os.platform（获取操作系统平台）',
      pattern: 'os.platform',
      matchType: 'variable_ref',
      severity: 'warning',
      requiredPermission: 'env.read',
      errorMessage:
        '禁止访问 os.platform（行 {line}）。需要声明 "env.read" 权限。',
      enabled: true,
    },
    {
      id: 'OS_HOMEDIR',
      name: 'os.homedir 访问',
      description: '禁止访问 os.homedir（获取用户主目录）',
      pattern: 'os.homedir',
      matchType: 'variable_ref',
      severity: 'error',
      requiredPermission: 'filesystem.read',
      errorMessage:
        '禁止访问 os.homedir（行 {line}）。需要声明 "filesystem.read" 权限。',
      enabled: true,
    },
    {
      id: 'IMPORT_OS',
      name: '导入 os 模块',
      description: '禁止导入 os 模块（未声明权限时）',
      pattern: 'os',
      matchType: 'import',
      severity: 'warning',
      requiredPermission: 'env.read',
      errorMessage:
        '禁止导入 os 模块（行 {line}）。需要声明 "env.read" 权限。',
      enabled: true,
    },
  ],
};

/**
 * 规则匹配器
 */
export class RuleMatcher {
  private rules: StaticCheckRule[];

  constructor(ruleSet: RuleSet = DEFAULT_RULE_SET) {
    this.rules = ruleSet.rules.filter((rule) => rule.enabled);
  }

  /**
   * 检查 API 是否匹配任何规则
   *
   * @param api - API 名称
   * @param matchType - 匹配类型
   * @param permissions - 当前声明的权限列表
   * @returns 匹配的规则列表
   */
  matchRules(
    api: string,
    matchType: RuleMatchType,
    permissions: string[] = []
  ): StaticCheckRule[] {
    return this.rules.filter((rule) => {
      // 检查匹配类型
      if (rule.matchType !== 'any' && rule.matchType !== matchType) {
        return false;
      }

      // 检查 API 模式
      if (!this.matchPattern(api, rule.pattern)) {
        return false;
      }

      // 检查权限
      if (rule.requiredPermission && permissions.includes(rule.requiredPermission)) {
        return false; // 已授权，不违规
      }

      return true;
    });
  }

  /**
   * 检查 API 是否匹配模式
   *
   * @param api - API 名称
   * @param pattern - 规则模式（支持通配符 *）
   * @returns 是否匹配
   */
  private matchPattern(api: string, pattern: string): boolean {
    // 精确匹配
    if (api === pattern) {
      return true;
    }

    // 通配符匹配
    if (pattern.includes('*')) {
      const regex = new RegExp(
        `^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`
      );
      return regex.test(api);
    }

    return false;
  }

  /**
   * 获取所有启用的规则
   */
  getRules(): StaticCheckRule[] {
    return [...this.rules];
  }

  /**
   * 按权限获取规则
   *
   * @param permission - 权限名称
   * @returns 需要该权限的规则列表
   */
  getRulesByPermission(permission: string): StaticCheckRule[] {
    return this.rules.filter((rule) => rule.requiredPermission === permission);
  }

  /**
   * 按严重级别获取规则
   *
   * @param severity - 严重级别
   * @returns 该级别的规则列表
   */
  getRulesBySeverity(severity: RuleSeverity): StaticCheckRule[] {
    return this.rules.filter((rule) => rule.severity === severity);
  }
}

/**
 * 创建规则匹配器
 */
export function createRuleMatcher(ruleSet?: RuleSet): RuleMatcher {
  return new RuleMatcher(ruleSet);
}
