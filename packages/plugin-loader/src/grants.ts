/**
 * GrantsConfig 接口定义（任务 1.2.2 核心交付物）
 *
 * 描述用户级 / 项目级 / 运行时层授予给插件的权限配置。本文件与 `manifest.ts`
 * （任务 1.2.1）配套，构成一对"插件声明 → 系统授予"的对偶模型：
 *
 *   - PluginManifest.permissions: 插件声明它"想要"哪些权限
 *   - GrantsConfig.grantedPermissions: 当前层级"实际授予"了哪些权限
 *
 * 字段约定：
 *   - schema_version: 必带 "1.0"，符合 REQ-18 持久化规范
 *   - grantedPermissions: 该层授予的权限列表（粒度见 ADR-PL-002）
 *   - comment / audit: 可选注释 / 审计字段，便于追踪"谁、何时、在哪一层"做的授权
 *
 * 四层合并语义（design.md §「与 Configuration Subsystem 集成」）：
 *   Layer 1: 内置默认（空集合）
 *   Layer 2: 用户级（~/.specforge/）
 *   Layer 3: 项目级（<project>/.specforge/）
 *   Layer 4: 运行时（CLI/API）
 */

import type { PluginPermission } from './manifest';

// ---------------------------------------------------------------------------
// 接口
// ---------------------------------------------------------------------------

/** 审计字段——便于追踪"谁、何时、在哪一层"做的授权 */
export interface GrantsAudit {
  /** 谁授予的（用户名 / 系统标识） */
  grantedBy?: string;
  /** 何时授予的（ISO 8601 时间戳） */
  grantedAt?: string;
  /** 授权来源层 */
  source?: 'default' | 'user' | 'project' | 'runtime';
}

/**
 * 授予配置（核心数据模型）
 *
 * 必填字段：
 *   - schema_version: 必须严格等于字面量 "1.0"
 *   - grantedPermissions: 已授予的权限列表（允许为空数组）
 *
 * 可选字段：
 *   - comment: 自由文本注释（说明为什么这么授权）
 *   - audit: 审计上下文
 */
export interface GrantsConfig {
  schema_version: '1.0';
  grantedPermissions: PluginPermission[];
  comment?: string;
  audit?: GrantsAudit;
}

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/** 合法的 PluginPermission 取值集合（与 manifest.ts 保持一致） */
const VALID_PERMISSIONS: ReadonlySet<string> = new Set<PluginPermission>([
  'filesystem.read',
  'filesystem.write',
  'network',
  'child_process',
  'env.read',
]);

/** 判断 obj 是否是非空、非数组的普通对象 */
function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

// ---------------------------------------------------------------------------
// 类型守卫
// ---------------------------------------------------------------------------

/**
 * 校验 x 是否是合法的 GrantsConfig。
 *
 * 校验规则：
 *   1. 必须是普通对象
 *   2. schema_version 必须严格等于字符串 "1.0"
 *   3. grantedPermissions 必须是数组，且每个元素都是已知 PluginPermission
 *   4. comment（如有）必须是字符串
 *   5. audit（如有）必须是普通对象，其内部字段（如有）形状正确
 */
export function isGrantsConfig(x: unknown): x is GrantsConfig {
  if (!isPlainObject(x)) return false;

  if (x['schema_version'] !== '1.0') return false;

  if (!Array.isArray(x['grantedPermissions'])) return false;
  for (const p of x['grantedPermissions']) {
    if (typeof p !== 'string') return false;
    if (!VALID_PERMISSIONS.has(p)) return false;
  }

  if (x['comment'] !== undefined && typeof x['comment'] !== 'string') return false;

  if (x['audit'] !== undefined) {
    if (!isPlainObject(x['audit'])) return false;
    const audit = x['audit'];
    if (audit['grantedBy'] !== undefined && typeof audit['grantedBy'] !== 'string') return false;
    if (audit['grantedAt'] !== undefined && typeof audit['grantedAt'] !== 'string') return false;
    if (audit['source'] !== undefined) {
      if (typeof audit['source'] !== 'string') return false;
      if (
        audit['source'] !== 'default' &&
        audit['source'] !== 'user' &&
        audit['source'] !== 'project' &&
        audit['source'] !== 'runtime'
      ) {
        return false;
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// 四层合并
// ---------------------------------------------------------------------------

/**
 * mergeGrants 抛出的错误类型（schema_version 不一致时）
 */
export class GrantsSchemaVersionMismatchError extends Error {
  constructor(public readonly expected: string, public readonly actual: unknown) {
    super(
      `mergeGrants: schema_version 不一致（期望 "${expected}"，实际 ${JSON.stringify(actual)}）`,
    );
    this.name = 'GrantsSchemaVersionMismatchError';
  }
}

/** 默认空授予配置（Layer 1：内置默认） */
function defaultGrants(): GrantsConfig {
  return { schema_version: '1.0', grantedPermissions: [] };
}

/**
 * 按四层配置合并多份 GrantsConfig（后者覆盖前者；权限取并集）。
 *
 * 调用约定：
 *   mergeGrants(layer1, layer2, layer3, layer4)
 *   ↑ 索引大者优先级高
 *
 * 合并规则：
 *   - 0 个参数：返回默认空配置
 *   - 1 个参数：返回该参数的浅拷贝（grantedPermissions 已去重）
 *   - 多参数：
 *     * grantedPermissions：所有参数的并集（保持首次出现顺序去重，便于稳定快照）
 *     * comment：最后一个定义了该字段的参数的值（last-wins）
 *     * audit：最后一个定义了该字段的参数的值整体替换（不做深合并）
 *     * schema_version：所有参数必须一致，否则抛 GrantsSchemaVersionMismatchError
 */
export function mergeGrants(...configs: GrantsConfig[]): GrantsConfig {
  if (configs.length === 0) {
    return defaultGrants();
  }

  // 1) schema_version 一致性校验
  const expectedVersion = configs[0]!.schema_version;
  for (let i = 1; i < configs.length; i++) {
    if (configs[i]!.schema_version !== expectedVersion) {
      throw new GrantsSchemaVersionMismatchError(expectedVersion, configs[i]!.schema_version);
    }
  }

  // 2) grantedPermissions：保持首次出现顺序的并集去重
  const seen = new Set<PluginPermission>();
  const mergedPermissions: PluginPermission[] = [];
  for (const cfg of configs) {
    for (const p of cfg.grantedPermissions) {
      if (!seen.has(p)) {
        seen.add(p);
        mergedPermissions.push(p);
      }
    }
  }

  // 3) comment / audit：last-wins
  let mergedComment: string | undefined;
  let mergedAudit: GrantsAudit | undefined;
  for (const cfg of configs) {
    if (cfg.comment !== undefined) mergedComment = cfg.comment;
    if (cfg.audit !== undefined) mergedAudit = cfg.audit;
  }

  // 4) 组装结果（可选字段不写出 undefined，保持序列化干净）
  const result: GrantsConfig = {
    schema_version: expectedVersion,
    grantedPermissions: mergedPermissions,
  };
  if (mergedComment !== undefined) result.comment = mergedComment;
  if (mergedAudit !== undefined) result.audit = mergedAudit;
  return result;
}