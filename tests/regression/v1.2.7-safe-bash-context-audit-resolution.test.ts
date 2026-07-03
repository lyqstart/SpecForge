import { describe, expect, it } from 'bun:test';
import { classifyBlockedWriteAttempts } from '../../packages/daemon-core/src/tools/lib/blocked-write-classification';

const allowed = [{ path: 'src/index.ts', operation: 'modify' }];

describe('v1.2.7 safe bash context / audit resolution alignment', () => {
  it('classifies blocked attempts as resolved when hard_stop_resolution.jsonl proves a structured resolution', () => {
    const result = classifyBlockedWriteAttempts(
      [
        {
          path: '/var/lib/pgsql/data',
          operation: 'modify',
          tool: 'sf_safe_bash',
          violations: ['write target is outside project root: /var/lib/pgsql/data'],
        },
      ],
      [],
      allowed,
      [
        {
          hard_stop_id: 'HS-remote-boundary',
          resolution_type: 'risk_accepted',
          reason: 'User accepted remote ops boundary classification for /var/lib/pgsql/data after v1.2.5 verification.',
          user_response_quote: '用户确认该 hard_stop 是远程 ssh 路径边界验证遗留。',
          original_hard_stop: {
            hard_stop_id: 'HS-remote-boundary',
            reason: 'WRITE_GUARD_RUNTIME_BLOCKED: write target is outside project root: /var/lib/pgsql/data',
          },
        },
      ],
    );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('hard_stop_resolution_resolved');
    expect(result[0].hard_stop_resolution_type).toBe('risk_accepted');
  });

  it('keeps unresolved blocked attempts failing when no resolution exists', () => {
    const result = classifyBlockedWriteAttempts(
      [
        {
          path: '/tmp/not-authorized.txt',
          operation: 'modify',
          tool: 'sf_safe_bash',
          violations: ['write target is outside project root: /tmp/not-authorized.txt'],
        },
      ],
      [],
      allowed,
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('unresolved_blocked_attempt');
  });
});
