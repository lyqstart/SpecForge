import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_knowledge_graph', async (args, _context, _deps) => {
  const operation = args['operation'] as string;

  if (!operation) {
    return { success: false, error: 'operation required' };
  }

  return { success: true, operation };
});
