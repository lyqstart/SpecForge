/**
 * Current-release public API for version unification.
 *
 * Project schema ownership belongs to each persistent-file owner and the
 * current schema contract. This package exposes only the repository code-version
 * authority consumed by CLI and Daemon entry points.
 */
export { getCodeVersion } from './code-version.js';
