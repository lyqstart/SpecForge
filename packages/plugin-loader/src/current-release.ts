/**
 * SpecForge V6 current-release Plugin Loader surface.
 *
 * Runtime plugin loading, registry, hot reload, sandbox and IPC are not part of
 * the current release. This entry exposes only the approved P0 static manifest
 * and permission checks.
 */
export {
  StaticChecker,
  createStaticChecker,
  ViolationReporter,
  type StaticCheckResult,
  type StaticCheckerConfig,
  type PathCheckResult,
  type PathCheckerConfig,
  type ViolationReportData,
} from './static-checker/index';

export {
  PermissionDeclarationValidator,
  permissionDeclarationValidator,
  type PermissionDeclarationError,
  type PermissionDeclarationValidationResult,
  type SimplifiedStaticCheckResult,
} from './permission-declaration-validator';

export {
  isPluginManifest,
  isValidSemver,
  type PluginManifest,
  type PluginManifestMetadata,
  type PluginPermission,
} from './manifest';
