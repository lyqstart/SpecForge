require('./trace-hook-v2.cjs');
beforeEach(context=>globalThis.__SF_WAL_BEGIN__(context));
afterEach(()=>globalThis.__SF_WAL_END__());
