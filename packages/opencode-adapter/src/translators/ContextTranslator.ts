/**
 * Context Translator
 *
 * Converts OpenCode context objects to Daemon-neutral session contexts.
 */

import { OpenCodeContext, TranslationResult, DaemonSessionContext, IContextTranslator } from '../types';

/**
 * Context Translator
 *
 * Converts OpenCode `ctx` objects to Daemon-neutral session contexts.
 * Handles edge cases and unsupported features by returning "unsupported" result.
 */
export class ContextTranslator implements IContextTranslator {
  /**
   * Check if a string is valid (not null, undefined, or whitespace-only)
   */
  private isValidString(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return value.trim().length > 0;
  }

  /**
   * Translate OpenCode context to Daemon session context
   *
   * @param ocContext - OpenCode context object
   * @returns Translation result with Daemon context or unsupported indicator
   */
  translate(ocContext: OpenCodeContext): TranslationResult<DaemonSessionContext> {
    // Validate required fields
    if (!this.isValidString(ocContext.oc_sid)) {
      return {
        success: false,
        unsupported: true,
        reason: 'Missing required field: oc_sid',
      };
    }

    if (!this.isValidString(ocContext.workspace)) {
      return {
        success: false,
        unsupported: true,
        reason: 'Missing required field: workspace',
      };
    }

    // Translate to Daemon format
    const daemonContext: DaemonSessionContext = {
      sessionId: ocContext.oc_sid,
      userId: ocContext.oc_uid,
      workspace: ocContext.workspace,
      kernelVersion: ocContext.oc_version,
      model: ocContext.model,
      env: ocContext.env,
    };

    return { success: true, data: daemonContext };
  }

  /**
   * Check if a context field is supported
   *
   * @param fieldName - Name of the field to check
   * @returns Whether the field is supported for translation
   */
  isFieldSupported(fieldName: string): boolean {
    const supportedFields = ['oc_sid', 'oc_uid', 'workspace', 'oc_version', 'model', 'env'];
    return supportedFields.includes(fieldName);
  }
}
