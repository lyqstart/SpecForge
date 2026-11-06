// Owned alias attack fixtures, separate from production inputs that reject links.
using System;using System.IO;using System.Text;using System.Runtime.InteropServices;
using System.Security.AccessControl;using System.Security.Principal;
internal sealed class LpacAliasFixture {
    readonly Action<string,object> record;readonly string directory,positive,shadow;
    internal readonly string[] Positive,Negative;
    internal LpacAliasFixture(string root,string input,string shadow,string appSid,Action<string,object> record){
        this.record=record;this.shadow=shadow;positive=Path.Combine(input,"fixture.txt");directory=Path.Combine(root,"alias-fixtures");if(Directory.Exists(directory))throw new InvalidOperationException("ALIAS_COLLISION");Directory.CreateDirectory(directory);
        var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);var inherit=InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit;
        foreach(var sid in new[]{WindowsIdentity.GetCurrent().User,new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null)})acl.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,inherit,PropagationFlags.None,AccessControlType.Allow));
        acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(appSid),FileSystemRights.ReadAndExecute,inherit,PropagationFlags.None,AccessControlType.Allow));Directory.SetAccessControl(directory,acl);
        Positive=new[]{Path.Combine(directory,"positive-hard.txt"),Path.Combine(directory,"positive-symbolic.txt")};Negative=new[]{Path.Combine(directory,"shadow-hard.txt"),Path.Combine(directory,"shadow-symbolic.txt"),"\\\\?\\"+shadow};
        if(!CreateHardLinkW(Positive[0],positive,IntPtr.Zero)||!CreateHardLinkW(Negative[0],shadow,IntPtr.Zero))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"Create owned hard-link fixture");
        if(!CreateSymbolicLinkW(Positive[1],positive,2)||!CreateSymbolicLinkW(Negative[1],shadow,2))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"Create owned symbolic-link fixture; no privilege or system setting fallback");
        record("alias_fixture_created",new{directory=directory,positive=Positive,negative=Negative,symbolic_flags=2,production_link_rejection_unchanged=true});
    }
    internal bool Reconcile(){bool same=File.ReadAllText(Positive[0])=="FIXED_READ_CONTROL"&&File.ReadAllText(Positive[1])=="FIXED_READ_CONTROL"&&File.ReadAllBytes(Negative[0]).Length==File.ReadAllBytes(shadow).Length&&File.ReadAllText(Negative[0])==File.ReadAllText(shadow)&&File.ReadAllText(Negative[1])==File.ReadAllText(shadow);record("alias_fixture_after",new{unchanged=same,owned_only=true});return same;}
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)][return:MarshalAs(UnmanagedType.Bool)]static extern bool CreateHardLinkW(string name,string existing,IntPtr security);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)][return:MarshalAs(UnmanagedType.U1)]static extern bool CreateSymbolicLinkW(string name,string target,uint flags);
}
