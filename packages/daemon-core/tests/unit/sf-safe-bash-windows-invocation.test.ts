import { describe, expect, it } from 'vitest';
import {
  buildShellInvocation,
  executeCommand,
} from '../../src/tools/lib/sf_safe_bash_executor.js';
import {
  buildShellInvocation as buildInstalledShellInvocation,
} from '../../../../setup/userlevel-opencode/tools/lib/sf_safe_bash_executor.js';
import type { HostProfile } from '../../src/tools/lib/sf_safe_bash_core.js';

function profileFor(
  shell: 'cmd' | 'powershell' | 'bash',
  shellPath: string,
  encodingSetup: string,
  platform: NodeJS.Platform
): HostProfile {
  return {
    schema_version: '1.0',
    hostname: 'test',
    os: {
      platform,
      release: 'test',
      version: 'test',
      arch: 'x64',
      totalmem_gb: 1,
      cpu_count: 1,
    },
    locale: {
      system_lang: 'en-US',
      console_codepage: null,
      encoding: 'UTF-8',
      timezone: 'UTC',
      tz_offset_minutes: 0,
      datetime_now: new Date(0).toISOString(),
    },
    shells: [
      {
        name: shell,
        path: shellPath,
        version: null,
        default_encoding: 'UTF-8',
        needs_encoding_fix: true,
        available: true,
        preferred: true,
      },
    ],
    tools: {},
    shell_rules: {
      preferred_shell: shell,
      max_command_length: 32767,
      encoding_setup_command: encodingSetup,
      path_separator: platform === 'win32' ? '\\' : '/',
      path_quote_required_for_spaces: true,
      supports_glob_in_shell: platform !== 'win32',
      ci_mode: true,
    },
    user: {
      username: 'test',
      home_dir: process.cwd(),
      shell_history_file: null,
    },
    specforge: {
      install_root: process.cwd(),
      logs_dir: process.cwd(),
    },
  };
}

describe('D18 shell profiles cannot regain external execution', () => {
  it.each([['source', buildShellInvocation], ['template', buildInstalledShellInvocation]])('returns no invocation in %s', (_name, build) => {
    for (const shell of ['cmd','powershell','bash'] as const) {
      const invocation = build('bun test', profileFor(shell, 'arbitrary-program', 'node malicious.cjs', 'win32'), 'win32');
      expect(invocation).toMatchObject({shell:null,shellPath:null,shellArgs:[],finalCommand:'bun test'});
    }
  });
  it('ignores executable and encoding injection while preserving literal output', async () => {
    const result = await executeCommand({command:'echo SAFE_BASH_CMD_OK',cwd:process.cwd(),timeoutMs:10000,outputLimit:4096,profile:profileFor('cmd','malicious.exe','node malicious.cjs','win32')});
    expect(result).toMatchObject({success:true,exitCode:0,shell:null,stdout:'SAFE_BASH_CMD_OK\n',command:'echo SAFE_BASH_CMD_OK'});
  });
});
