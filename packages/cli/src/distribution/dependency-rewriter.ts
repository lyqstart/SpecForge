/**
 * DependencyRewriter（发布期）
 * 
 * 职责：将 package.json 中的 workspace:* 依赖重写为精确版本号。
 * 
 * Requirements: 1.4
 */

import type { ParsedPackageJson } from './types';

/**
 * 将 dependencies/devDependencies 中所有 workspace:* 改写为精确版本。
 * 
 * @param pkg - 解析后的 package.json 对象
 * @param versionMap - 包名 → 精确版本的映射表
 * @returns 新的 ParsedPackageJson 对象（不 mutate 输入）
 * @throws Error 当 workspace:* 依赖未在 versionMap 中找到时
 * 
 * @example
 * ```ts
 * const pkg = {
 *   schema_version: "1.0",
 *   name: "@specforge/cli",
 *   version: "6.0.0",
 *   dependencies: {
 *     "@specforge/daemon-core": "workspace:*",
 *     "lodash": "^4.17.21"
 *   }
 * };
 * 
 * const versionMap = new Map([
 *   ["@specforge/daemon-core", "6.0.0"]
 * ]);
 * 
 * const rewritten = rewrite(pkg, versionMap);
 * // rewritten.dependencies["@specforge/daemon-core"] === "6.0.0"
 * // rewritten.dependencies["lodash"] === "^4.17.21"
 * ```
 */
export function rewrite(
  pkg: ParsedPackageJson,
  versionMap: ReadonlyMap<string, string>
): ParsedPackageJson {
  // 深拷贝输入对象，避免 mutate
  const result: ParsedPackageJson = {
    ...pkg,
    dependencies: pkg.dependencies ? { ...pkg.dependencies } : undefined,
    devDependencies: pkg.devDependencies ? { ...pkg.devDependencies } : undefined,
  };

  // 处理 dependencies
  if (result.dependencies) {
    for (const [depName, depVersion] of Object.entries(result.dependencies)) {
      if (depVersion === 'workspace:*') {
        const exactVersion = versionMap.get(depName);
        if (!exactVersion) {
          throw new Error(
            `Workspace dependency "${depName}" not found in version map. ` +
            `Available packages: ${Array.from(versionMap.keys()).join(', ')}`
          );
        }
        result.dependencies[depName] = exactVersion;
      }
    }
  }

  // 处理 devDependencies
  if (result.devDependencies) {
    for (const [depName, depVersion] of Object.entries(result.devDependencies)) {
      if (depVersion === 'workspace:*') {
        const exactVersion = versionMap.get(depName);
        if (!exactVersion) {
          throw new Error(
            `Workspace dependency "${depName}" not found in version map. ` +
            `Available packages: ${Array.from(versionMap.keys()).join(', ')}`
          );
        }
        result.devDependencies[depName] = exactVersion;
      }
    }
  }

  return result;
}
