import { describe, expect, it, vi } from 'vitest';

import { EventLogger } from '../../src/services/event-logger';
import { PluginLoaderIntegration } from '../../src/services/plugin-loader-integration';

describe('retained static permission helper diagnostic ownership', () => {
  it('constructs the existing local logger rather than an observability interface', async () => {
    const initialize = vi.spyOn(EventLogger.prototype, 'initialize').mockResolvedValue();
    const denied = vi.spyOn(EventLogger.prototype, 'logPluginPermissionDenied').mockResolvedValue();
    const cleanup = vi.spyOn(EventLogger.prototype, 'cleanup').mockResolvedValue();
    try {
      const helper = new PluginLoaderIntegration({ projectId: 'local-diagnostic-owner', eventLoggingEnabled: true, allowFilesystem: false });
      expect(initialize).toHaveBeenCalledOnce();
      const result = await helper.validatePlugin({ id: 'static-fixture', name: 'Static Fixture', requires: ['filesystem.read'] });
      expect(result.allowed).toBe(false);
      expect(denied).toHaveBeenCalledOnce();
      await helper.cleanup();
      expect(cleanup).toHaveBeenCalledOnce();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
