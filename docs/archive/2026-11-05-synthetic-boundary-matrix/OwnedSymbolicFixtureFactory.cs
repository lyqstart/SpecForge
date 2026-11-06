// Synthetic host fixture provisioning only. Never starts an application process.
// Elevated mode only creates two fixed links after exact plan/hash/owner checks.
using System;using System.IO;using System.Text;using System.Security.Cryptography;
using System.Security.Principal;using System.Security.AccessControl;
using System.Collections.Generic;using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
internal static class OwnedSymbolicFixtureFactory {
    static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
    static readonly UTF8Encoding Utf8=new UTF8Encoding(false);
    static string Hash(byte[] raw){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(raw)).Replace("-","").ToLowerInvariant();}
    static void NoLinks(string file){for(string part=Path.GetFullPath(file);part!=null;part=Path.GetDirectoryName(part))if((File.GetAttributes(part)&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("REPARSE_IN_FACTORY_PATH");}
    static string Workspace(){string basePath=AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);if(Path.GetFileName(basePath)!="verification-lpac-build"||Path.GetFileName(Path.GetDirectoryName(basePath))!=".tmp")throw new InvalidOperationException("FACTORY_LOCATION");string workspace=Path.GetDirectoryName(Path.GetDirectoryName(basePath));NoLinks(basePath);return workspace;}
    static void NewFile(string path,byte[] raw){using(var f=new FileStream(path,FileMode.CreateNew,FileAccess.Write))f.Write(raw,0,raw.Length);}
    static string AppSid(string nonce){IntPtr sid;int hr=DeriveAppContainerSidFromAppContainerName("specforge.regread."+nonce,out sid);if(hr!=0||sid==IntPtr.Zero)throw new InvalidOperationException("DERIVE_APP_SID");try{return new SecurityIdentifier(sid).Value;}finally{FreeSid(sid);}}
    static void FileAcl(string file,string app){var acl=new FileSecurity();acl.SetAccessRuleProtection(true,false);foreach(var sid in new[]{WindowsIdentity.GetCurrent().User,new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null)})acl.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,AccessControlType.Allow));if(app!=null)acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(app),FileSystemRights.ReadAndExecute,AccessControlType.Allow));File.SetAccessControl(file,acl);}
    internal static int Main(string[] args){
        if(args.Length<2||args.Length>3||(args[0]!="--prepare"&&args[0]!="--create")||(args[0]=="--create"&&args.Length!=3)||(args[0]=="--prepare"&&args.Length!=2))return 64;
        Guid nonce;if(!Guid.TryParseExact(args[1],"N",out nonce))return 64;
        try{
            string workspace=Workspace(),scope=Path.Combine(workspace,".tmp","verification-lpac-symbolic"),root=Path.Combine(scope,args[1]),planFile=Path.Combine(root,"plan.json"),positive=Path.Combine(root,"positive.txt"),shadow=Path.Combine(root,"shadow.txt");
            string owner=WindowsIdentity.GetCurrent().User.Value,app=AppSid(args[1]);
            if(args[0]=="--prepare"){
                if(Directory.Exists(root)||File.Exists(root))throw new InvalidOperationException("FACTORY_COLLISION");Directory.CreateDirectory(scope);NoLinks(scope);Directory.CreateDirectory(root);
                var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);foreach(var sid in new[]{new SecurityIdentifier(owner),new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null)})acl.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(app),FileSystemRights.ReadAndExecute,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));Directory.SetAccessControl(root,acl);
                NewFile(positive,Utf8.GetBytes("FIXED_READ_CONTROL"));FileAcl(positive,app);NewFile(shadow,Utf8.GetBytes("SYNTHETIC-SYMBOLIC-ONLY-"+Guid.NewGuid().ToString("N")));FileAcl(shadow,null);
                var plan=new Dictionary<string,string>{{"schema","owned-symbolic-fixture/1"},{"run_id","CODEX-SF-20261105-SYNTHETIC-BOUNDARY-MATRIX-A01"},{"nonce",args[1]},{"owner_sid",owner},{"app_sid",app},{"root",root},{"positive_sha256",Hash(File.ReadAllBytes(positive))},{"shadow_sha256",Hash(File.ReadAllBytes(shadow))},{"created_utc",DateTime.UtcNow.ToString("o")}};
                NewFile(planFile,Utf8.GetBytes(Json.Serialize(plan)+"\n"));FileAcl(planFile,null);Console.WriteLine(Json.Serialize(new{prepared=root,plan_sha256=Hash(File.ReadAllBytes(planFile)),elevated_creation_executed=false,inner_exit_code=0}));return 0;
            }
            NoLinks(root);byte[] rawPlan=File.ReadAllBytes(planFile);if(args[2].Length!=64||Hash(rawPlan)!=args[2])throw new InvalidOperationException("PLAN_HASH_MISMATCH");
            var data=Json.Deserialize<Dictionary<string,string>>(Utf8.GetString(rawPlan));if(data.Count!=9||data["schema"]!="owned-symbolic-fixture/1"||data["run_id"]!="CODEX-SF-20261105-SYNTHETIC-BOUNDARY-MATRIX-A01"||data["nonce"]!=args[1]||data["root"]!=root||data["owner_sid"]!=owner||data["app_sid"]!=app||data["positive_sha256"]!=Hash(File.ReadAllBytes(positive))||data["shadow_sha256"]!=Hash(File.ReadAllBytes(shadow)))throw new InvalidOperationException("PLAN_IDENTITY");
            foreach(string file in new[]{root,planFile,positive,shadow}){NoLinks(file);string actual=(Directory.Exists(file)?(FileSystemSecurity)Directory.GetAccessControl(file,AccessControlSections.Owner):File.GetAccessControl(file,AccessControlSections.Owner)).GetOwner(typeof(SecurityIdentifier)).Value;if(actual!=owner)throw new InvalidOperationException("FACTORY_OWNER_MISMATCH");}
            if(File.Exists(Path.Combine(root,"creation-receipt.json")))throw new InvalidOperationException("FACTORY_RECEIPT_EXISTS");
            if(!new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator))throw new InvalidOperationException("ELEVATED_ADMINISTRATOR_REQUIRED");
            string[] names={"positive-symbolic.txt","shadow-symbolic.txt"},targets={positive,shadow};foreach(string name in names)if(File.Exists(Path.Combine(root,name))||Directory.Exists(Path.Combine(root,name)))throw new InvalidOperationException("LINK_COLLISION");
            var outcomes=new List<object>();int result=0;
            for(int i=0;i<2;i++){bool ok=CreateSymbolicLinkW(Path.Combine(root,names[i]),targets[i],0);int error=ok?0:Marshal.GetLastWin32Error();outcomes.Add(new{name=names[i],target=targets[i],success=ok,win32_error=error});if(!ok){result=1;break;}}
            var receipt=new{schema="owned-symbolic-creation/1",utc=DateTime.UtcNow.ToString("o"),nonce=args[1],plan_sha256=args[2],factory_sha256=Hash(File.ReadAllBytes(System.Reflection.Assembly.GetExecutingAssembly().Location)),owner_sid=owner,app_sid=app,application_processes_started=0,system_settings_changed=false,acl_changes_in_elevated_mode=false,outcomes=outcomes.ToArray(),inner_exit_code=result};NewFile(Path.Combine(root,"creation-receipt.json"),Utf8.GetBytes(Json.Serialize(receipt)+"\n"));Console.WriteLine(Json.Serialize(receipt));return result;
        }catch(Exception e){Console.Error.WriteLine(Json.Serialize(new{type=e.GetType().Name,message=e.Message,utc=DateTime.UtcNow.ToString("o"),inner_exit_code=65}));return 65;}
    }
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)]static extern int DeriveAppContainerSidFromAppContainerName(string name,out IntPtr sid);
    [DllImport("advapi32.dll")]static extern IntPtr FreeSid(IntPtr sid);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)][return:MarshalAs(UnmanagedType.U1)]static extern bool CreateSymbolicLinkW(string name,string target,uint flags);
}
