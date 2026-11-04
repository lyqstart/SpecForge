// D21 synthetic experiment only. Does not register a product execution profile.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;

internal sealed class LpacRegistryReadCapability:IDisposable {
    internal IntPtr Attributes;
    internal string Sid;
    readonly HashSet<IntPtr> local=new HashSet<IntPtr>();
    LpacRegistryReadCapability(){}
    internal static LpacRegistryReadCapability Derive() {
        var result=new LpacRegistryReadCapability();
        IntPtr groups=IntPtr.Zero,caps=IntPtr.Zero;uint groupCount=0,count=0;
        try {
            bool ok=DeriveCapabilitySidsFromName("registryRead",out groups,out groupCount,out caps,out count);
            int error=ok?0:Marshal.GetLastWin32Error();
            if(groups!=IntPtr.Zero)result.local.Add(groups);if(caps!=IntPtr.Zero)result.local.Add(caps);
            if(groupCount>8||count>8)throw new InvalidOperationException("UNEXPECTED_CAPABILITY_ARRAY_SIZE");
            for(int i=0;i<groupCount;i++)result.local.Add(Marshal.ReadIntPtr(groups,i*IntPtr.Size));
            for(int i=0;i<count;i++)result.local.Add(Marshal.ReadIntPtr(caps,i*IntPtr.Size));
            if(!ok)throw new Win32Exception(error,"Derive registryRead capability");
            if(count!=1||caps==IntPtr.Zero)throw new InvalidOperationException("REGISTRY_READ_MUST_DERIVE_ONE_SID");
            IntPtr sid=Marshal.ReadIntPtr(caps);result.Sid=new SecurityIdentifier(sid).Value;
            var entry=new SidAndAttributes();entry.Sid=sid;entry.Flags=4;
            if(Marshal.SizeOf(typeof(SidAndAttributes))!=16||IntPtr.Size!=8)throw new InvalidOperationException("CAPABILITY_ABI");
            result.Attributes=Marshal.AllocHGlobal(16);Marshal.StructureToPtr(entry,result.Attributes,false);
            return result;
        } catch {result.Dispose();throw;}
    }
    public void Dispose(){if(Attributes!=IntPtr.Zero){Marshal.FreeHGlobal(Attributes);Attributes=IntPtr.Zero;}foreach(var pointer in local)if(pointer!=IntPtr.Zero)LocalFree(pointer);local.Clear();}
    [StructLayout(LayoutKind.Sequential)]struct SidAndAttributes {internal IntPtr Sid;internal uint Flags;}
    [DllImport("kernelbase.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]static extern bool DeriveCapabilitySidsFromName(string name,out IntPtr groupSids,out uint groupCount,out IntPtr capabilitySids,out uint capabilityCount);
    [DllImport("kernel32.dll")]static extern IntPtr LocalFree(IntPtr memory);
}
