import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Project Structure', () => {
  it('should have all required configuration files', () => {
    const requiredFiles = [
      'package.json',
      'tsconfig.json',
      '.eslintrc.json',
      '.prettierrc.json',
      '.gitignore',
      'vitest.config.ts',
      'README.md'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(__dirname, '..', '..', file);
      expect(fs.existsSync(filePath), `Missing file: ${file}`).toBe(true);
    }
  });

  it('should have correct directory structure', () => {
    const requiredDirs = [
      'src',
      'src/types',
      'tests',
      'tests/unit',
      'tests/property',
      'tests/integration'
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join(__dirname, '..', '..', dir);
      expect(fs.existsSync(dirPath), `Missing directory: ${dir}`).toBe(true);
    }
  });

  it('should have valid package.json', () => {
    const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    expect(packageJson.name).toBe('@specforge/observability');
    expect(packageJson.version).toBe('0.1.0');
    expect(packageJson.type).toBe('module');
    expect(packageJson.main).toBe('dist/index.js');
    expect(packageJson.types).toBe('dist/index.d.ts');
    
    // Check required scripts
    const requiredScripts = ['build', 'test', 'lint', 'format', 'clean'];
    for (const script of requiredScripts) {
      expect(packageJson.scripts[script]).toBeDefined();
    }

    // Check dependencies
    expect(packageJson.dependencies['@specforge/types']).toBe('workspace:*');
    expect(packageJson.dependencies['@specforge/daemon-core']).toBe('workspace:*');
    expect(packageJson.dependencies['@specforge/permission-engine']).toBe('workspace:*');
    expect(packageJson.dependencies.uuid).toBeDefined();
  });

  it('should have valid tsconfig.json', () => {
    const tsconfigPath = path.join(__dirname, '..', '..', 'tsconfig.json');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));

    expect(tsconfig.compilerOptions.target).toBe('ES2022');
    expect(tsconfig.compilerOptions.module).toBe('ESNext');
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.outDir).toBe('./dist');
    expect(tsconfig.compilerOptions.rootDir).toBe('.');
    expect(tsconfig.compilerOptions.declaration).toBe(true);
    expect(tsconfig.compilerOptions.sourceMap).toBe(true);
  });
});