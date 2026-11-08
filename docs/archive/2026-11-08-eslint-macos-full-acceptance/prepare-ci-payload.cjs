const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=__dirname;let s=fs.readFileSync('.github/workflows/code-quality.yml','utf8');assert(s.includes('branches: [main]'));s=s.replace('branches: [main]','branches: [main, \'codex/**\']');const start=s.indexOf('  # ─── 单元测试'),end=s.indexOf('  # ─── 硬编码路径 Lint',start);assert(start>0&&end>start);const block=`  # Actual full regression and complete lint on every supported host.
  test:
    name: Full lint/build/regression (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    timeout-minutes: 60
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    env:
      SPECFORGE_CI_REPORT_DIR: ${{ runner.temp }}/specforge-full-regression
    steps:
      - name: 检出代码
        uses: actions/checkout@v4
      - name: 安装 Node
        uses: actions/setup-node@v4
        with:
          node-version: '24.19.0'
      - name: 安装 Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: '1.3.14'
      - name: Bind pinned Windows verification Node
        if: runner.os == 'Windows'
        shell: pwsh
        run: '"SPECFORGE_VERIFICATION_NODE_SOURCE=$((Get-Command node).Source)" >> $env:GITHUB_ENV'
      - name: 安装依赖
        run: bun install --frozen-lockfile
      - name: 构建当前发布 workspace
        run: node scripts/run-ci-regression.mjs build
      - name: 完整 ESLint
        run: node scripts/run-ci-regression.mjs lint
      - name: 运行当前发布 workspace 测试
        run: node scripts/run-ci-regression.mjs workspace
      - name: 运行当前 Root 测试
        run: node scripts/run-ci-regression.mjs root
      - name: Upload complete raw regression evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: full-regression-evidence-${{ matrix.os }}
          path: ${{ runner.temp }}/specforge-full-regression
          if-no-files-found: error
          retention-days: 14

`;s=s.slice(0,start)+block+s.slice(end);fs.writeFileSync(path.join(root,'payload/code-quality.yml'),s,{flag:'wx'});let dist=fs.readFileSync('.github/workflows/distribution-smoke.yml','utf8');assert.equal(dist.split("branches: [main, 'release/**']").length-1,2);dist=dist.replace("branches: [main, 'release/**']","branches: [main, 'release/**', 'codex/**']");fs.writeFileSync(path.join(root,'payload/distribution-smoke.yml'),dist,{flag:'wx'});fs.writeFileSync(path.join(root,'official-tooling-references.json'),JSON.stringify({utc:new Date().toISOString(),sources:[{url:'https://eslint.org/docs/latest/use/configure/migration-guide',use:'FlatCompat translates existing legacy rule sources into one flat config; no second semantic rule list.'},{url:'https://typescript-eslint.io/users/dependency-versions/',use:'Official current TypeScript/Node/ESLint supported ranges checked; actual installed8.59.3 family and9.39.4 pinned and executed.'},{url:'https://github.com/import-js/eslint-import-resolver-typescript',use:'First-party resolver source/configuration; explicit project identity replaces missing implicit resolver.'}],product_authority_changed:false},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({real_full_platforms:['ubuntu-latest','windows-latest','macos-latest'],commands:['build','complete lint','workspace full','Root current'],pre_main_branch_ci:'codex/**',raw_receipts:true}));
