/**
 * PluginManifest 接口定义
 *
 * 描述一个插件的清单数据模型。本文件是任务 1.2.1 的核心交付物，字段约定遵循
 * REQ-18 持久化字段规范（必带 schema_version）和 design.md 中 Property 28
 * 对插件清单的要求。
 */

/** 插件可声明的标准权限名称（粗粒度，参见 design.md ADR-PL-002） */
export type PluginPermission =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'network'
  | 'child_process'
  | 'env.read';

/** 可选元信息——与"加载/校验语义"无关的纯描述性字段都放这 */
export interface PluginManifestMetadata {
  /** 一句话描述（≤ 200 字符建议） */
  description?: string;
  /** 作者署名 */
  author?: string;
  /** SPDX 许可证标识（如 "MIT"、"Apache-2.0"） */
  license?: string;
}

/**
 * 插件清单（核心数据模型）
 *
 * 必填字段（缺一即拒绝加载）：
 *   - schema_version: 必须是字面量 "1.0"，便于将来通过 Migration Subsystem 演进
 *   - id:             插件唯一标识符（推荐 kebab-case，例 "specforge-github"）
 *   - name:           人类可读的展示名
 *   - version:        语义化版本号（semver，例 "1.2.3"、"1.0.0-beta.1"）
 *   - entry:          入口文件相对路径（相对插件根目录，例 "./dist/index.js"）
 *
 * 可选字段：
 *   - permissions:    声明的权限列表，用于与当前 grants 集合做差集判断
 *   - dependencies:   依赖的其他插件 id → 版本约束（semver range）
 *   - metadata:       描述性信息容器
 */
export interface PluginManifest {
  schema_version: '1.0';
  id: string;
  name: string;
  version: string;
  entry: string;
  permissions?: string[];
  dependencies?: Record<string, string>;
  metadata?: PluginManifestMetadata;
}

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/**
 * 严格 semver 正则。
 * 匹配 X.Y.Z[-prerelease][+build]，X/Y/Z 都是非负整数（允许 0 但禁止前导 0）。
 *
 * 来源：https://semver.org 官方推荐正则（节选其完整版以方便阅读）
 */
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*))*))?(?:\+([\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*))?$/;

/** 判断 obj 是否是非空、非数组的普通对象 */
function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

/** 判断字符串是否符合 semver 规范 */
export function isValidSemver(version: unknown): version is string {
  return typeof version === 'string' && SEMVER_RE.test(version);
}

// ---------------------------------------------------------------------------
// 类型守卫
// ---------------------------------------------------------------------------

/**
 * 校验 x 是否是合法的 PluginManifest。
 *
 * 校验规则：
 *   1. 必须是普通对象（非 null、非数组、非基本类型）
 *   2. schema_version 必须严格等于字符串 "1.0"
 *   3. id / name / entry 必须是非空字符串
 *   4. version 必须是符合 semver 规范的字符串
 *   5. permissions（如有）必须是字符串数组
 *   6. dependencies（如有）必须是 Record<string, string>
 *   7. metadata（如有）必须是普通对象，其内部三个字段（如有）都是字符串
 *
 * 注意：本函数只做"形状 + 字面量值"校验。授权是否充足、entry 路径是否真实存在
 * 等运行时检查由 ManifestParser / AuthValidator 负责，不在守卫职责内。
 */
export function isPluginManifest(x: unknown): x is PluginManifest {
  if (!isPlainObject(x)) return false;

  // 必填：schema_version 必须严格等于 "1.0"
  if (x['schema_version'] !== '1.0') return false;

  // 必填：字符串类字段
  if (typeof x['id'] !== 'string' || x['id'].length === 0) return false;
  if (typeof x['name'] !== 'string' || x['name'].length === 0) return false;
  if (typeof x['entry'] !== 'string' || x['entry'].length === 0) return false;

  // 必填：version 必须是 semver
  if (!isValidSemver(x['version'])) return false;

  // 可选：permissions 必须是字符串数组
  if (x['permissions'] !== undefined) {
    if (!Array.isArray(x['permissions'])) return false;
    if (!x['permissions'].every((p) => typeof p === 'string')) return false;
  }

  // 可选：dependencies 必须是 Record<string, string>
  if (x['dependencies'] !== undefined) {
    if (!isPlainObject(x['dependencies'])) return false;
    for (const v of Object.values(x['dependencies'])) {
      if (typeof v !== 'string') return false;
    }
  }

  // 可选：metadata 必须是普通对象，内部三个字段（如有）必须是字符串
  if (x['metadata'] !== undefined) {
    if (!isPlainObject(x['metadata'])) return false;
    const meta = x['metadata'];
    if (meta['description'] !== undefined && typeof meta['description'] !== 'string') return false;
    if (meta['author'] !== undefined && typeof meta['author'] !== 'string') return false;
    if (meta['license'] !== undefined && typeof meta['license'] !== 'string') return false;
  }

  return true;
}
