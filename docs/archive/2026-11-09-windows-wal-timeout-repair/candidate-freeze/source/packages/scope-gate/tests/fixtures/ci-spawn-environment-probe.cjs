// Unit-only process discovery double. Its reports are never release evidence.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
if (process.env.SF_CI_SPAWN_UNIT_PROBE !== '1') throw new Error('UNIT_PROBE_REQUIRED');
const success = (stdout) => ({
  status: 0,
  stdout: Buffer.from(stdout),
  stderr: Buffer.alloc(0),
  signal: null,
});
cp.spawnSync = (executable, args, options) => {
  if (executable === 'git' && args[0] === 'status') return success('');
  if (executable === 'git' && args[0] === 'rev-parse') return success('1'.repeat(40) + '\n');
  if (args[0] === '-e') return success(process.execPath);
  if (args[0] === '--version') return success('1.3.14\n');
  if (executable === process.execPath && args[0] === 'run' && args[1] === 'lint') {
    const capture = process.env.SF_CI_ENV_CAPTURE;
    if (!capture || !path.isAbsolute(capture)) throw new Error('UNIT_CAPTURE_REQUIRED');
    fs.writeFileSync(
      capture,
      JSON.stringify({ TEMP: options.env.TEMP, TMP: options.env.TMP, TMPDIR: options.env.TMPDIR }),
      { flag: 'wx' }
    );
    return success('unit phase execution double\n');
  }
  throw new Error('UNEXPECTED_UNIT_PROBE_PROCESS');
};
syncBuiltinESMExports();
