import ts from 'typescript';
/** Compare code tokens, retaining literal values/operators but ignoring quote style and trivia. */
function tokens(text) {
    const source = ts.createSourceFile('contract.ts', text, ts.ScriptTarget.Latest, true);
    const result = [];
    function visit(node) {
        if (node.kind === ts.SyntaxKind.EndOfFileToken || (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode))
            return;
        const children = node.getChildren(source);
        if (children.length) {
            for (const child of children)
                visit(child);
            return;
        }
        if (node.end === node.pos || node.kind === ts.SyntaxKind.SyntaxList)
            return;
        result.push({ kind: node.kind, value: ts.isStringLiteralLike(node) ? node.text : node.getText(source) });
    }
    visit(source);
    // Only a separator after an actual element may be optional; preserve array holes.
    const normalized = result.filter((token, index) => token.kind !== ts.SyntaxKind.CommaToken || ![ts.SyntaxKind.CloseParenToken, ts.SyntaxKind.CloseBracketToken, ts.SyntaxKind.CloseBraceToken].includes(result[index + 1]?.kind) || index === 0 || [ts.SyntaxKind.CommaToken, ts.SyntaxKind.OpenParenToken, ts.SyntaxKind.OpenBracketToken, ts.SyntaxKind.OpenBraceToken].includes(result[index - 1].kind));
    return normalized.map(token => JSON.stringify([token.kind, token.value]));
}
export function codeContains(source, fragment) {
    const actual = tokens(source), expected = tokens(fragment);
    if (!expected.length)
        throw new Error('SOURCE_CONTRACT_EMPTY_FRAGMENT');
    return actual.some((_, start) => expected.every((token, index) => actual[start + index] === token));
}
export function hasCallArgument(source, callee, argument) {
    const tree = ts.createSourceFile('contract.ts', source, ts.ScriptTarget.Latest, true);
    let found = false;
    function visit(node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === callee && node.arguments.some(value => ts.isIdentifier(value) && value.text === argument))
            found = true;
        ts.forEachChild(node, visit);
    }
    visit(tree);
    return found;
}
//# sourceMappingURL=source-structure.js.map