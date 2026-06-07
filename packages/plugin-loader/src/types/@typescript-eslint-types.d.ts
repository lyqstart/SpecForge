declare module '@typescript-eslint/types' {
  interface BaseNode {
    type: string;
    loc?: SourceLocation;
    range?: [number, number];
    parent?: BaseNode;
    name?: string;
  }

  interface SourceLocation {
    start: Position;
    end: Position;
  }

  interface Position {
    line: number;
    column: number;
  }

  interface Program extends BaseNode {
    type: 'Program';
    body: BaseNode[];
    sourceType: 'script' | 'module';
  }

  interface FunctionDeclaration extends BaseNode {
    type: 'FunctionDeclaration';
    id: { name: string } | null;
    params: BaseNode[];
    body: BaseNode;
    async: boolean;
    generator: boolean;
  }

  interface FunctionExpression extends BaseNode {
    type: 'FunctionExpression';
    id: { name: string } | null;
    params: BaseNode[];
    body: BaseNode;
    async: boolean;
    generator: boolean;
  }

  interface ArrowFunctionExpression extends BaseNode {
    type: 'ArrowFunctionExpression';
    params: BaseNode[];
    body: BaseNode;
    async: boolean;
    expression: boolean;
  }

  interface CallExpression extends BaseNode {
    type: 'CallExpression';
    callee: BaseNode;
    arguments: BaseNode[];
    optional: boolean;
  }

  interface MemberExpression extends BaseNode {
    type: 'MemberExpression';
    object: BaseNode;
    property: BaseNode;
    computed: boolean;
    optional: boolean;
  }

  interface Identifier extends BaseNode {
    type: 'Identifier';
    name: string;
  }

  interface Literal extends BaseNode {
    type: 'Literal';
    value: string | number | boolean | null | bigint | RegExp;
    raw: string;
  }

  interface ImportDeclaration extends BaseNode {
    type: 'ImportDeclaration';
    source: Literal;
    specifiers: BaseNode[];
  }

  interface VariableDeclarator extends BaseNode {
    type: 'VariableDeclarator';
    id: BaseNode;
    init: BaseNode | null;
  }

  interface Property extends BaseNode {
    type: 'Property';
    key: BaseNode;
    value: BaseNode;
    kind: 'init' | 'get' | 'set';
    method: boolean;
    shorthand: boolean;
    computed: boolean;
  }

  namespace TSESTree {
    type Node = BaseNode;
    type Program = Program;
    type FunctionDeclaration = FunctionDeclaration;
    type FunctionExpression = FunctionExpression;
    type ArrowFunctionExpression = ArrowFunctionExpression;
    type CallExpression = CallExpression;
    type MemberExpression = MemberExpression;
    type Identifier = Identifier;
    type Literal = Literal;
    type ImportDeclaration = ImportDeclaration;
    type VariableDeclarator = VariableDeclarator;
    type Property = Property;
  }

  export { BaseNode as Node, Program, FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, CallExpression, MemberExpression, Identifier, Literal, ImportDeclaration, VariableDeclarator, Property, TSESTree };
}
