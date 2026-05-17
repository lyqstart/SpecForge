/**
 * AST Parser - TypeScript/JavaScript 抽象语法树解析器
 *
 * 职责：
 *   - 使用 @typescript-eslint/parser 解析 TypeScript/JavaScript 源码
 *   - 提供 AST 遍历和节点查询接口
 *   - 支持提取函数调用、导入语句、变量引用等信息
 *
 * 实现策略：
 *   - 基于 @typescript-eslint/parser 的完整 AST 解析
 *   - 支持 TypeScript 特有语法（类型注解、接口等）
 *   - 缓存解析结果以提高性能
 *
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本模块不涉及 Promise.race / while 循环 / 轮询
 *   - 所有操作为同步，无异步资源泄漏风险
 */

import * as parser from '@typescript-eslint/parser';
import type { TSESTree } from '@typescript-eslint/types';

/**
 * AST 解析选项
 */
export interface AstParseOptions {
  /** 是否启用 JSX 支持 */
  jsx?: boolean;
  /** 是否启用 TypeScript 支持 */
  typescript?: boolean;
  /** 源码类型：'module' | 'script' */
  sourceType?: 'module' | 'script';
  /** ECMAScript 版本 */
  ecmaVersion?: number;
}

/**
 * 函数调用节点信息
 */
export interface FunctionCallInfo {
  /** 被调用的函数名称（如 'child_process.exec'） */
  name: string;
  /** 调用的行号（1-indexed） */
  line: number;
  /** 调用的列号（0-indexed） */
  column: number;
  /** 函数调用的参数个数 */
  argumentCount: number;
  /** 原始 AST 节点 */
  node: TSESTree.CallExpression;
}

/**
 * 导入语句信息
 */
export interface ImportInfo {
  /** 导入的模块名称 */
  moduleName: string;
  /** 导入的标识符列表（如 ['exec', 'spawn']） */
  identifiers: string[];
  /** 导入的行号（1-indexed） */
  line: number;
  /** 导入类型：'require' | 'import' | 'dynamic-import' */
  type: 'require' | 'import' | 'dynamic-import';
  /** 原始 AST 节点 */
  node: TSESTree.Node;
}

/**
 * 变量引用信息
 */
export interface VariableRefInfo {
  /** 引用的变量名称 */
  name: string;
  /** 引用的行号（1-indexed） */
  line: number;
  /** 引用的列号（0-indexed） */
  column: number;
  /** 原始 AST 节点 */
  node: TSESTree.Node;
}

/**
 * AST 解析结果
 */
export interface AstParseResult {
  /** 是否解析成功 */
  success: boolean;
  /** 解析后的 AST 根节点 */
  ast?: TSESTree.Program;
  /** 检测到的函数调用 */
  functionCalls?: FunctionCallInfo[];
  /** 检测到的导入语句 */
  imports?: ImportInfo[];
  /** 检测到的变量引用 */
  variables?: VariableRefInfo[];
  /** 解析错误信息 */
  error?: string;
}

/**
 * AST 解析器
 */
export class AstParser {
  private parseOptions: AstParseOptions;

  constructor(options: AstParseOptions = {}) {
    this.parseOptions = {
      jsx: true,
      typescript: true,
      sourceType: 'module',
      ecmaVersion: 2022,
      ...options,
    };
  }

  /**
   * 解析源码并返回 AST
   *
   * @param source - 源码内容
   * @param filePath - 文件路径（用于错误报告）
   * @returns 解析结果
   */
  parse(source: string, filePath: string = ''): AstParseResult {
    try {
      const ast = parser.parse(source, {
        ecmaVersion: this.parseOptions.ecmaVersion,
        sourceType: this.parseOptions.sourceType,
        ecmaFeatures: {
          jsx: this.parseOptions.jsx,
        },
        range: true,
        loc: true,
      }) as TSESTree.Program;

      // 提取各类信息
      const functionCalls = this.extractFunctionCalls(ast);
      const imports = this.extractImports(ast);
      const variables = this.extractVariables(ast);

      return {
        success: true,
        ast,
        functionCalls,
        imports,
        variables,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 提取所有函数调用
   *
   * @param ast - AST 根节点
   * @returns 函数调用列表
   */
  private extractFunctionCalls(ast: TSESTree.Program): FunctionCallInfo[] {
    const calls: FunctionCallInfo[] = [];

    const visit = (node: TSESTree.Node): void => {
      if (node.type === 'CallExpression') {
        const callExpr = node as TSESTree.CallExpression;
        const name = this.getCallExpressionName(callExpr);

        if (name) {
          calls.push({
            name,
            line: callExpr.loc?.start.line ?? 0,
            column: callExpr.loc?.start.column ?? 0,
            argumentCount: callExpr.arguments.length,
            node: callExpr,
          });
        }
      }

      // 递归遍历子节点
      for (const key in node) {
        const value = (node as any)[key];
        if (value && typeof value === 'object') {
          if (Array.isArray(value)) {
            value.forEach((item) => {
              if (item && typeof item === 'object' && 'type' in item) {
                visit(item as TSESTree.Node);
              }
            });
          } else if ('type' in value) {
            visit(value as TSESTree.Node);
          }
        }
      }
    };

    visit(ast);
    return calls;
  }

  /**
   * 提取所有导入语句
   *
   * @param ast - AST 根节点
   * @returns 导入语句列表
   */
  private extractImports(ast: TSESTree.Program): ImportInfo[] {
    const imports: ImportInfo[] = [];

    const visit = (node: TSESTree.Node): void => {
      // 处理 import ... from 'module'
      if (node.type === 'ImportDeclaration') {
        const importDecl = node as TSESTree.ImportDeclaration;
        const moduleName = importDecl.source.value;
        const identifiers = importDecl.specifiers
          .map((spec) => {
            if (spec.type === 'ImportSpecifier') {
              return spec.imported.name;
            } else if (spec.type === 'ImportDefaultSpecifier') {
              return 'default';
            } else if (spec.type === 'ImportNamespaceSpecifier') {
              return '*';
            }
            return null;
          })
          .filter((id): id is string => id !== null);

        imports.push({
          moduleName,
          identifiers,
          line: importDecl.loc?.start.line ?? 0,
          type: 'import',
          node: importDecl,
        });
      }

      // 处理 require('module')
      if (node.type === 'CallExpression') {
        const callExpr = node as TSESTree.CallExpression;
        if (
          callExpr.callee.type === 'Identifier' &&
          callExpr.callee.name === 'require' &&
          callExpr.arguments.length > 0
        ) {
          const arg = callExpr.arguments[0];
          if (arg.type === 'Literal' && typeof arg.value === 'string') {
            imports.push({
              moduleName: arg.value,
              identifiers: [],
              line: callExpr.loc?.start.line ?? 0,
              type: 'require',
              node: callExpr,
            });
          }
        }

        // 处理 import('module')
        if (
          callExpr.callee.type === 'Import' &&
          callExpr.arguments.length > 0
        ) {
          const arg = callExpr.arguments[0];
          if (arg.type === 'Literal' && typeof arg.value === 'string') {
            imports.push({
              moduleName: arg.value,
              identifiers: [],
              line: callExpr.loc?.start.line ?? 0,
              type: 'dynamic-import',
              node: callExpr,
            });
          }
        }
      }

      // 递归遍历子节点
      for (const key in node) {
        const value = (node as any)[key];
        if (value && typeof value === 'object') {
          if (Array.isArray(value)) {
            value.forEach((item) => {
              if (item && typeof item === 'object' && 'type' in item) {
                visit(item as TSESTree.Node);
              }
            });
          } else if ('type' in value) {
            visit(value as TSESTree.Node);
          }
        }
      }
    };

    visit(ast);
    return imports;
  }

  /**
   * 提取所有变量引用
   *
   * @param ast - AST 根节点
   * @returns 变量引用列表
   */
  private extractVariables(ast: TSESTree.Program): VariableRefInfo[] {
    const variables: VariableRefInfo[] = [];
    const seen = new Set<string>();

    const visit = (node: TSESTree.Node): void => {
      if (node.type === 'Identifier') {
        const ident = node as TSESTree.Identifier;
        const key = `${ident.name}:${ident.loc?.start.line}:${ident.loc?.start.column}`;

        if (!seen.has(key)) {
          seen.add(key);
          variables.push({
            name: ident.name,
            line: ident.loc?.start.line ?? 0,
            column: ident.loc?.start.column ?? 0,
            node: ident,
          });
        }
      }

      // 递归遍历子节点
      for (const key in node) {
        const value = (node as any)[key];
        if (value && typeof value === 'object') {
          if (Array.isArray(value)) {
            value.forEach((item) => {
              if (item && typeof item === 'object' && 'type' in item) {
                visit(item as TSESTree.Node);
              }
            });
          } else if ('type' in value) {
            visit(value as TSESTree.Node);
          }
        }
      }
    };

    visit(ast);
    return variables;
  }

  /**
   * 获取函数调用表达式的名称
   *
   * @param callExpr - 函数调用表达式节点
   * @returns 函数名称（如 'child_process.exec'）或 null
   */
  private getCallExpressionName(callExpr: TSESTree.CallExpression): string | null {
    const { callee } = callExpr;

    if (callee.type === 'Identifier') {
      return callee.name;
    }

    if (callee.type === 'MemberExpression') {
      const parts: string[] = [];
      let current: TSESTree.Node = callee;

      while (current.type === 'MemberExpression') {
        const memberExpr = current as TSESTree.MemberExpression;
        if (memberExpr.property.type === 'Identifier') {
          parts.unshift(memberExpr.property.name);
        }
        current = memberExpr.object;
      }

      if (current.type === 'Identifier') {
        parts.unshift(current.name);
        return parts.join('.');
      }
    }

    return null;
  }

  /**
   * 查询 AST 中的所有节点
   *
   * @param ast - AST 根节点
   * @param predicate - 过滤条件
   * @returns 匹配的节点列表
   */
  query(
    ast: TSESTree.Program,
    predicate: (node: TSESTree.Node) => boolean
  ): TSESTree.Node[] {
    const results: TSESTree.Node[] = [];

    const visit = (node: TSESTree.Node): void => {
      if (predicate(node)) {
        results.push(node);
      }

      // 递归遍历子节点
      for (const key in node) {
        const value = (node as any)[key];
        if (value && typeof value === 'object') {
          if (Array.isArray(value)) {
            value.forEach((item) => {
              if (item && typeof item === 'object' && 'type' in item) {
                visit(item as TSESTree.Node);
              }
            });
          } else if ('type' in value) {
            visit(value as TSESTree.Node);
          }
        }
      }
    };

    visit(ast);
    return results;
  }
}

/**
 * 创建 AST 解析器实例
 */
export function createAstParser(options?: AstParseOptions): AstParser {
  return new AstParser(options);
}
