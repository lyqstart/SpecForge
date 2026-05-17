/**
 * SourceAnalyzer - 基础源码分析器
 *
 * 职责：对插件源码进行静态分析，检测 API 使用情况。
 * 支持：
 *   - 函数调用检测（如 child_process.exec）
 *   - 导入语句检测（如 require('http')）
 *   - 变量引用检测（如 fs.readFile）
 *
 * 实现策略：
 *   - 使用正则表达式进行快速模式匹配（P0 阶段）
 *   - 支持 TypeScript/JavaScript 源码
 *   - 返回详细的检测报告（行号、列号、API 名称）
 *
 * 注意：本实现为 P0 基础版本，使用正则表达式而非完整 AST 解析。
 * 完整 AST 解析可在 P2 阶段优化。
 */

/**
 * API 使用检测结果
 */
export interface ApiUsage {
  /** API 名称（如 'child_process.exec'） */
  api: string;
  /** 检测到的行号（1-indexed） */
  line: number;
  /** 检测到的列号（0-indexed） */
  column: number;
  /** 完整的匹配文本 */
  text: string;
  /** API 类型：'function_call' | 'import' | 'variable_ref' */
  type: 'function_call' | 'import' | 'variable_ref';
}

/**
 * 源码分析结果
 */
export interface SourceAnalysisResult {
  /** 是否分析成功 */
  success: boolean;
  /** 检测到的所有 API 使用 */
  apiUsages: ApiUsage[];
  /** 分析过程中的错误信息（如有） */
  error?: string;
}

/**
 * 源码分析器
 */
export class SourceAnalyzer {
  /**
   * 分析源码，检测 API 使用
   *
   * @param source - 源码内容
   * @param filePath - 文件路径（用于错误报告）
   * @returns 分析结果
   */
  analyzeSource(source: string, filePath: string): SourceAnalysisResult {
    try {
      const apiUsages: ApiUsage[] = [];

      // 1. 检测导入语句
      apiUsages.push(...this.detectImports(source));

      // 2. 检测函数调用
      apiUsages.push(...this.detectFunctionCalls(source));

      // 3. 检测变量引用
      apiUsages.push(...this.detectVariableReferences(source));

      return {
        success: true,
        apiUsages,
      };
    } catch (error) {
      return {
        success: false,
        apiUsages: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 检测导入语句
   * 支持：
   *   - require('module')
   *   - import ... from 'module'
   *   - import('module')
   */
  private detectImports(source: string): ApiUsage[] {
    const usages: ApiUsage[] = [];
    const lines = source.split('\n');

    // 正则表达式模式
    const requirePattern = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    const importFromPattern = /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g;
    const dynamicImportPattern = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

    lines.forEach((line, lineIndex) => {
      const lineNum = lineIndex + 1;

      // 检测 require()
      let match;
      while ((match = requirePattern.exec(line)) !== null) {
        usages.push({
          api: match[1],
          line: lineNum,
          column: match.index,
          text: match[0],
          type: 'import',
        });
      }

      // 检测 import ... from
      while ((match = importFromPattern.exec(line)) !== null) {
        usages.push({
          api: match[1],
          line: lineNum,
          column: match.index,
          text: match[0],
          type: 'import',
        });
      }

      // 检测动态 import()
      while ((match = dynamicImportPattern.exec(line)) !== null) {
        usages.push({
          api: match[1],
          line: lineNum,
          column: match.index,
          text: match[0],
          type: 'import',
        });
      }
    });

    return usages;
  }

  /**
   * 检测函数调用
   * 支持：
   *   - module.method()
   *   - module.submodule.method()
   *   - 全局函数调用
   */
  private detectFunctionCalls(source: string): ApiUsage[] {
    const usages: ApiUsage[] = [];
    const lines = source.split('\n');

    // 匹配模式：identifier.identifier(...) 或 identifier.identifier.identifier(...)
    // 例如：child_process.exec(), fs.readFile(), http.request()
    const functionCallPattern = /([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)+)\s*\(/g;

    lines.forEach((line, lineIndex) => {
      const lineNum = lineIndex + 1;

      let match;
      while ((match = functionCallPattern.exec(line)) !== null) {
        const apiName = match[1];
        usages.push({
          api: apiName,
          line: lineNum,
          column: match.index,
          text: match[0],
          type: 'function_call',
        });
      }
    });

    return usages;
  }

  /**
   * 检测变量引用
   * 支持：
   *   - module.property
   *   - module.submodule.property
   *   - 不包括函数调用（已在 detectFunctionCalls 中处理）
   */
  private detectVariableReferences(source: string): ApiUsage[] {
    const usages: ApiUsage[] = [];
    const lines = source.split('\n');

    // 匹配模式：identifier.identifier 但不是函数调用
    // 例如：fs.constants, path.sep, process.env
    const variableRefPattern = /([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)+)(?!\s*\()/g;

    lines.forEach((line, lineIndex) => {
      const lineNum = lineIndex + 1;

      let match;
      while ((match = variableRefPattern.exec(line)) !== null) {
        const apiName = match[1];

        // 过滤掉已经被函数调用检测捕获的情况
        // 检查是否后面紧跟 (
        const nextCharIndex = match.index + match[0].length;
        if (nextCharIndex < line.length && line[nextCharIndex] === '(') {
          continue;
        }

        usages.push({
          api: apiName,
          line: lineNum,
          column: match.index,
          text: match[0],
          type: 'variable_ref',
        });
      }
    });

    return usages;
  }

  /**
   * 检查特定 API 是否在源码中被使用
   *
   * @param source - 源码内容
   * @param apiName - 要检查的 API 名称（支持通配符，如 'child_process.*'）
   * @returns 是否使用了该 API
   */
  hasApi(source: string, apiName: string): boolean {
    const result = this.analyzeSource(source, '');
    if (!result.success) {
      return false;
    }

    // 支持通配符匹配
    const pattern = apiName
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[a-zA-Z0-9_$]*');
    const regex = new RegExp(`^${pattern}$`);

    return result.apiUsages.some((usage) => regex.test(usage.api));
  }

  /**
   * 获取源码中使用的所有模块
   *
   * @param source - 源码内容
   * @returns 模块名称列表（去重）
   */
  getImportedModules(source: string): string[] {
    const result = this.analyzeSource(source, '');
    if (!result.success) {
      return [];
    }

    const modules = new Set<string>();
    result.apiUsages
      .filter((usage) => usage.type === 'import')
      .forEach((usage) => {
        modules.add(usage.api);
      });

    return Array.from(modules);
  }

  /**
   * 获取源码中调用的所有函数
   *
   * @param source - 源码内容
   * @returns 函数名称列表（去重）
   */
  getCalledFunctions(source: string): string[] {
    const result = this.analyzeSource(source, '');
    if (!result.success) {
      return [];
    }

    const functions = new Set<string>();
    result.apiUsages
      .filter((usage) => usage.type === 'function_call')
      .forEach((usage) => {
        functions.add(usage.api);
      });

    return Array.from(functions);
  }

  /**
   * 获取源码中引用的所有变量
   *
   * @param source - 源码内容
   * @returns 变量名称列表（去重）
   */
  getReferencedVariables(source: string): string[] {
    const result = this.analyzeSource(source, '');
    if (!result.success) {
      return [];
    }

    const variables = new Set<string>();
    result.apiUsages
      .filter((usage) => usage.type === 'variable_ref')
      .forEach((usage) => {
        variables.add(usage.api);
      });

    return Array.from(variables);
  }
}

/**
 * 创建 SourceAnalyzer 实例
 */
export function createSourceAnalyzer(): SourceAnalyzer {
  return new SourceAnalyzer();
}
