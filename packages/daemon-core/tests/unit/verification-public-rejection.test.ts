import { describe, it, expect, vi } from 'vitest';
import {
  tagVerificationRejection,
  verificationPublicRejection,
} from '../../src/verification/rejection-diagnostic';
import { getHandler } from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-verification-execution';

describe('detached-safe verification rejection metadata', () => {
  it('returns only fixed metadata through the actual handler with stderr discarded', async () => {
    const error = Object.assign(new Error('NODE_COMMAND_UNSUPPORTED:private source /credentials'), {
      stage: 'attacker stage',
      responseBody: 'secret',
    });
    tagVerificationRejection(error, 'command_proof');
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await getHandler('sf_verification_plan')!({}, {}, {
        verificationRuntime: {
          plan: async () => {
            throw error;
          },
        },
      } as any);
      expect(result).toEqual({
        success: false,
        error: 'VERIFICATION_REQUEST_REJECTED',
        application_passed: false,
        diagnostic: {
          contract: 'verification-rejection/v1',
          stage: 'command_proof',
          reason: 'unsupported_command',
        },
      });
      expect(JSON.stringify(result)).not.toMatch(/private|credentials|secret|attacker/);
    } finally {
      stderr.mockRestore();
    }
  });
  it('rejects injected stage/unknown exception data and gives finite proof failures a fixed reason', () => {
    const e = Object.assign(new Error('secret source'), { stage: 'command_proof' });
    tagVerificationRejection(e, 'private stage');
    expect(verificationPublicRejection(e)).toEqual({
      contract: 'verification-rejection/v1',
      stage: 'unknown',
      reason: 'request_rejected',
    });
    expect(verificationPublicRejection({ message: 'secret' })).toEqual({
      contract: 'verification-rejection/v1',
      stage: 'unknown',
      reason: 'request_rejected',
    });
    expect(verificationPublicRejection(Error('NODE_COMMAND_FINITE_SOURCE_UNPROVEN')).reason).toBe(
      'finite_source_unproven'
    );
  });
});
