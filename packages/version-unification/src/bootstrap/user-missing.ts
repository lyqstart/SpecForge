/**
 * Bootstrap handler for when User Manifest is missing.
 *
 * @see requirements.md §Requirement 14 (User Manifest 缺失的兜底)
 * @see design.md §bootstrap/ (R14 / R15)
 */

export interface HandleUserManifestMissingArgs {
  /** Expected path where the user manifest should be created */
  expectedPath: string;
  /** Installer command to create the user manifest */
  installerCommand: string;
  /** Print function for outputting messages */
  print: (msg: string) => void;
}

/**
 * Handles the case when User_Manifest file does not exist on disk.
 *
 * Behavior (R14.1, R14.2):
 * - Prints an instructional message naming the expected User_Manifest path
 * - Prints the exact installer command to create it
 * - Exits with status code 0
 * - Does NOT modify any project data
 *
 * @param args - Handler arguments
 * @returns Promise resolving to exit code 0
 */
export async function handleUserManifestMissing(
  args: HandleUserManifestMissingArgs
): Promise<{ exitCode: 0 }> {
  const { expectedPath, installerCommand, print } = args;

  // Print instructional message as per R14.1
  print(`User manifest not found at: ${expectedPath}`);
  print('');
  print(`To initialize SpecForge, run the following command:`);
  print(`  ${installerCommand}`);
  print('');
  print('After running the command above, SpecForge will be ready to use.');

  // Exit with status code 0 as per R14.2
  // Note: The actual process.exit() call should be handled by the caller
  // This function returns the exit code information for the caller to use
  return { exitCode: 0 };
}