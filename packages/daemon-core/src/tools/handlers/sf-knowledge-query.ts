import { registerHandler } from '../ToolDispatcher';
import { getNode, getNeighbors, getSubgraph, getOverview, impactAnalysis, tracePath } from '../lib/sf_knowledge_query_core';
import type { Direction, QueryFilter } from '../lib/sf_knowledge_query_core';
import type { NodeType, EdgeType } from '../lib/sf_knowledge_graph_core';

registerHandler('sf_knowledge_query', async (args, context, _deps) => {
  const queryType = args['query_type'] as string;
  if (!queryType) {
    return { success: false, error: 'query_type required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  const filter: QueryFilter | undefined =
    args['filter_work_item_id'] || args['filter_node_type'] || args['filter_edge_type']
      ? {
          work_item_id: args['filter_work_item_id'] as string | undefined,
          node_type: args['filter_node_type'] as NodeType | undefined,
          edge_type: args['filter_edge_type'] as EdgeType | undefined,
        }
      : undefined;

  try {
    switch (queryType) {
      case 'get_node': {
        if (!args['node_id']) return { query_type: 'get_node', result_count: 0, nodes: [], edges: [], found: false, message: 'node_id required' };
        return await getNode(args['node_id'] as string, baseDir);
      }
      case 'get_neighbors': {
        if (!args['node_id']) return { query_type: 'get_neighbors', result_count: 0, nodes: [], edges: [], found: false, message: 'node_id required' };
        return await getNeighbors(args['node_id'] as string, baseDir, filter);
      }
      case 'get_subgraph': {
        if (!args['work_item_id']) return { query_type: 'get_subgraph', result_count: 0, nodes: [], edges: [], found: false, message: 'work_item_id required' };
        return await getSubgraph(args['work_item_id'] as string, baseDir);
      }
      case 'get_overview': {
        return await getOverview(baseDir);
      }
      case 'impact_analysis': {
        if (!args['node_id']) return { query_type: 'impact_analysis', result_count: 0, nodes: [], edges: [], found: false, message: 'node_id required' };
        const direction: Direction = (args['direction'] as Direction) || 'downstream';
        const maxDepth = (args['max_depth'] as number) ?? 3;
        return await impactAnalysis(args['node_id'] as string, direction, maxDepth, baseDir, filter, args['include_inferred'] as boolean | undefined);
      }
      case 'trace_path': {
        if (!args['source_id'] || !args['target_id']) {
          return { query_type: 'trace_path', result_count: 0, nodes: [], edges: [], found: false, message: 'source_id and target_id required', paths: [] };
        }
        return await tracePath(args['source_id'] as string, args['target_id'] as string, baseDir, {
          max_depth: (args['max_depth'] as number) ?? 5,
          max_paths: (args['max_paths'] as number) ?? 10,
        });
      }
      default:
        return { query_type: 'error', result_count: 0, nodes: [], edges: [], message: `Unknown query_type: ${queryType}` };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
