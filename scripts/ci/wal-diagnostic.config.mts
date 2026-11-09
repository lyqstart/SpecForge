import original from '../../packages/daemon-core/vitest.config';
import { fileURLToPath } from 'node:url';
export default {
  ...original,
  test: { ...original.test, setupFiles: [fileURLToPath(new URL('./wal-trace-worker-setup.cjs', import.meta.url))] },
};
