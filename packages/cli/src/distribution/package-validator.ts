/**
 * PackageValidator - 发布流水线包验证器
 * 
 * 职责：验证 package.json 的格式和内容，确保符合发布要求
 * Requirements: 1.1, 1.2, 1.3, 1.6, 2.3, 6.1
 */

import type {
  ParsedPackageJson,
  ValidationContext,
  ValidationResult,
  ValidationError,
} from './types.js';

/**
 * 必需字段常量集合
 * REQ-1.2: 所有可发布包必须包含这些字段
 */
const REQUIRED_FIELDS = [
  'name',
  'version',
  'description',
  'main',
  'types',
  'files',
  'license',
  'repository',
  'schema_version',
] as const;

/**
 * 包名正则：必须是 @specforge/<module> 格式
 * REQ-1.1: 包名格式约束
 */
const PACKAGE_NAME_PATTERN = /^@specforge\/[a-z][a-z0-9-]*$/;

/**
 * 必需的 engines 配置
 * REQ-1.3: 严格等于这些值
 */
const REQUIRED_ENGINES = {
  node: '>=20',
  bun: '>=1.0',
} as const;

/**
 * 验证一个候选包的 package.json
 * 
 * @param pkg - 解析后的 package.json 对象
 * @param ctx - 验证上下文（模式、版本映射等）
 * @returns 验证结果，包含错误列表和警告
 */
export function validate(
  pkg: ParsedPackageJson,
  ctx: ValidationContext
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // 特殊处理：private: true 的包跳过验证
  if (pkg.private === true) {
    return {
      isValid: true,
      errors: [],
      warnings: ['Package is private, skipping validation'],
    };
  }

  // 1. 验证包名格式 (REQ-1.1)
  if (!PACKAGE_NAME_PATTERN.test(pkg.name)) {
    errors.push({
      code: 'NAME_FORMAT',
      field: 'name',
      message: `Package name "${pkg.name}" does not match required pattern ^@specforge/[a-z][a-z0-9-]*$`,
    });
  }

  // 2. 验证必需字段 (REQ-1.2)
  for (const field of REQUIRED_FIELDS) {
    const value = pkg[field as keyof ParsedPackageJson];
    if (value === undefined || value === null || value === '') {
      errors.push({
        code: 'MISSING_FIELD',
        field,
        message: `Required field "${field}" is missing or empty`,
      });
    }
  }

  // 3. 验证 engines.node (REQ-1.3)
  if (pkg.engines?.node !== REQUIRED_ENGINES.node) {
    errors.push({
      code: 'ENGINES_NODE',
      field: 'engines.node',
      message: `engines.node must be exactly "${REQUIRED_ENGINES.node}", got "${pkg.engines?.node ?? 'undefined'}"`,
    });
  }

  // 4. 验证 engines.bun (REQ-1.3)
  if (pkg.engines?.bun !== REQUIRED_ENGINES.bun) {
    errors.push({
      code: 'ENGINES_BUN',
      field: 'engines.bun',
      message: `engines.bun must be exactly "${REQUIRED_ENGINES.bun}", got "${pkg.engines?.bun ?? 'undefined'}"`,
    });
  }

  // 5. publish 模式下的依赖检查 (REQ-2.3)
  if (ctx.mode === 'publish') {
    // 检查 dependencies
    if (pkg.dependencies) {
      for (const [depName, depVersion] of Object.entries(pkg.dependencies)) {
        if (depName.startsWith('@specforge/')) {
          const validationError = validateSpecforgeDependency(
            depName,
            depVersion,
            'dependencies',
            ctx
          );
          if (validationError) {
            errors.push(validationError);
          }
        }
      }
    }

    // 检查 devDependencies
    if (pkg.devDependencies) {
      for (const [depName, depVersion] of Object.entries(pkg.devDependencies)) {
        if (depName.startsWith('@specforge/')) {
          const validationError = validateSpecforgeDependency(
            depName,
            depVersion,
            'devDependencies',
            ctx
          );
          if (validationError) {
            errors.push(validationError);
          }
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证 @specforge/* 依赖的版本格式
 * 
 * publish 模式下必须是精确的 MAJOR.MINOR.PATCH 格式
 * 禁止：^, ~, *, x, range, dist-tag, git, file
 * 
 * @param depName - 依赖包名
 * @param depVersion - 依赖版本字符串
 * @param depType - 依赖类型（dependencies 或 devDependencies）
 * @param ctx - 验证上下文
 * @returns 验证错误，如果验证通过则返回 null
 */
function validateSpecforgeDependency(
  depName: string,
  depVersion: string,
  depType: 'dependencies' | 'devDependencies',
  ctx: ValidationContext
): ValidationError | null {
  const field = `${depType}.${depName}`;

  // 检查是否还是 workspace:* 未改写
  if (depVersion.startsWith('workspace:')) {
    return {
      code: 'WORKSPACE_NOT_REWRITTEN',
      field,
      message: `Dependency "${depName}" still uses workspace protocol "${depVersion}" in publish mode. Must be rewritten to exact version.`,
    };
  }

  // 检查是否包含禁止的范围符号
  const forbiddenPatterns = [
    { pattern: /^[\^~]/, name: 'caret/tilde range' },
    { pattern: /^\*$|^x$/i, name: 'wildcard' },
    { pattern: /[<>=]/, name: 'comparator range' },
    { pattern: /^(latest|next|beta|alpha|canary)$/i, name: 'dist-tag' },
    { pattern: /^git\+|\.git($|#)/, name: 'git specifier' },
    { pattern: /^file:|^\.\.?\//, name: 'file specifier' },
  ];

  for (const { pattern, name } of forbiddenPatterns) {
    if (pattern.test(depVersion)) {
      return {
        code: 'DEP_RANGE_FORBIDDEN',
        field,
        message: `Dependency "${depName}" uses forbidden ${name} in version "${depVersion}". Must be exact MAJOR.MINOR.PATCH.`,
      };
    }
  }

  // 检查是否是精确的 MAJOR.MINOR.PATCH 格式
  // 允许 prerelease 和 build metadata (SemVer 2.0.0)
  const exactVersionPattern = /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
  
  if (!exactVersionPattern.test(depVersion)) {
    return {
      code: 'DEP_VERSION_NOT_PINNED',
      field,
      message: `Dependency "${depName}" version "${depVersion}" is not a pinned MAJOR.MINOR.PATCH format.`,
    };
  }

  return null;
}
