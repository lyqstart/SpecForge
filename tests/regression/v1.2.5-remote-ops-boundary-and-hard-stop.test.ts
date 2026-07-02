import { describe, expect, test } from 'bun:test';
import { extractShellWriteTargets } from '../../packages/daemon-core/src/tools/lib/write-guard-runtime-v12';
import { stripRemoteExecutionSegmentsForLocalWriteGuard } from '../../packages/daemon-core/src/tools/lib/shell-command-write-intent';

describe('v1.2.5 remote ops boundary', () => {
  test('ssh quoted remote cp paths are not local write targets', () => {
    const command = `ssh lg "cp -a /var/lib/pgsql/data /opt/pg13-backup-20260702/data && touch /tmp/x"`;
    const analysis = stripRemoteExecutionSegmentsForLocalWriteGuard(command);
    expect(analysis.remote_execution_detected).toBe(true);
    expect(analysis.remote_segments[0]?.tool).toBe('ssh');
    const targets = extractShellWriteTargets(command);
    expect(targets).toEqual([]);
  });

  test('local redirection around ssh remains a local write target', () => {
    const command = `ssh lg "date && cp -a /remote/a /remote/b" > logs/date.txt`;
    const targets = extractShellWriteTargets(command);
    expect(targets).toEqual([{ path: 'logs/date.txt', operation: 'modify' }]);
  });

  test('remote tee inside ssh is not a local write target', () => {
    const command = `ssh lg 'cat <<EOF | tee /etc/systemd/system/fj-api.service\nhello\nEOF'`;
    const targets = extractShellWriteTargets(command);
    expect(targets).toEqual([]);
  });

  test('scp local to remote is not a local write target', () => {
    const command = `scp fj-backend/fj-api/target/fj-api-1.0.0.jar lg:/opt/fj/app/fj-api.jar`;
    const analysis = stripRemoteExecutionSegmentsForLocalWriteGuard(command);
    expect(analysis.remote_execution_detected).toBe(true);
    const targets = extractShellWriteTargets(command);
    expect(targets).toEqual([]);
  });

  test('scp remote to local with shell redirection remains locally audited through the redirection', () => {
    const command = `scp lg:/opt/fj/log.txt /tmp/fj-log.txt > logs/scp.log`;
    const targets = extractShellWriteTargets(command);
    expect(targets).toEqual([{ path: 'logs/scp.log', operation: 'modify' }]);
  });
});
