// D21 fixed synthetic registry canary. No real credentials or caller-selected keys.
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Web.Script.Serialization;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

internal sealed class LpacRegistryReadCanary {
    readonly string subkey,nonce,fakeValue;
    readonly Action<string,object> record;
    bool created;
    internal LpacRegistryReadCanary(string nonce,Action<string,object> record) {
        Guid parsed;if(!Guid.TryParseExact(nonce,"N",out parsed))throw new InvalidOperationException("CANARY_NONCE");
        this.nonce=nonce;this.record=record;subkey="Software\\SpecForgeIsolationCanary-"+nonce;
        fakeValue="SYNTHETIC-NOT-A-REAL-CREDENTIAL-"+Guid.NewGuid().ToString("N");
        IntPtr handle;uint disposition;
        int status=RegCreateKeyExW(new IntPtr(unchecked((int)0x80000001)),subkey,0,null,0,0xf003f,IntPtr.Zero,out handle,out disposition);
        if(status!=0)throw new Win32Exception(status,"Create exact synthetic canary key");
        using(var key=RegistryKey.FromHandle(new SafeRegistryHandle(handle,true),RegistryView.Registry64)) {
            if(disposition!=1)throw new InvalidOperationException("CANARY_KEY_COLLISION");created=true;
            var security=key.GetAccessControl(AccessControlSections.Access|AccessControlSections.Owner);
            if(security.GetOwner(typeof(SecurityIdentifier)).Value!=WindowsIdentity.GetCurrent().User.Value)throw new InvalidOperationException("CANARY_OWNER_MISMATCH");
            key.SetValue("OwnerAttempt",nonce,RegistryValueKind.String);key.SetValue("FakeCredential",fakeValue,RegistryValueKind.String);key.Flush();
            record("canary_created",new{key="HKCU\\"+subkey,owner_attempt=nonce,value_name="FakeCredential",fake_value=fakeValue,synthetic_only=true,disposition=disposition,sddl=security.GetSecurityDescriptorSddlForm(AccessControlSections.Access|AccessControlSections.Owner),existing_acl_changed=false});
        }
    }
    static string Base64(string value){return Convert.ToBase64String(Encoding.UTF8.GetBytes(value));}
    internal string Script(bool progress=false,bool inheritTransport=false) {
        if(inheritTransport)return InheritedScript();
        // All names are fixed/owner-derived; fakeValue is deliberately absent.
        return "'use strict';"+(progress?"console.log('SFPROBE_STAGE:before_require');":"")+"const cp=require('node:child_process');"+(progress?"console.log('SFPROBE_STAGE:after_require');":"")+"\n"+
            "const decode=x=>Buffer.from(x,'base64').toString('utf8');\n"+
            "const reg=decode('"+Base64(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"reg.exe"))+"');\n"+
            "const canary=decode('"+Base64("HKCU\\"+subkey)+"');\n"+
            "const systemKey=decode('"+Base64("HKLM\\System\\CurrentControlSet\\Services\\WinSock2\\Parameters")+"');\n"+
            "function query(args){const r=cp.spawnSync(reg,args,{timeout:10000,maxBuffer:131072,windowsHide:true});return {status:r.status,signal:r.signal,error:r.error?r.error.code:null,stdout_b64:r.stdout?r.stdout.toString('base64'):'',stderr_b64:r.stderr?r.stderr.toString('base64'):''};}\n"+
            (progress?"console.log('SFPROBE_STAGE:before_system_query');\n":"")+"const system=query(['query',systemKey]);"+(progress?"console.log('SFPROBE_STAGE:after_system_query');":"")+"const target=query(['query',canary,'/v','FakeCredential']);console.log(JSON.stringify({probe:'D21_R01_REGISTRY_CANARY',pid:process.pid,system,target}));\n"+
            "if(system.status!==0||system.error||system.signal)process.exitCode=41;else if(target.status===0)process.exitCode=40;else if(target.status===1&&!target.error&&!target.signal)console.log('SPECFORGE_REGISTRY_CANARY_READ_DENIED');else process.exitCode=41;\n";
    }
    string InheritedScript() {
        return "'use strict';console.log('SFPROBE_STAGE:before_require');const cp=require('node:child_process');console.log('SFPROBE_STAGE:after_require');\n"+
            "const decode=x=>Buffer.from(x,'base64').toString('utf8');const reg=decode('"+Base64(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"reg.exe"))+"');\n"+
            "const canary=decode('"+Base64("HKCU\\"+subkey)+"');const systemKey=decode('"+Base64("HKLM\\System\\CurrentControlSet\\Services\\WinSock2\\Parameters")+"');\n"+
            "function query(label,args){console.log('SFPROBE_STAGE:'+label+'_begin');const r=cp.spawnSync(reg,args,{stdio:'inherit',timeout:5000,windowsHide:true});const x={status:r.status,signal:r.signal,error:r.error?r.error.code:null};console.log('\\nSFPROBE_STATUS:'+JSON.stringify({label,pid:process.pid,...x}));return x;}\n"+
            "const system=query('system',['query',systemKey]);let target=null;if(system.status===0&&!system.error&&!system.signal)target=query('target',['query',canary,'/v','FakeCredential']);\n"+
            "console.log('\\nSFPROBE_REPORT:'+JSON.stringify({probe:'D21_R01_REGISTRY_CANARY_INHERITED',pid:process.pid,system,target}));\n"+
            "if(system.status!==0||system.error||system.signal||target===null)process.exitCode=41;else if(target.status===0)process.exitCode=40;else if(target.status===1&&!target.error&&!target.signal)console.log('SPECFORGE_REGISTRY_CANARY_READ_DENIED');else process.exitCode=41;\n";
    }
    static bool Contains(byte[] bytes,byte[] pattern) {
        for(int i=0;i<=bytes.Length-pattern.Length;i++){int n=0;for(;n<pattern.Length&&bytes[i+n]==pattern[n];n++){}if(n==pattern.Length)return true;}return false;
    }
    internal bool ValidateInherited(byte[] stdout,byte[] stderr,uint exitCode) {
        // Only the fixed, frozen probe may emit this framing. This is not a
        // general untrusted-business stdout -> trusted receipt conversion.
        string text=Encoding.UTF8.GetString(stdout),prefix="SFPROBE_REPORT:";string payload=null;int count=0;
        foreach(var line in text.Split('\n'))if(line.StartsWith(prefix,StringComparison.Ordinal)){payload=line.Substring(prefix.Length).TrimEnd('\r');count++;}
        if(count!=1){record("registry_canary_result",new{transport="inherited_stdio_fixed_probe",result="INCONCLUSIVE_REPORT_FRAMING",application_exit_code=exitCode});return false;}
        var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(payload);
        if(data==null||!data.ContainsKey("probe")||(string)data["probe"]!="D21_R01_REGISTRY_CANARY_INHERITED"||!data.ContainsKey("system")||!(data["system"] is Dictionary<string,object>))throw new InvalidOperationException("INHERITED_REPORT_IDENTITY");
        var system=(Dictionary<string,object>)data["system"];
        bool control=system["status"]!=null&&Convert.ToInt32(system["status"])==0&&system["error"]==null&&system["signal"]==null;
        var target=data.ContainsKey("target")?data["target"] as Dictionary<string,object>:null;
        int? targetExit=target==null||target["status"]==null?(int?)null:Convert.ToInt32(target["status"]);
        bool exposed=Contains(stdout,Encoding.UTF8.GetBytes(fakeValue))||Contains(stdout,Encoding.Unicode.GetBytes(fakeValue))||Contains(stderr,Encoding.UTF8.GetBytes(fakeValue))||Contains(stderr,Encoding.Unicode.GetBytes(fakeValue));
        bool denied=control&&targetExit==1&&target["error"]==null&&target["signal"]==null&&!exposed&&exitCode==0&&text.EndsWith("SPECFORGE_REGISTRY_CANARY_READ_DENIED\n");
        record("registry_canary_result",new{transport="inherited_stdio_fixed_probe",positive_control=control,target_exit_code=targetExit,fake_value_exposed=exposed,application_exit_code=exitCode,result=exposed?"FAIL_HOST_FAKE_CREDENTIAL_READABLE":denied?"OBSERVED_SINGLE_CANARY_READ_DENIED":"INCONCLUSIVE",original_default_pipe_command_passed=false,remaining_checks="NOT_EXECUTED; no production acceptance"});
        return denied;
    }
    internal static Dictionary<string,object> ReadReport(string output) {
        if(String.IsNullOrWhiteSpace(output))return null;
        try {
            var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(output.Split('\n')[0].TrimEnd('\r'));
            if(data==null||!data.ContainsKey("probe")||!(data["probe"] is string)||(string)data["probe"]!="D21_R01_REGISTRY_CANARY"||!data.ContainsKey("system")||!(data["system"] is Dictionary<string,object>)||!data.ContainsKey("target")||!(data["target"] is Dictionary<string,object>))return null;
            return data;
        }catch(ArgumentException){return null;}catch(InvalidOperationException){return null;}
    }
    internal bool Validate(string output,uint exitCode) {
        var data=ReadReport(output);
        if(data==null){record("registry_canary_result",new{result="INCONCLUSIVE_NO_VALID_REPORT",application_exit_code=exitCode});return false;}
        var system=(Dictionary<string,object>)data["system"];var target=(Dictionary<string,object>)data["target"];
        bool control=system["status"]!=null&&Convert.ToInt32(system["status"])==0&&system["error"]==null&&system["signal"]==null;
        int? targetExit=target["status"]==null?(int?)null:Convert.ToInt32(target["status"]);
        byte[] observed=Convert.FromBase64String((string)target["stdout_b64"]);
        bool exposed=Encoding.ASCII.GetString(observed).Contains(fakeValue);
        bool denied=control&&targetExit==1&&target["error"]==null&&target["signal"]==null&&!exposed&&exitCode==0&&output.EndsWith("SPECFORGE_REGISTRY_CANARY_READ_DENIED\n");
        record("registry_canary_result",new{positive_control=control,target_exit_code=targetExit,fake_value_exposed=exposed,application_exit_code=exitCode,result=exposed?"FAIL_HOST_FAKE_CREDENTIAL_READABLE":denied?"OBSERVED_SINGLE_CANARY_READ_DENIED":"INCONCLUSIVE",remaining_checks="NOT_EXECUTED until this row succeeds; no production acceptance"});
        return denied;
    }
    internal bool ReconcileAndCleanup() {
        if(!created)return true;
        using(var key=Registry.CurrentUser.OpenSubKey(subkey,false)) {
            if(key==null)throw new InvalidOperationException("CANARY_KEY_DISAPPEARED");
            if((string)key.GetValue("OwnerAttempt")!=nonce)throw new InvalidOperationException("CANARY_OWNERSHIP_DRIFT");
            var values=key.GetValueNames();bool unchanged=(string)key.GetValue("FakeCredential")==fakeValue&&values.Length==2&&key.GetSubKeyNames().Length==0;
            record("canary_after",new{key="HKCU\\"+subkey,owner_attempt=nonce,values=values,fake_value=key.GetValue("FakeCredential"),unchanged=unchanged});
            if(!unchanged)throw new InvalidOperationException("CANARY_CONTENT_DRIFT");
        }
        // Exact new key only, non-recursive; existing parent Software is never deleted.
        Registry.CurrentUser.DeleteSubKey(subkey,false);
        using(var check=Registry.CurrentUser.OpenSubKey(subkey,false))if(check!=null)throw new InvalidOperationException("CANARY_CLEANUP_FAILED");
        record("canary_cleanup",new{key="HKCU\\"+subkey,removed=true,recursive=false,owner_attempt=nonce});created=false;return true;
    }
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern int RegCreateKeyExW(IntPtr parent,string key,uint reserved,string kind,uint options,uint access,IntPtr security,out IntPtr result,out uint disposition);
}
