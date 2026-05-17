/**
 * Workflow Loader
 * High-level API for loading and managing workflow definitions
 * Integrates with WorkflowEngine for seamless workflow loading
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkflowDefinitionLoader, ValidationResult } from '../loaders/WorkflowDefinitionLoader.js';
import { WorkflowDefinition } from '../types.js';

/**
 * Schema version migration handler
 */
export interface SchemaMigration {
  from: string;
  to: string;
  migrate: (definition: any) => any;
}

/**
 * Workflow Loader
 * Provides high-level API for loading workflow definitions with schema version support
 */
export class WorkflowLoader {
  private definitionLoader: WorkflowDefinitionLoader;
  private migrations: Map<string, SchemaMigration> = new Map();
  private loadedDefinitions: Map<string, WorkflowDefinition> = new Map();

  constructor() {
    this.definitionLoader = new WorkflowDefinitionLoader();
    this.registerDefaultMigrations();
  }

  /**
   * Register default schema migrations
   */
  private registerDefaultMigrations(): void {
    // Currently only supporting 1.0, so no migrations needed
    // This is a placeholder for future schema versions
  }

  /**
   * Register a custom schema migration
   * @param migration The migration to register
   */
  registerMigration(migration: SchemaMigration): void {
    const key = `${migration.from}->${migration.to}`;
    this.migrations.set(key, migration);
  }

  /**
   * Load a workflow definition from a file
   * Automatically handles schema version migration if needed
   * @param filePath Path to the workflow definition file
   * @returns The loaded workflow definition
   * @throws Error if file cannot be read, parsed, or validated
   */
  async loadFromFile(filePath: string): Promise<WorkflowDefinition> {
    try {
      const definition = await this.definitionLoader.loadFromFile(filePath);
      this.loadedDefinitions.set(definition.id, definition);
      return definition;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load workflow from file ${filePath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Load a workflow definition from a JSON string
   * @param jsonString JSON string containing the workflow definition
   * @returns The loaded workflow definition
   * @throws Error if JSON is invalid or validation fails
   */
  loadFromJSON(jsonString: string): WorkflowDefinition {
    try {
      const definition = this.definitionLoader.loadFromJSON(jsonString);
      this.loadedDefinitions.set(definition.id, definition);
      return definition;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load workflow from JSON: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Load a workflow definition from a YAML string
   * @param yamlString YAML string containing the workflow definition
   * @returns The loaded workflow definition
   * @throws Error if YAML is invalid or validation fails
   */
  loadFromYAML(yamlString: string): WorkflowDefinition {
    try {
      const definition = this.definitionLoader.loadFromYAML(yamlString);
      this.loadedDefinitions.set(definition.id, definition);
      return definition;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load workflow from YAML: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Load a workflow definition from an object
   * @param obj Object containing the workflow definition
   * @returns The loaded workflow definition
   * @throws Error if object is invalid or validation fails
   */
  loadFromObject(obj: unknown): WorkflowDefinition {
    try {
      const definition = this.definitionLoader.loadFromObject(obj);
      this.loadedDefinitions.set(definition.id, definition);
      return definition;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load workflow from object: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Load a workflow definition from a directory
   * Loads all JSON/YAML files in the directory
   * @param dirPath Path to the directory containing workflow definitions
   * @returns Array of loaded workflow definitions
   * @throws Error if directory cannot be read
   */
  async loadFromDirectory(dirPath: string): Promise<WorkflowDefinition[]> {
    try {
      const files = await fs.readdir(dirPath);
      const definitions: WorkflowDefinition[] = [];

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
          const filePath = path.join(dirPath, file);
          try {
            const definition = await this.loadFromFile(filePath);
            definitions.push(definition);
          } catch (error) {
            // Log error but continue loading other files
            console.warn(`Failed to load workflow from ${filePath}:`, error);
          }
        }
      }

      return definitions;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load workflows from directory ${dirPath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Validate a workflow definition
   * @param definition The workflow definition to validate
   * @returns Validation result with errors if any
   */
  validate(definition: WorkflowDefinition): ValidationResult {
    return this.definitionLoader.validate(definition);
  }

  /**
   * Validate a workflow definition and throw if invalid
   * @param definition The workflow definition to validate
   * @throws Error if validation fails
   */
  validateOrThrow(definition: WorkflowDefinition): void {
    const result = this.validate(definition);
    if (!result.valid) {
      const errorMessages = result.errors.map(e => `${e.field}: ${e.message}`).join('\n');
      throw new Error(`Workflow definition validation failed:\n${errorMessages}`);
    }
  }

  /**
   * Migrate a workflow definition to a target schema version
   * @param definition The workflow definition to migrate
   * @param targetVersion The target schema version
   * @returns The migrated workflow definition
   * @throws Error if migration path is not available
   */
  migrate(definition: any, targetVersion: string): WorkflowDefinition {
    const currentVersion = definition.schema_version || '1.0';

    if (currentVersion === targetVersion) {
      // No migration needed
      return this.definitionLoader.loadFromObject(definition);
    }

    // Find migration path
    const migrationKey = `${currentVersion}->${targetVersion}`;
    const migration = this.migrations.get(migrationKey);

    if (!migration) {
      throw new Error(
        `No migration path found from schema version ${currentVersion} to ${targetVersion}`
      );
    }

    // Apply migration
    const migratedDefinition = migration.migrate(definition);
    return this.definitionLoader.loadFromObject(migratedDefinition);
  }

  /**
   * Get a previously loaded workflow definition by ID
   * @param workflowId The workflow ID
   * @returns The workflow definition or undefined if not found
   */
  getLoadedDefinition(workflowId: string): WorkflowDefinition | undefined {
    return this.loadedDefinitions.get(workflowId);
  }

  /**
   * Get all loaded workflow definitions
   * @returns Array of all loaded workflow definitions
   */
  getAllLoadedDefinitions(): WorkflowDefinition[] {
    return Array.from(this.loadedDefinitions.values());
  }

  /**
   * Clear all loaded workflow definitions
   */
  clearLoadedDefinitions(): void {
    this.loadedDefinitions.clear();
  }

  /**
   * Check if a workflow definition is loaded
   * @param workflowId The workflow ID
   * @returns true if the workflow is loaded, false otherwise
   */
  isLoaded(workflowId: string): boolean {
    return this.loadedDefinitions.has(workflowId);
  }

  /**
   * Get the underlying WorkflowDefinitionLoader
   * For advanced use cases where direct access to the loader is needed
   */
  getDefinitionLoader(): WorkflowDefinitionLoader {
    return this.definitionLoader;
  }
}
