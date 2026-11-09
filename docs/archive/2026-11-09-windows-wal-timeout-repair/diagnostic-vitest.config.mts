import original from '../../../.wal-original-a01/packages/daemon-core/vitest.config';
import { fileURLToPath } from 'node:url';
export default {
  ...original,
  test: {
    ...original.test,
    setupFiles: [fileURLToPath(new URL('./trace-worker-setup.cjs', import.meta.url))],
  },
};
