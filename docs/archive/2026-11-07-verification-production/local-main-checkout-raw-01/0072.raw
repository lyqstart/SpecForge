import {describe,it,expect} from 'vitest';
import {verificationRejectionDiagnostic} from '../../src/verification/rejection-diagnostic';
describe('private verification rejection diagnostics',()=>{
  it('retains a filesystem error class while excluding its private path and message',()=>{
    const error=Object.assign(new Error("ENOENT: open 'C:/private/credential'"),{code:'ENOENT',syscall:'open',path:'C:/private/credential'});
    const diagnostic=verificationRejectionDiagnostic(error);expect(diagnostic.system_code).toBe('ENOENT');expect(diagnostic.syscall).toBe('open');expect(JSON.stringify(diagnostic)).not.toContain('credential');
  });
  it('identifies a failed Runtime response without its body or provider data',()=>{
    const error=Object.assign(new Error('OpenCode GET /session/private failed with HTTP 404: secret-value'),{name:'OpenCodeRuntimeError',statusCode:404,responseBody:'secret-value'});
    const diagnostic=verificationRejectionDiagnostic(error);expect(diagnostic.http_status).toBe(404);expect(diagnostic.transport_category).toBe('http_error');expect(JSON.stringify(diagnostic)).not.toMatch(/secret-value|session\/private|responseBody/);
  });
  it('rejects arbitrary fields and malformed diagnostic tokens',()=>{
    const error=Object.assign(new Error('VERIFICATION_APPROVAL_INVALID:private detail'),{name:'bad secret',code:'secret token',syscall:'read private',statusCode:1000});
    const diagnostic=verificationRejectionDiagnostic(error);expect(diagnostic.message_family).toBe('VERIFICATION_APPROVAL_INVALID');expect(diagnostic.error_name).toBeNull();expect(diagnostic.system_code).toBeNull();expect(diagnostic.syscall).toBeNull();expect(diagnostic.http_status).toBeNull();expect(JSON.stringify(diagnostic)).not.toContain('private detail');
  });
  it('handles a non-Error rejection without serializing attacker-controlled data',()=>{expect(JSON.stringify(verificationRejectionDiagnostic({token:'private'}))).not.toContain('private');});
});
