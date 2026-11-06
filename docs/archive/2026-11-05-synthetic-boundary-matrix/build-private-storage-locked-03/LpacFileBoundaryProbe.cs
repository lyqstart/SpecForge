// Fixed D21 synthetic file/node:test/descendant probe. No public execution API.
using System;using System.IO;using System.Text;using System.Linq;
using System.Collections.Generic;using System.Security.Cryptography;
using System.Security.AccessControl;using System.Security.Principal;
using System.Web.Script.Serialization;
internal sealed class LpacFileBoundaryProbe {
    readonly string root,input,runtime,profile,shadow,fake;
    readonly Action<string,object> record;
    readonly JavaScriptSerializer json=new JavaScriptSerializer();
    Dictionary<string,string> baseline;
    readonly bool privateRegistry;
    internal LpacFileBoundaryProbe(string root,string input,string runtime,string profile,Action<string,object> record,bool privateRegistry=false){
        this.privateRegistry=privateRegistry;
        this.root=root;this.input=input;this.runtime=runtime;this.profile=profile;this.record=record;
        string directory=Path.Combine(root,"shadow-home");if(Directory.Exists(directory))throw new InvalidOperationException("SHADOW_COLLISION");
        Directory.CreateDirectory(directory);var user=WindowsIdentity.GetCurrent().User;var system=new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null);
        var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);var inherit=InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit;
        acl.AddAccessRule(new FileSystemAccessRule(user,FileSystemRights.FullControl,inherit,PropagationFlags.None,AccessControlType.Allow));
        acl.AddAccessRule(new FileSystemAccessRule(system,FileSystemRights.FullControl,inherit,PropagationFlags.None,AccessControlType.Allow));Directory.SetAccessControl(directory,acl);
        shadow=Path.Combine(directory,"fake-credentials.txt");fake="SYNTHETIC-ONLY-"+Guid.NewGuid().ToString("N");
        using(var f=new FileStream(shadow,FileMode.CreateNew,FileAccess.Write)){var bytes=Encoding.UTF8.GetBytes(fake);f.Write(bytes,0,bytes.Length);}
        string positive=Path.Combine(input,"fixture.txt");using(var f=new FileStream(positive,FileMode.CreateNew,FileAccess.Write)){var bytes=Encoding.UTF8.GetBytes("FIXED_READ_CONTROL");f.Write(bytes,0,bytes.Length);}
        record("file_fixture_created",new{shadow=shadow,synthetic_value=fake,positive=positive,shadow_sddl=Directory.GetAccessControl(directory).GetSecurityDescriptorSddlForm(AccessControlSections.Access|AccessControlSections.Owner),existing_acl_changed=false});
        if(privateRegistry){string source=Path.GetFullPath(".tmp/verification-lpac-build/LpacPrivateRegistryChild.exe");File.Copy(source,Path.Combine(input,"LpacPrivateRegistryChild.exe"),false);record("private_registry_helper_copied",new{source=source,sha256=Hash(source),target=Path.Combine(input,"LpacPrivateRegistryChild.exe")});}
    }
    static string Hash(string file){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(File.ReadAllBytes(file))).Replace("-","").ToLowerInvariant();}
    Dictionary<string,string> Inventory(){var files=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);foreach(var directory in new[]{input,runtime,profile,Path.GetDirectoryName(shadow)})foreach(var file in Directory.GetFiles(directory,"*",SearchOption.AllDirectories)){if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("FIXTURE_REPARSE");files.Add(file,Hash(file));}return files;}
    internal void Freeze(){baseline=Inventory();record("file_fixture_frozen",new{files=baseline.Select(p=>new{path=p.Key,sha256=p.Value}).ToArray(),synthetic_only=true});}
    internal string Script(){
        string cfg=Convert.ToBase64String(Encoding.UTF8.GetBytes(json.Serialize(new{positive=Path.Combine(input,"fixture.txt"),shadow=shadow,writes=new[]{input,runtime,profile,Path.Combine(profile,"Temp")},privateRegistry=privateRegistry,helper=Path.Combine(input,"LpacPrivateRegistryChild.exe"),nonce=Path.GetFileName(root)})));
        return "'use strict';const fs=require('node:fs'),assert=require('node:assert/strict'),test=require('node:test'),cp=require('node:child_process');\n"+
            "const cfg=JSON.parse(Buffer.from('"+cfg+"','base64').toString('utf8'));const role=Number(process.argv[1]||0);if(!Number.isInteger(role)||role<0||role>2)throw Error('ROLE');\n"+
            "console.log('SFFILE_STAGE:'+JSON.stringify({role,pid:process.pid,stage:'ready'}));\n"+
            "async function main(){await test('fixed builtin node:test role '+role,()=>{assert.equal(2+2,4);console.log('SFFILE_POSITIVE:'+role);});const rows=[];\n"+
            "try{rows.push({kind:'positive_read',ok:fs.readFileSync(cfg.positive,'utf8')==='FIXED_READ_CONTROL'});}catch(e){rows.push({kind:'positive_read',ok:false,error:e.code});}\n"+
            "try{fs.readFileSync(cfg.shadow);rows.push({kind:'shadow_read',ok:false,unexpected_access:true});}catch(e){rows.push({kind:'shadow_read',ok:e.code==='EACCES'||e.code==='EPERM',error:e.code});}\n"+
            "for(const [index,p]of cfg.writes.entries()){try{fs.writeFileSync(p+'\\\\unauthorized-role-'+role+'.txt','SYNTHETIC-WRITE',{flag:'wx'});rows.push({kind:'write_'+index,ok:false,unexpected_access:true});}catch(e){rows.push({kind:'write_'+index,ok:e.code==='EACCES'||e.code==='EPERM',error:e.code});}}\n"+
            "try{fs.writeFileSync(cfg.shadow,'SYNTHETIC-MUTATION');rows.push({kind:'shadow_write',ok:false,unexpected_access:true});}catch(e){rows.push({kind:'shadow_write',ok:e.code==='EACCES'||e.code==='EPERM',error:e.code});}\n"+
            "let child=null;if(rows.every(r=>r.ok)&&role<2){const r=cp.spawnSync(process.execPath,['-e',process.execArgv[1],String(role+1)],{stdio:'inherit',timeout:8000,windowsHide:true});child={status:r.status,signal:r.signal,error:r.error?r.error.code:null};}\n"+
            "if(rows.every(r=>r.ok)&&role===2&&cfg.privateRegistry){const r=cp.spawnSync(cfg.helper,[cfg.nonce],{stdio:'inherit',timeout:5000,windowsHide:true});child={status:r.status,signal:r.signal,error:r.error?r.error.code:null};}\n"+
            "console.log('SFFILE_REPORT:'+JSON.stringify({probe:'D21_FILE_DESCENDANTS_V1',role,pid:process.pid,rows,child}));if(rows.some(r=>!r.ok)||((role<2||cfg.privateRegistry)&&(!child||child.status!==0||child.error||child.signal)))process.exitCode=42;}\n"+
            "setTimeout(()=>main().catch(e=>{console.error('SFFILE_FAILURE:'+String(e));process.exitCode=43;}),700);\n";
    }
    internal bool Validate(byte[] stdout,byte[] stderr,uint exit,HashSet<uint> verified){
        string text=Encoding.UTF8.GetString(stdout);var reports=new List<Dictionary<string,object>>();
        foreach(var line in text.Split('\n'))if(line.StartsWith("SFFILE_REPORT:",StringComparison.Ordinal))reports.Add(json.Deserialize<Dictionary<string,object>>(line.Substring(14).TrimEnd('\r')));
        bool noLeak=true;foreach(var bytes in new[]{stdout,stderr})foreach(var encoding in new[]{Encoding.UTF8,Encoding.Unicode})if(IndexOf(bytes,encoding.GetBytes(fake)))noLeak=false;
        bool valid=exit==0&&noLeak&&reports.Count==3;var roles=new HashSet<int>();
        foreach(var data in reports){int role=Convert.ToInt32(data["role"]);roles.Add(role);var rows=((System.Collections.IEnumerable)data["rows"]).Cast<Dictionary<string,object>>().ToArray();valid&=(string)data["probe"]=="D21_FILE_DESCENDANTS_V1"&&verified.Contains(Convert.ToUInt32(data["pid"]))&&rows.Length==7&&text.Contains("SFFILE_POSITIVE:"+role+"\n");foreach(var row in rows)valid&=row.ContainsKey("ok")&&(bool)row["ok"];if(role<2){var child=data["child"] as Dictionary<string,object>;valid&=child!=null&&child["status"]!=null&&Convert.ToInt32(child["status"])==0&&child["error"]==null&&child["signal"]==null;}}
        if(privateRegistry){var native=ReadPrivateReports(text);bool denied=native.Count==1&&(string)native[0]["probe"]=="D21_PRIVATE_REGISTRY_NATIVE_V2"&&verified.Contains(Convert.ToUInt32(native[0]["pid"]))&&(bool)native[0]["write_denied"];valid&=denied;record("private_registry_result",new{accepted=denied,native_reports=native.ToArray(),scope="Native GetAppContainerRegistryLocation write check only"});}
        valid&=roles.SetEquals(new[]{0,1,2});record("file_boundary_result",new{accepted=valid,application_exit_code=exit,raw_fake_exposed=!noLeak,reports=reports.ToArray(),independently_verified_pids=verified.ToArray(),scope="P01 inline node:test and direct-path files; only explicitly reported private-registry row tested; aliases/network/full lifecycle NOT_ACCEPTED"});return valid;
    }
    static bool IndexOf(byte[] bytes,byte[] pattern){for(int i=0;i<=bytes.Length-pattern.Length;i++){int j=0;for(;j<pattern.Length&&bytes[i+j]==pattern[j];j++){}if(j==pattern.Length)return true;}return false;}
    internal static List<Dictionary<string,object>> ReadPrivateReports(string text){const string prefix="SFPREG_REPORT:";var result=new List<Dictionary<string,object>>();foreach(var line in text.Split('\n'))if(line.StartsWith(prefix,StringComparison.Ordinal))result.Add(new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(line.Substring(prefix.Length).TrimEnd('\r')));return result;}
    internal bool Reconcile(){if(baseline==null)return false;var after=Inventory();bool same=baseline.Count==after.Count&&baseline.All(p=>after.ContainsKey(p.Key)&&after[p.Key]==p.Value);record("file_fixture_after",new{unchanged=same,files=after.Select(p=>new{path=p.Key,sha256=p.Value}).ToArray()});if(privateRegistry){string moniker=Path.GetFileName(Path.GetDirectoryName(profile));string key="Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppContainer\\Storage\\"+moniker;using(var opened=Microsoft.Win32.Registry.CurrentUser.OpenSubKey(key,false)){object value=opened==null?null:opened.GetValue("SpecForgeOwnedWriteCanary-"+Path.GetFileName(root));record("private_registry_owner_after",new{key="HKCU\\"+key,key_present=opened!=null,write_value=value,new_owned_profile_only=true});if(value!=null)same=false;}}return same;}
}
