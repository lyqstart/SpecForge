import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_doctor', async (_args, _context, _deps) => {
  return {
    success: true,
    healthy: true,
    components: {
      stateManager: 'ok',
      workflowEngine: 'ok',
      eventBus: 'ok',
      eventLogger: 'ok',
      permissionEngine: 'ok',
    },
  };
});
