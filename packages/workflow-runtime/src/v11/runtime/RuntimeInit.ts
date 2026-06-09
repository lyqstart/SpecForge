/**
 * RuntimeInit.ts — SpecForge v1.1 Runtime initialization logic
 *
 * Initializes the .specforge/ directory structure per v1.1 standard:
 * - Creates .specforge/project/ directory
 * - Creates .specforge/work-items/ directory
 * - Creates .specforge/runtime/ directory
 * - Creates empty spec_manifest.json with correct schema
 * - Creates empty extension_registry.json with correct schema
 * - Blocks creation of forbidden directories
 * - Enforces legacy spec read-only
 *
 * Requirements: 1.13, 1.14, 1.15, 1.16, 1.17, 1.18, 1.19, 1.20
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { PathService } from './PathService.js';
import { PathPolicy } from './PathPolicy.js';
import { JsonParser } from './JsonParser.js';

/** Result of runtime initialization */
export interface InitResult {
  success: boolean;
  createdDirectories: string[];
  createdFiles: string[];
  errors: string[];
}

/** Empty spec_manifest.json template */
export function createEmptySpecManifest(projectName: string): object {
  return {
    schema_version: '1.0',
    project_spec_version: 'PSV-0001',
    project_name: projectName,
    project: {
      extension_registry: '.specforge/project/extension_registry.json',
      requirements_index: '.specforge/project/requirements_index.md',
      design_index: '.specforge/project/design_index.md',
      architecture: '.specforge/project/architecture.md',
      glossary: '.specforge/project/glossary.md',
      decisions: '.specforge/project/decisions.md',
      trace_matrix: '.specforge/project/trace_matrix.md',
    },
    modules: [],
    last_merged_work_item: null,
    last_merged_at: null,
  };
}

/** Empty extension_registry.json template */
export function createEmptyExtensionRegistry(): object {
  return {
    schema_version: '1.0',
    project_spec_version: 'PSV-0001',
    namespaces: {
      requirement_types: [],
      design_types: [],
      task_types: [],
      verification_types: [],
      gate_types: [],
    },
    updated_by_work_item: null,
    updated_at: null,
  };
}

/**
 * RuntimeInit — handles .specforge/ directory initialization.
 *
 * Requirements: 1.13-1.20
 */
export class RuntimeInit {
  private readonly pathService: PathService;
  private readonly pathPolicy: PathPolicy;

  constructor(projectRoot: string) {
    this.pathService = new PathService(projectRoot);
    this.pathPolicy = new PathPolicy();
  }

  /**
   * Initialize the .specforge/ directory structure.
   * Requirements: 1.13, 1.14, 1.15, 1.16, 1.17
   */
  initialize(projectName: string = 'unnamed-project'): InitResult {
    const createdDirectories: string[] = [];
    const createdFiles: string[] = [];
    const errors: string[] = [];

    try {
      // Create base .specforge/ directory
      this.ensureDir(this.pathService.specDir(), createdDirectories, errors);

      // Requirement 1.13: Create .specforge/project/
      this.ensureDir(this.pathService.projectDir(), createdDirectories, errors);

      // Requirement 1.14: Create .specforge/work-items/
      this.ensureDir(this.pathService.workItemsDir(), createdDirectories, errors);

      // Requirement 1.15: Create .specforge/runtime/
      this.ensureDir(this.pathService.runtimeDir(), createdDirectories, errors);

      // Create runtime subdirectories
      this.ensureDir(
        this.pathService.posixJoin(this.pathService.runtimeDir(), 'logs'),
        createdDirectories,
        errors,
      );
      this.ensureDir(
        this.pathService.posixJoin(this.pathService.runtimeDir(), 'checkpoints'),
        createdDirectories,
        errors,
      );

      // Requirement 1.16: Create empty spec_manifest.json
      const manifestPath = this.pathService.specManifestPath();
      const manifestContent = createEmptySpecManifest(projectName);
      this.writeJsonFile(manifestPath, manifestContent, createdFiles, errors);

      // Requirement 1.17: Create empty extension_registry.json
      const registryPath = this.pathService.extensionRegistryPath();
      const registryContent = createEmptyExtensionRegistry();
      this.writeJsonFile(registryPath, registryContent, createdFiles, errors);
    } catch (err) {
      errors.push(`Initialization error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      success: errors.length === 0,
      createdDirectories,
      createdFiles,
      errors,
    };
  }

  /**
   * Prevent creation of forbidden directories.
   * Requirements: 1.18, 1.19, 1.20
   */
  canCreateDirectory(dirPath: string): { allowed: boolean; reason?: string | undefined } {
    const result = this.pathPolicy.canCreateDirectory(dirPath);
    return { allowed: result.valid, reason: result.reason };
  }

  /**
   * Check if write to legacy spec path should be blocked.
   * Requirements: 1.11, 1.12
   */
  isLegacySpecWriteBlocked(filePath: string): boolean {
    return this.pathPolicy.isLegacySpecPath(filePath);
  }

  /**
   * Check if read from legacy spec path is allowed.
   * Requirement: 1.12
   */
  isLegacySpecReadAllowed(filePath: string): boolean {
    return this.pathPolicy.isLegacySpecPath(filePath);
  }

  // ---- Private helpers ----

  private ensureDir(dirPath: string, created: string[], errors: string[]): void {
    try {
      // Use native path for fs operations
      const nativePath = dirPath.replace(/\//g, path.sep);
      if (!fs.existsSync(nativePath)) {
        fs.mkdirSync(nativePath, { recursive: true });
        created.push(dirPath);
      }
    } catch (err) {
      errors.push(`Failed to create directory ${dirPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private writeJsonFile(filePath: string, content: object, created: string[], errors: string[]): void {
    try {
      const nativePath = filePath.replace(/\//g, path.sep);
      const dir = path.dirname(nativePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const serialized = JsonParser.serialize(content);
      if (!serialized.success || serialized.data === undefined) {
        errors.push(`Failed to serialize JSON for ${filePath}: ${serialized.error}`);
        return;
      }

      fs.writeFileSync(nativePath, serialized.data, 'utf-8');
      created.push(filePath);
    } catch (err) {
      errors.push(`Failed to write file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
