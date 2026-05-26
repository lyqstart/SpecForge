/**
 * Default Configuration Generator
 * 
 * Generates the default config.yaml for fresh installations by:
 * 1. Building a base configuration from the configuration spec
 * 2. Injecting schema_version: "1.0" at the top
 * 3. Setting all P1/P2 feature flags to false (Property 15)
 * 
 * Requirements: 4.2, 4.5
 * Property: 15 (Scope Boundary - P1/P2 flags default to false)
 */

import { DEFAULT_CONFIG, CONFIG_SCHEMA_VERSION } from '@specforge/configuration';
import scopeGateExports from './scope-gate-bridge';

/**
 * 生成默认配置 YAML 字符串
 * 
 * 此函数是 `specforge init` 写入 ~/.specforge/config/config.yaml 的唯一来源。
 * 
 * 流程：
 * 1. 从 @specforge/configuration 获取默认配置对象
 * 2. 强制注入 schema_version: "1.0" 到顶部
 * 3. 遍历 ScopeGateExports.p1p2FlagKeys，将每个 flag 设置为 false
 * 4. 序列化为 YAML 字符串
 * 
 * 约束：
 * - schema_version 必须在文件顶部（第一个键）
 * - 所有 P1/P2 flags 必须显式设置为 false（Property 15）
 * - 输出必须是合法的 YAML（可被 yaml parser 解析）
 * 
 * @returns YAML 字符串，供 FilesystemAdapter.writeAtomic 写入
 * @throws 如果无法获取 P1/P2 flag 列表或序列化失败
 */
export function generateDefaultConfig(): string {
  try {
    // 1. 获取基础配置对象（来自 configuration spec）
    const baseConfig = { ...DEFAULT_CONFIG };
    
    // 2. 强制注入 schema_version 到顶部
    // 使用对象字面量确保 schema_version 是第一个键
    const configWithSchema = {
      schema_version: CONFIG_SCHEMA_VERSION,
      ...baseConfig,
    };
    
    // 3. 获取所有 P1/P2 feature flag keys
    const p1p2FlagKeys = scopeGateExports.p1p2FlagKeys;
    
    // 4. 将所有 P1/P2 flags 设置为 false
    // 这是 Property 15（Scope Boundary）的核心实现
    for (const flagKey of p1p2FlagKeys) {
      (configWithSchema as Record<string, unknown>)[flagKey] = false;
    }
    
    // 5. 序列化为 YAML 字符串
    const yamlString = serializeToYaml(configWithSchema);
    
    return yamlString;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to generate default configuration: ${message}. ` +
      `This is a critical error as it prevents creating ~/.specforge/config/config.yaml.`
    );
  }
}

/**
 * 将配置对象序列化为 YAML 字符串
 * 
 * 实现注意事项：
 * - 保持键的顺序（schema_version 必须在顶部）
 * - 使用 2 空格缩进（YAML 标准）
 * - 布尔值使用 true/false（不是 yes/no）
 * - 字符串值需要适当引号（避免歧义）
 * 
 * @param config - 配置对象
 * @returns YAML 字符串
 */
function serializeToYaml(config: Record<string, unknown>): string {
  const lines: string[] = [];
  
  // 遍历配置对象的所有键
  for (const [key, value] of Object.entries(config)) {
    const yamlLine = serializeKeyValue(key, value, 0);
    lines.push(yamlLine);
  }
  
  // 末尾添加换行符（POSIX 标准）
  return lines.join('\n') + '\n';
}

/**
 * 序列化单个键值对为 YAML 格式
 * 
 * @param key - 键名
 * @param value - 值
 * @param indentLevel - 缩进级别（0 = 顶层）
 * @returns YAML 格式的字符串
 */
function serializeKeyValue(key: string, value: unknown, indentLevel: number): string {
  const indent = '  '.repeat(indentLevel);
  
  // 处理不同类型的值
  if (value === null || value === undefined) {
    return `${indent}${key}: null`;
  }
  
  if (typeof value === 'boolean') {
    return `${indent}${key}: ${value}`;
  }
  
  if (typeof value === 'number') {
    return `${indent}${key}: ${value}`;
  }
  
  if (typeof value === 'string') {
    // 字符串需要引号（避免 YAML 解析歧义）
    const escapedValue = value.replace(/"/g, '\\"');
    return `${indent}${key}: "${escapedValue}"`;
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${indent}${key}: []`;
    }
    
    // 数组元素，每个元素一行
    const arrayLines = [`${indent}${key}:`];
    for (const item of value) {
      if (typeof item === 'string') {
        const escapedItem = item.replace(/"/g, '\\"');
        arrayLines.push(`${indent}  - "${escapedItem}"`);
      } else {
        arrayLines.push(`${indent}  - ${JSON.stringify(item)}`);
      }
    }
    return arrayLines.join('\n');
  }
  
  if (typeof value === 'object' && value !== null) {
    // 嵌套对象
    const nestedLines = [`${indent}${key}:`];
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      const nestedLine = serializeKeyValue(nestedKey, nestedValue, indentLevel + 1);
      nestedLines.push(nestedLine);
    }
    return nestedLines.join('\n');
  }
  
  // 兜底：使用 JSON 序列化
  return `${indent}${key}: ${JSON.stringify(value)}`;
}

/**
 * 验证生成的 YAML 是否符合要求
 * 
 * 此函数用于测试和调试，确保生成的 YAML：
 * 1. schema_version 在第一行
 * 2. 所有 P1/P2 flags 都存在且为 false
 * 
 * @param yamlString - 生成的 YAML 字符串
 * @returns 验证结果
 */
export function validateGeneratedYaml(yamlString: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // 检查 schema_version 是否在第一行
  const lines = yamlString.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    errors.push('Generated YAML is empty');
    return { isValid: false, errors };
  }
  
  const firstLine = lines[0];
  if (!firstLine.startsWith('schema_version:')) {
    errors.push(`First line must be 'schema_version:', got: ${firstLine}`);
  }
  
  // 检查 schema_version 的值
  const schemaVersionMatch = firstLine.match(/schema_version:\s*"?([^"\s]+)"?/);
  if (!schemaVersionMatch || schemaVersionMatch[1] !== CONFIG_SCHEMA_VERSION) {
    errors.push(
      `schema_version must be "${CONFIG_SCHEMA_VERSION}", got: ${schemaVersionMatch?.[1] || 'none'}`
    );
  }
  
  // 检查所有 P1/P2 flags 是否存在且为 false
  const p1p2FlagKeys = scopeGateExports.p1p2FlagKeys;
  for (const flagKey of p1p2FlagKeys) {
    const flagPattern = new RegExp(`^${flagKey}:\\s*false\\s*$`, 'm');
    if (!flagPattern.test(yamlString)) {
      errors.push(`P1/P2 flag '${flagKey}' must be set to false`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 默认导出：生成默认配置的主函数
 */
export default generateDefaultConfig;

