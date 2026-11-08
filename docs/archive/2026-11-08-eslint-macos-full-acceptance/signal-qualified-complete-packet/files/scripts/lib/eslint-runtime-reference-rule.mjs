/** TypeScript-aware runtime binding check, including tests excluded by production tsc. */
export const runtimeReferenceRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      unbound: 'Runtime value {{name}} has no binding in this lexical scope.',
      typeOnly: 'Type-only import {{name}} cannot provide a runtime value.',
    },
  },
  create(context) {
    return {
      'Program:exit'() {
        const manager = context.sourceCode.scopeManager;
        if (!manager?.globalScope) throw new Error('LINT_SCOPE_MANAGER_UNAVAILABLE');
        const reported = new Set();
        function isRuntime(reference) {
          if (typeof reference.isValueReference !== 'boolean') throw new Error('LINT_REFERENCE_KIND_UNAVAILABLE');
          if (!reference.isValueReference) return false;
          for (let node = reference.identifier.parent; node; node = node.parent) {
            if (node.type === 'TSTypeQuery') return false;
          }
          return true;
        }
        function report(reference, messageId) {
          const identifier = reference.identifier;
          const key = identifier.range.join(':');
          if (reported.has(key)) return;
          reported.add(key);
          context.report({ node: identifier, messageId, data: { name: identifier.name } });
        }
        for (const reference of manager.globalScope.through) {
          if (!isRuntime(reference) || reference.resolved) continue;
          const parent = reference.identifier.parent;
          // `typeof optionalHost` is valid JavaScript capability detection.
          if (parent?.type === 'UnaryExpression' && parent.operator === 'typeof') continue;
          report(reference, 'unbound');
        }
        for (const scope of manager.scopes) for (const reference of scope.references) {
          if (!isRuntime(reference) || !reference.resolved) continue;
          if (reference.resolved.defs.some(definition => definition.type === 'ImportBinding' &&
            (definition.node.importKind === 'type' || definition.parent?.importKind === 'type'))) {
            report(reference, 'typeOnly');
          }
        }
      },
    };
  },
};
