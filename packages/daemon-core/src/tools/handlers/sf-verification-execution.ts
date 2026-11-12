import { registerHandler } from '../ToolDispatcher';
import { verificationRequestAbort } from '../../verification/request-context';
import {
  verificationRejectionDiagnostic,
  verificationPublicRejection,
} from '../../verification/rejection-diagnostic';

for (const tool of ['sf_verification_plan', 'sf_verification_run'] as const) {
  registerHandler(tool, async (args, context, deps) => {
    if (!deps.verificationRuntime)
      return { success: false, error: 'VERIFICATION_OWNER_UNAVAILABLE' };
    try {
      return tool === 'sf_verification_plan'
        ? await deps.verificationRuntime.plan(args, context)
        : await deps.verificationRuntime.run(args, context, verificationRequestAbort(context));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      // Unsupported input/OS diagnostics remain in private evidence; no provider response or arbitrary source is echoed.
      const code = /^(?:VERIFICATION|TOOL_INVOCATION|NODE_COMMAND)_[A-Z_]+$/.test(message)
        ? message
        : 'VERIFICATION_REQUEST_REJECTED';
      if (code === 'VERIFICATION_REQUEST_REJECTED')
        console.error(JSON.stringify(verificationRejectionDiagnostic(error)));
      return {
        success: false,
        error: code,
        application_passed: false,
        diagnostic: verificationPublicRejection(error),
      };
    }
  });
}
