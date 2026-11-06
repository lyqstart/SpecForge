// Synthetic-only: tighten exactly the new profile's private registry storage.
using System;using System.Collections.Generic;using System.Security.AccessControl;
using System.Security.Principal;using Microsoft.Win32;
internal static class LpacOwnedRegistryGuard {
    const string Prefix="Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppContainer\\Storage\\";
    static string Key(string moniker){Guid value;if(!moniker.StartsWith("specforge.regread.",StringComparison.Ordinal)||!Guid.TryParseExact(moniker.Substring("specforge.regread.".Length),"N",out value))throw new InvalidOperationException("REGISTRY_PROFILE_OWNER");return Prefix+moniker;}
    internal static void AssertAbsent(string moniker,Action<string,object> record){string path=Key(moniker);using(var key=Registry.CurrentUser.OpenSubKey(path,false))if(key!=null)throw new InvalidOperationException("OWNED_STORAGE_COLLISION");record("private_storage_preflight",new{key="HKCU\\"+path,exists=false});}
    internal static void Lock(string moniker,string packageSid,Action<string,object> record){string path=Key(moniker);using(var root=Registry.CurrentUser.OpenSubKey(path,true)){
        if(root==null)throw new InvalidOperationException("NEW_PROFILE_STORAGE_NOT_CREATED");LockKey(root,path,new SecurityIdentifier(packageSid),record);
    }}
    static void LockKey(RegistryKey key,string path,SecurityIdentifier app,Action<string,object> record){
        var user=WindowsIdentity.GetCurrent().User;var before=key.GetAccessControl(AccessControlSections.Access|AccessControlSections.Owner);
        if(before.GetOwner(typeof(SecurityIdentifier)).Value!=user.Value)throw new InvalidOperationException("NEW_PROFILE_REGISTRY_OWNER_MISMATCH");
        record("private_storage_acl_before",new{key="HKCU\\"+path,sddl=before.GetSecurityDescriptorSddlForm(AccessControlSections.Access|AccessControlSections.Owner)});
        foreach(string child in key.GetSubKeyNames())using(var sub=key.OpenSubKey(child,true)){if(sub==null)throw new InvalidOperationException("STORAGE_CHILD_CHANGED");LockKey(sub,path+"\\"+child,app,record);}
        var acl=new RegistrySecurity();acl.SetAccessRuleProtection(true,false);
        foreach(var sid in new[]{user,new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null)})acl.AddAccessRule(new RegistryAccessRule(sid,RegistryRights.FullControl,InheritanceFlags.ContainerInherit,PropagationFlags.None,AccessControlType.Allow));
        acl.AddAccessRule(new RegistryAccessRule(app,RegistryRights.ReadKey,InheritanceFlags.ContainerInherit,PropagationFlags.None,AccessControlType.Allow));
        // Explicit OWNER RIGHTS removes implicit owner WRITE_DAC; broker retains
        // its explicit grant. The restricted package SID receives only reads.
        acl.AddAccessRule(new RegistryAccessRule(new SecurityIdentifier("S-1-3-4"),RegistryRights.ReadPermissions,InheritanceFlags.ContainerInherit,PropagationFlags.None,AccessControlType.Allow));
        key.SetAccessControl(acl);record("private_storage_acl",new{key="HKCU\\"+path,sddl=key.GetAccessControl(AccessControlSections.Access|AccessControlSections.Owner).GetSecurityDescriptorSddlForm(AccessControlSections.Access|AccessControlSections.Owner),new_profile_only=true});
    }
}
