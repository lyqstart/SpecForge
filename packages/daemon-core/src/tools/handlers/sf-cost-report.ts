import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_cost_report', async (_args, _context, _deps) => {
  return { success: true, report: { entries: [], totals: { input_tokens: 0, output_tokens: 0, cost_usd: 0 } } };
});
