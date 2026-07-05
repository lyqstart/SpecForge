import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  appendWriteGuardAuthorization,
  findMatchingWriteGuardAuthorization,
  readWriteGuardAuthorizations,
} from '../../packages/daemon-core/src/tools/lib/write-guard-authorization-log';
import { classifyBlockedWriteAttempts } from '../../packages/daemon-core/src/tools/lib/blocked-write-classification';

describe('v1.2.8 write_guard authorization flow', () => {
  it('stores scoped authorizations at project level and matches docker build commands', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-v128-auth-'));

    const auth = appendWriteGuardAuthorization(projectRoot, {
      work_item_id: 'WI-0012',
      source_hard_stop_id: 'HS-DOCKER',
      authorization_type: 'user_accepted_external_ops',
      scope: 'work_item',
      tool: 'sf_safe_bash',
      intent: 'docker_volume_mount',
      command_family: 'docker_run',
      host_path_prefix: '/mnt/1t_back/project/fj1/fj-android',
      container_targets: ['/build', '/workspace'],
      image: 'fj-builder:react-native-0.74',
      user_response_quote: '同意授权当前 WI 内 Docker 构建命令继续执行',
      reason: 'Docker volume mount is a user-authorized external operation for APK build.',
    });

    const entries = readWriteGuardAuthorizations(projectRoot);
    expect(entries).toHaveLength(1);
    expect(entries[0].authorization_id).toBe(auth.authorization_id);

    const command =
      'docker run --rm -v /mnt/1t_back/project/fj1/fj-android:/build -v fj1-gradle-cache:/root/.gradle -w /build fj-builder:react-native-0.74 bash -c "cd android && ./gradlew assembleDebug"';
    const match = findMatchingWriteGuardAuthorization(projectRoot, command, 'WI-0012');
    expect(match?.authorization_id).toBe(auth.authorization_id);

    const wrongWi = findMatchingWriteGuardAuthorization(projectRoot, command, 'WI-9999');
    expect(wrongWi).toBeNull();
  });

  it('lets changed-files audit classify matching blocked attempts as authorization-resolved', () => {
    const authorizations = [
      {
        authorization_id: 'AUTH-DOCKER',
        work_item_id: 'WI-0012',
        authorization_type: 'user_accepted_external_ops',
        scope: 'work_item',
        tool: 'sf_safe_bash',
        intent: 'docker_volume_mount',
        command_family: 'docker_run',
        host_path_prefix: '/mnt/1t_back/project/fj1/fj-android',
        container_targets: ['/workspace'],
        image: 'fj-builder:react-native-0.74',
      },
    ];

    const classifications = classifyBlockedWriteAttempts(
      [
        {
          path: '/workspace',
          operation: 'modify',
          tool: 'sf_safe_bash',
          command:
            'docker run --rm -v /mnt/1t_back/project/fj1/fj-android:/workspace -w /workspace fj-builder:react-native-0.74 bash -c "npm install"',
          violations: ['docker volume mount was previously ambiguous'],
        },
      ],
      [],
      [],
      [],
      authorizations,
    );

    expect(classifications[0].status).toBe('write_guard_authorization_resolved');
    expect(classifications[0].write_guard_authorization_id).toBe('AUTH-DOCKER');
  });

  it('does not treat unresolved blocked attempts as resolved without resolution or authorization', () => {
    const classifications = classifyBlockedWriteAttempts(
      [
        {
          path: '/etc/passwd',
          operation: 'modify',
          tool: 'sf_safe_bash',
          command: 'echo bad > /etc/passwd',
          violations: ['write target is outside project root: /etc/passwd'],
        },
      ],
      [],
      [],
      [],
      [],
    );

    expect(classifications[0].status).toBe('unresolved_blocked_attempt');
  });
});
