/**
 * SchemaVersionManager
 * 
 * 管理 schema_version 的解析、单调性检查和健康检查比较。
 * 
 * Requirements: 6.2, 6.3, 6.5, 6.6, 7.5
 */

import type { ValidationResult } from './types.js';

/**
 * Schema 版本管理器
 * 
 * 职责：
 * 1. 解析 "MAJOR.MINOR" 格式的版本字符串
 * 2. publish 时校验 baseline 单调性（不得低于历史最高）
 * 3. 运行期健康检查：比较磁盘 schema_version 与代码 baseline
 */
export class SchemaVersionManager {
  /**
   * 当前 CLI 构建产物中嵌入的 baseline
   * 
   * 这是编译期常量，通过 build-time 注入（如 bun build --define）。
   * 默认值 "1.0"，运行期不读盘。
   */
  readonly baseline: string;

  /**
   * 构造函数
   * 
   * @param baseline - build-time 注入的 schema_version 基线，默认 "1.0"
   * 
   * 注意：构造器只赋值依赖句柄，不做 I/O（遵循 lessons-injected.md JS1）
   */
  constructor(baseline: string = '1.0') {
    this.baseline = baseline;
  }

  /**
   * 解析 "MAJOR.MINOR" 格式的版本字符串为元组
   * 
   * @param version - 版本字符串，如 "1.0", "1.10", "2.0"
   * @returns 元组 [MAJOR, MINOR]
   * @throws 如果格式非法（不是两个数字、包含非数字字符、空字符串等）
   * 
   * @example
   * parseTuple("1.0")   // [1, 0]
   * parseTuple("1.10")  // [1, 10]
   * parseTuple("2.0")   // [2, 0]
   * parseTuple("1")     // 抛错：格式非法
   * parseTuple("a.b")   // 抛错：非数字
   * parseTuple("")      // 抛错：空字符串
   */
  parseTuple(version: string): readonly [number, number] {
    if (!version || version.trim() === '') {
      throw new Error(`Invalid schema_version format: empty string`);
    }

    const parts = version.split('.');
    
    if (parts.length !== 2) {
      throw new Error(
        `Invalid schema_version format: "${version}" (expected "MAJOR.MINOR" with exactly one dot)`
      );
    }

    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);

    // 检查是否为有效数字（parseInt 对 "a" 返回 NaN）
    if (isNaN(major) || isNaN(minor)) {
      throw new Error(
        `Invalid schema_version format: "${version}" (MAJOR and MINOR must be integers)`
      );
    }

    // 检查是否有非数字字符（如 "1.0a" 会被 parseInt 解析为 1.0，但不合法）
    if (parts[0] !== String(major) || parts[1] !== String(minor)) {
      throw new Error(
        `Invalid schema_version format: "${version}" (contains non-numeric characters)`
      );
    }

    return [major, minor] as const;
  }

  /**
   * publish 时校验：candidateBaseline 的 (MAJOR, MINOR) 不得低于 highestPublished
   * 
   * 用法：流水线在 publish 前调用，返回的 ValidationResult 决定是否退出非零。
   * 
   * @param candidateBaseline - 候选的新 baseline（即将发布的版本）
   * @param highestPublished - 历史上已发布的最高 baseline，null 表示首次发布
   * @returns ValidationResult，isValid=false 时包含错误详情
   * 
   * 规则：
   * - highestPublished === null → 允许（首次发布）
   * - candidateBaseline >= highestPublished → 允许（单调递增或相等）
   * - candidateBaseline < highestPublished → 拒绝（违反单调性）
   * 
   * @example
   * assertMonotonic("1.0", null)      // { isValid: true }  首次发布
   * assertMonotonic("1.1", "1.0")     // { isValid: true }  升级
   * assertMonotonic("2.0", "1.10")    // { isValid: true }  大版本升级
   * assertMonotonic("1.0", "1.1")     // { isValid: false } 降级，拒绝
   * assertMonotonic("1.0", "2.0")     // { isValid: false } 降级，拒绝
   */
  assertMonotonic(
    candidateBaseline: string,
    highestPublished: string | null
  ): ValidationResult {
    // 首次发布，无历史基线，直接允许
    if (highestPublished === null) {
      return {
        isValid: true,
        errors: [],
        warnings: [],
      };
    }

    try {
      const candidate = this.parseTuple(candidateBaseline);
      const highest = this.parseTuple(highestPublished);

      // Tuple 比较：先比 MAJOR，再比 MINOR
      const [candidateMajor, candidateMinor] = candidate;
      const [highestMajor, highestMinor] = highest;

      // 候选版本 >= 历史最高版本 → 允许
      if (
        candidateMajor > highestMajor ||
        (candidateMajor === highestMajor && candidateMinor >= highestMinor)
      ) {
        return {
          isValid: true,
          errors: [],
          warnings: [],
        };
      }

      // 候选版本 < 历史最高版本 → 拒绝（违反单调性）
      return {
        isValid: false,
        errors: [
          {
            code: 'PUBLISH_BASELINE_DOWNGRADE',
            field: 'schema_version',
            message: `Schema version downgrade detected: candidate baseline "${candidateBaseline}" (${candidateMajor}.${candidateMinor}) is lower than highest published baseline "${highestPublished}" (${highestMajor}.${highestMinor}). Schema versions must be monotonically increasing.`,
          },
        ],
        warnings: [],
      };
    } catch (error) {
      // 解析失败（格式非法）
      return {
        isValid: false,
        errors: [
          {
            code: 'PUBLISH_VALIDATION',
            field: 'schema_version',
            message: `Failed to parse schema_version: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        warnings: [],
      };
    }
  }

  /**
   * 运行期 byte-for-byte 比较（健康检查）
   * 
   * 用于 daemon 启动时检查磁盘 schema_version 与代码 baseline 是否一致。
   * 
   * @param diskValue - 磁盘上读取的 schema_version（来自 ~/.specforge/.installation.json）
   * @param baseline - 代码中嵌入的 baseline（通常是 this.baseline）
   * @returns 三态结果：
   *   - "equal": 完全相等，放行
   *   - "code_higher": 代码 baseline > 磁盘值，提示运行 migration
   *   - "code_lower": 代码 baseline < 磁盘值，拒绝降级（"downgrade not supported"）
   * 
   * 注意：这是 **byte-for-byte 字符串比较** + tuple 比较的组合：
   * - 先做字符串相等性检查（快速路径）
   * - 不相等时再解析 tuple 比较大小
   * 
   * @example
   * compareForHealthCheck("1.0", "1.0")   // "equal"
   * compareForHealthCheck("1.0", "1.1")   // "code_higher"（代码更新，需要迁移）
   * compareForHealthCheck("1.1", "1.0")   // "code_lower"（降级，拒绝）
   * compareForHealthCheck("2.0", "1.10")  // "code_higher"
   */
  compareForHealthCheck(
    diskValue: string,
    baseline: string
  ): 'equal' | 'code_higher' | 'code_lower' {
    // 快速路径：byte-for-byte 相等
    if (diskValue === baseline) {
      return 'equal';
    }

    try {
      const disk = this.parseTuple(diskValue);
      const code = this.parseTuple(baseline);

      const [diskMajor, diskMinor] = disk;
      const [codeMajor, codeMinor] = code;

      // 代码 baseline > 磁盘值 → 需要运行 migration
      if (
        codeMajor > diskMajor ||
        (codeMajor === diskMajor && codeMinor > diskMinor)
      ) {
        return 'code_higher';
      }

      // 代码 baseline < 磁盘值 → 降级，不支持
      if (
        codeMajor < diskMajor ||
        (codeMajor === diskMajor && codeMinor < diskMinor)
      ) {
        return 'code_lower';
      }

      // 理论上不应到达这里（已经在开头检查了相等性）
      // 但为了类型安全，返回 equal
      return 'equal';
    } catch (error) {
      // 解析失败时，保守处理：视为不相等且代码更高（触发 migration 提示）
      // 这样用户会看到错误信息，而不是静默失败
      return 'code_higher';
    }
  }
}
