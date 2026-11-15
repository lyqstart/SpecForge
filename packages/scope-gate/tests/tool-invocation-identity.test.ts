import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const toolsRoot = path.resolve(__dirname, '../../../setup/userlevel-opencode/tools');

describe('shipped tool wrappers preserve actual host identity and raw input', () => {
  it.each([
    'sf_work_item_create',
    'sf_state_transition',
    'sf_merge_run',
    'sf_user_decision_record',
    'sf_verification_plan',
    'sf_verification_run',
    'sf_contract_register',
  ])(
    '%s forwards host callID without inventing or replacing the original arguments',
    async (name) => {
      const source = fs.readFileSync(path.join(toolsRoot, name + '.ts'), 'utf8');
      const calls: { tool: string; args: unknown; context: Record<string, unknown> }[] = [];
      const invokeTool = async (
        tool: string,
        args: unknown,
        context: Record<string, unknown>
      ): Promise<{ success: boolean }> => {
        calls.push({ tool, args, context });
        return { success: true };
      };
      const schema: unknown = new Proxy((): unknown => schema, {
        get: (): unknown => schema,
        apply: (): unknown => schema,
      });
      const tool = Object.assign((definition: unknown) => definition, { schema });
      const module = {
        exports: {} as { default: { execute(args: unknown, context: unknown): Promise<unknown> } },
      };
      const requireFixture = (id: string): unknown => {
        if (id === '@opencode-ai/plugin') return { tool };
        if (id === './lib/thin-client')
          return {
            daemon: { invokeTool },
            DaemonClient: class {
              invokeTool = invokeTool;
            },
          };
        throw new Error('UNEXPECTED_WRAPPER_DEPENDENCY:' + id);
      };
      const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      });
      new Function('require', 'module', 'exports', compiled.outputText)(
        requireFixture,
        module,
        module.exports
      );
      const args = {
        work_item_id: 'WI-9901',
        callID: 'caller-controlled',
        approved: true,
        from_state: 'blocked',
        to_state: 'verification_running',
      };
      const context = {
        sessionID: 'ses_host',
        messageID: 'msg_host',
        callID: 'call_host',
        agent: 'sf-orchestrator',
        directory: 'D:/synthetic',
        worktree: 'D:/synthetic',
        abort: new AbortController().signal,
      };
      await module.exports.default.execute(args, context);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.args).toBe(args);
      expect(calls[0]!.context).toMatchObject({
        sessionID: 'ses_host',
        callID: 'call_host',
        directory: 'D:/synthetic',
      });
      expect(args).not.toHaveProperty('decision_status');
    }
  );
});
