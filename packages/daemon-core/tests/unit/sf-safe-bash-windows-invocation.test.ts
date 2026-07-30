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

describe('sf_safe_bash shell-specific encoding prefix composition', () => {
  it.each([
    ['daemon source', buildShellInvocation],
    ['userlevel installation source', buildInstalledShellInvocation],
  ])(
    'uses cmd.exe logical-AND in the %s executor',
    (_source, buildInvocation) => {
      const invocation = buildInvocation(
        'bun test',
        profileFor('cmd', 'cmd.exe', 'chcp 65001 > nul', 'win32'),
        'win32'
      );

      expect(invocation.shellArgs).toEqual(['/c', 'chcp 65001 > nul && bun test']);
      expect(invocation.finalCommand).toBe('chcp 65001 > nul && bun test');
      expect(invocation.finalCommand).not.toContain('nul;');
    }
  );

  it('keeps semicolon composition for PowerShell', () => {
    const encoding = '$OutputEncoding = [System.Text.Encoding]::UTF8';
    const invocation = buildShellInvocation(
      'bun test',
      profileFor('powershell', 'powershell.exe', encoding, 'win32'),
      'win32'
    );

    expect(invocation.shellArgs).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `${encoding}; bun test`,
    ]);
  });

  it.skipIf(process.platform !== 'win32')(
    'executes a prefixed command successfully through real cmd.exe',
    async () => {
      const result = await executeCommand({
        command: 'echo SAFE_BASH_CMD_OK',
        cwd: process.cwd(),
        timeoutMs: 10_000,
        outputLimit: 4096,
        profile: profileFor('cmd', 'cmd.exe', 'chcp 65001 > nul', 'win32'),
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('SAFE_BASH_CMD_OK');
      expect(result.command).toBe('chcp 65001 > nul && echo SAFE_BASH_CMD_OK');
    }
  );
});
