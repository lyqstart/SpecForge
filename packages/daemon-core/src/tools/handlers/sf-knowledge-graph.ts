import { registerHandler } from '../ToolDispatcher';
import { addNodes, addEdges, removeNodes, updateNode, syncFromSpec } from '../lib/sf_knowledge_graph_core';
import type { GraphNode, GraphEdge, SyncScope } from '../lib/sf_knowledge_graph_core';

registerHandler('sf_knowledge_graph', async (args, context, _deps) => {
  const operation = args['operation'] as string;
  if (!operation) {
    return { success: false, error: 'operation required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  try {
    switch (operation) {
      case 'add_nodes': {
        if (!args['nodes']) return { success: false, error: 'nodes required for add_nodes' };
        const nodes: GraphNode[] = JSON.parse(args['nodes'] as string);
        return await addNodes(nodes, baseDir);
      }
      case 'add_edges': {
        if (!args['edges']) return { success: false, error: 'edges required for add_edges' };
        const edges: GraphEdge[] = JSON.parse(args['edges'] as string);
        return await addEdges(edges, baseDir);
      }
      case 'remove_nodes': {
        if (!args['node_ids']) return { success: false, error: 'node_ids required for remove_nodes' };
        const nodeIds: string[] = JSON.parse(args['node_ids'] as string);
        return await removeNodes(nodeIds, baseDir);
      }
      case 'update_node': {
        if (!args['node_id']) return { success: false, error: 'node_id required for update_node' };
        const updates: { label?: string; metadata?: Record<string, unknown> } = {};
        if (args['label'] !== undefined) updates.label = args['label'] as string;
        if (args['metadata'] !== undefined) updates.metadata = JSON.parse(args['metadata'] as string);
        return await updateNode(args['node_id'] as string, updates, baseDir);
      }
      case 'sync_from_spec': {
        if (!args['scope']) return { success: false, error: 'scope required for sync_from_spec' };
        return await syncFromSpec(args['work_item_id'] as string, baseDir, args['scope'] as SyncScope);
      }
      default:
        return { success: false, error: `Unknown operation: ${operation}` };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
