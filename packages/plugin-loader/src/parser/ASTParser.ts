/**
 * AST 解析器基础类（任务 2.1.1 核心交付物）
 *
 * 本文件实现 TypeScript/JavaScript 源码的 AST 解析、遍历和查询接口。
 * 集成 TypeScript 编译器 API，为后续的静态检查（任务 2.2）提供基础。
 *
 * 设计原则：
 *   1. 使用 TypeScript 编译器 API 作为 AST 解析引擎
 *   2. 提供统一的遍历接口（visitor pattern）
 *   3. 支持节点查询和过滤
 *   4. 缓存 AST 以提高性能
 *
 * 与后续任务的关联：
 *   - 任务 2.2：基于本解析器检测禁止的 API 调用
 *   - 任务 2.3：基于本解析器检查文件系统路径
 */

import * as ts from 'typescript';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** AST 节点访问器回调函数类型 */
export type NodeVisitor = (node: ts.Node) => void | boolean;

/** 节点过滤谓词 */
export type NodePredicate = (node: ts.Node) => boolean;

/** AST 解析结果 */
export interface ParseResult {
  /** 源文件对象 */
  sourceFile: ts.SourceFile;
  /** 编译器选项 */
  compilerOptions: ts.CompilerOptions;
  /** 是否成功解析 */
  success: boolean;
  /** 错误信息（如有） */
  error?: string;
}

/** 节点查询结果 */
export interface QueryResult {
  /** 匹配的节点列表 */
  nodes: ts.Node[];
  /** 查询是否成功 */
  success: boolean;
  /** 错误信息（如有） */
  error?: string;
}

/** 节点位置信息 */
export interface NodeLocation {
  /** 行号（1-based） */
  line: number;
  /** 列号（0-based） */
  column: number;
  /** 源代码片段 */
  text: string;
}

// ---------------------------------------------------------------------------
// AST 解析器主类
// ---------------------------------------------------------------------------

/**
 * AST 解析器
 *
 * 职责：
 *   1. 解析 TypeScript/JavaScript 源码为 AST
 *   2. 提供 AST 遍历接口（visitor pattern）
 *   3. 提供节点查询和过滤功能
 *   4. 缓存解析结果以提高性能
 *   5. 提供节点位置信息查询
 */
export class ASTParser {
  /** AST 缓存（key: 源码哈希，value: ParseResult） */
  private cache: Map<string, ParseResult> = new Map();

  /** 编译器选项 */
  private compilerOptions: ts.CompilerOptions;

  constructor(compilerOptions?: ts.CompilerOptions) {
    this.compilerOptions = compilerOptions || {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.React,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    };
  }

  /**
   * 解析源码为 AST
   *
   * @param source - TypeScript/JavaScript 源码
   * @param fileName - 文件名（用于错误报告和缓存）
   * @param useCache - 是否使用缓存（默认 true）
   * @returns 解析结果
   */
  parse(source: string, fileName: string = 'source.ts', useCache: boolean = true): ParseResult {
    // 尝试从缓存读取
    if (useCache) {
      const cached = this.cache.get(fileName);
      if (cached) {
        return cached;
      }
    }

    try {
      // 使用 TypeScript 编译器 API 解析源码
      const sourceFile = ts.createSourceFile(
        fileName,
        source,
        ts.ScriptTarget.Latest,
        true, // setParentNodes
        ts.ScriptKind.TS,
      );

      const result: ParseResult = {
        sourceFile,
        compilerOptions: this.compilerOptions,
        success: true,
      };

      // 缓存结果
      if (useCache) {
        this.cache.set(fileName, result);
      }

      return result;
    } catch (error) {
      return {
        sourceFile: null as any,
        compilerOptions: this.compilerOptions,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 遍历 AST 节点（深度优先）
   *
   * @param sourceFile - 源文件
   * @param visitor - 访问器回调函数
   *
   * 访问器返回值：
   *   - undefined / false：继续遍历子节点
   *   - true：跳过子节点，继续遍历兄弟节点
   */
  traverse(sourceFile: ts.SourceFile, visitor: NodeVisitor): void {
    const visit = (node: ts.Node): void => {
      const shouldSkip = visitor(node);
      if (shouldSkip !== true) {
        ts.forEachChild(node, visit);
      }
    };
    visit(sourceFile);
  }

  /**
   * 查询满足条件的所有节点
   *
   * @param sourceFile - 源文件
   * @param predicate - 节点过滤谓词
   * @returns 查询结果
   */
  query(sourceFile: ts.SourceFile, predicate: NodePredicate): QueryResult {
    try {
      const nodes: ts.Node[] = [];
      this.traverse(sourceFile, (node) => {
        if (predicate(node)) {
          nodes.push(node);
        }
        return false;
      });
      return { nodes, success: true };
    } catch (error) {
      return {
        nodes: [],
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 查询特定类型的节点
   *
   * @param sourceFile - 源文件
   * @param kind - 节点类型（ts.SyntaxKind）
   * @returns 查询结果
   */
  queryByKind(sourceFile: ts.SourceFile, kind: ts.SyntaxKind): QueryResult {
    return this.query(sourceFile, (node) => node.kind === kind);
  }

  /**
   * 查询所有函数调用节点
   *
   * @param sourceFile - 源文件
   * @returns 查询结果
   */
  queryCallExpressions(sourceFile: ts.SourceFile): QueryResult {
    return this.queryByKind(sourceFile, ts.SyntaxKind.CallExpression);
  }

  /**
   * 查询所有导入声明
   *
   * @param sourceFile - 源文件
   * @returns 查询结果
   */
  queryImportDeclarations(sourceFile: ts.SourceFile): QueryResult {
    return this.queryByKind(sourceFile, ts.SyntaxKind.ImportDeclaration);
  }

  /**
   * 查询所有变量声明
   *
   * @param sourceFile - 源文件
   * @returns 查询结果
   */
  queryVariableDeclarations(sourceFile: ts.SourceFile): QueryResult {
    return this.queryByKind(sourceFile, ts.SyntaxKind.VariableDeclaration);
  }

  /**
   * 查询所有函数声明
   *
   * @param sourceFile - 源文件
   * @returns 查询结果
   */
  queryFunctionDeclarations(sourceFile: ts.SourceFile): QueryResult {
    return this.queryByKind(sourceFile, ts.SyntaxKind.FunctionDeclaration);
  }

  /**
   * 获取节点的位置信息
   *
   * @param sourceFile - 源文件
   * @param node - 节点
   * @returns 位置信息
   */
  getNodeLocation(sourceFile: ts.SourceFile, node: ts.Node): NodeLocation {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const text = node.getText(sourceFile);
    return {
      line: line + 1, // 转换为 1-based
      column: character,
      text,
    };
  }

  /**
   * 获取节点的文本内容
   *
   * @param sourceFile - 源文件
   * @param node - 节点
   * @returns 节点文本
   */
  getNodeText(sourceFile: ts.SourceFile, node: ts.Node): string {
    return node.getText(sourceFile);
  }

  /**
   * 获取节点的父节点
   *
   * @param node - 节点
   * @returns 父节点（如有）
   */
  getParent(node: ts.Node): ts.Node | undefined {
    return node.parent;
  }

  /**
   * 获取节点的所有子节点
   *
   * @param node - 节点
   * @returns 子节点列表
   */
  getChildren(node: ts.Node): ts.Node[] {
    const children: ts.Node[] = [];
    ts.forEachChild(node, (child) => {
      children.push(child);
    });
    return children;
  }

  /**
   * 检查节点是否是特定类型
   *
   * @param node - 节点
   * @param kind - 节点类型
   * @returns 是否匹配
   */
  isNodeOfKind(node: ts.Node, kind: ts.SyntaxKind): boolean {
    return node.kind === kind;
  }

  /**
   * 获取调用表达式的被调用函数名
   *
   * @param callExpression - 调用表达式节点
   * @returns 函数名（如可提取）
   */
  getCallExpressionName(callExpression: ts.CallExpression): string | null {
    const expression = callExpression.expression;

    // 简单标识符：foo()
    if (ts.isIdentifier(expression)) {
      return expression.text;
    }

    // 成员访问：obj.method()
    if (ts.isPropertyAccessExpression(expression)) {
      return expression.name.text;
    }

    // 元素访问：obj['method']()
    if (ts.isElementAccessExpression(expression)) {
      if (ts.isStringLiteral(expression.argumentExpression)) {
        return expression.argumentExpression.text;
      }
    }

    return null;
  }

  /**
   * 获取调用表达式的对象名（如有）
   *
   * @param callExpression - 调用表达式节点
   * @returns 对象名（如可提取）
   */
  getCallExpressionObject(callExpression: ts.CallExpression): string | null {
    const expression = callExpression.expression;

    // 成员访问：obj.method()
    if (ts.isPropertyAccessExpression(expression)) {
      if (ts.isIdentifier(expression.expression)) {
        return expression.expression.text;
      }
    }

    // 元素访问：obj['method']()
    if (ts.isElementAccessExpression(expression)) {
      if (ts.isIdentifier(expression.expression)) {
        return expression.expression.text;
      }
    }

    return null;
  }

  /**
   * 获取导入声明的模块名
   *
   * @param importDeclaration - 导入声明节点
   * @returns 模块名
   */
  getImportModuleName(importDeclaration: ts.ImportDeclaration): string | null {
    if (ts.isStringLiteral(importDeclaration.moduleSpecifier)) {
      return importDeclaration.moduleSpecifier.text;
    }
    return null;
  }

  /**
   * 获取导入声明的导入项
   *
   * @param importDeclaration - 导入声明节点
   * @returns 导入项列表
   */
  getImportItems(importDeclaration: ts.ImportDeclaration): string[] {
    const items: string[] = [];

    if (importDeclaration.importClause) {
      const clause = importDeclaration.importClause;

      // 默认导入：import foo from 'module'
      if (clause.name) {
        items.push(clause.name.text);
      }

      // 命名导入：import { foo, bar } from 'module'
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        clause.namedBindings.elements.forEach((element) => {
          items.push(element.name.text);
        });
      }

      // 命名空间导入：import * as foo from 'module'
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        items.push(clause.namedBindings.name.text);
      }
    }

    return items;
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   *
   * @returns 缓存中的条目数
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

// ---------------------------------------------------------------------------
// 导出 TypeScript 编译器 API 类型，便于使用者直接访问
// ---------------------------------------------------------------------------

export { ts };
export type { SyntaxKind } from 'typescript';
