/**
 * Current-release public API for version unification.
 *
 * Project schema ownership belongs to per-file schema_version and
 * @specforge/migration. This package exposes only the repository code-version
 * authority consumed by CLI and Daemon entry points.
 */
export { getCodeVersion } from './code-version.js';
