export interface QualificationTemporaryDirectory {
  requested: string;
  canonical: string;
  ancestors: Array<{ path: string; kind: 'symlink' | 'directory' | 'other'; target?: string }>;
  environment: { TMPDIR: string; TEMP: string; TMP: string };
}
/** Resolve the developer-test temporary root without changing application guards. */
export function qualifyTemporaryEnvironment(requested?: string): QualificationTemporaryDirectory;
