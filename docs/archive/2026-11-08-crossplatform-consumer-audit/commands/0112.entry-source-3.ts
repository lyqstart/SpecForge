import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { WorkflowLoader } from '../../src/engine/WorkflowLoader';

const builtinDir = fileURLToPath(
  new URL('../../../../configs/workflows/builtin/', import.meta.url),
);

describe('current release builtin workflow registry', () => {
  it('loads only the approved feature_spec workflow', async () => {
    const loader = new WorkflowLoader();
    const definitions = await loader.loadBuiltinWorkflows(builtinDir);

    expect(definitions.map((definition) => definition.id)).toEqual(['feature_spec']);
    expect(loader.listWorkflowIds()).toEqual(['feature_spec']);
  });
});
