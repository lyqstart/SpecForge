// Frozen first-party native-API exercise inside a real LPAC descendant.
// Never reads real credentials; writes only a unique value in this new profile.
using System;using System.Text;using System.Runtime.InteropServices;using System.Threading;
internal static class LpacPrivateRegistryChild {
    internal static int Main(string[] args){
        Guid nonce;if(args.Length!=1||!Guid.TryParseExact(args[0],"N",out nonce))return 64;
        Thread.Sleep(700);string value="SpecForgeOwnedWriteCanary-"+args[0];IntPtr read=IntPtr.Zero,write=IntPtr.Zero,change=IntPtr.Zero;
        int readHr=GetAppContainerRegistryLocation(1,out read),writeHr=unchecked((int)0x80004005),query=-1,set=-1;string name="";
        try{
            if(readHr==0&&read!=IntPtr.Zero){uint bytes=0,type;query=RegQueryValueExW(read,value,IntPtr.Zero,out type,IntPtr.Zero,ref bytes);uint needed;NtQueryKey(read,3,IntPtr.Zero,0,out needed);if(needed>4&&needed<32768){IntPtr buffer=Marshal.AllocHGlobal((int)needed);try{if(NtQueryKey(read,3,buffer,needed,out needed)==0)name=Marshal.PtrToStringUni(IntPtr.Add(buffer,4),Marshal.ReadInt32(buffer)/2);}finally{Marshal.FreeHGlobal(buffer);}}
                if(query==2){writeHr=GetAppContainerRegistryLocation(2,out write);if(writeHr==0&&write!=IntPtr.Zero){byte[] raw=Encoding.Unicode.GetBytes("SYNTHETIC-APP-WRITE-"+args[0]+"\0");set=RegSetValueExW(write,value,0,1,raw,(uint)raw.Length);}}
            }
            int dacHr=unchecked((int)0x80004005),setDac=-1,afterSet=-1;
            if(readHr==0&&query==2){dacHr=GetAppContainerRegistryLocation(0x40000,out change);if(dacHr==0&&change!=IntPtr.Zero){IntPtr app=IntPtr.Zero,descriptor=IntPtr.Zero;uint length;try{int derive=DeriveAppContainerSidFromAppContainerName("specforge.regread."+args[0],out app);if(derive==0&&app!=IntPtr.Zero){string sid=new System.Security.Principal.SecurityIdentifier(app).Value;if(ConvertStringSecurityDescriptorToSecurityDescriptorW("D:(A;;KA;;;WD)(A;;KA;;;"+sid+")",1,out descriptor,out length)){setDac=RegSetKeySecurity(change,4,descriptor);if(setDac==0){IntPtr retry;int opened=GetAppContainerRegistryLocation(2,out retry);if(opened==0&&retry!=IntPtr.Zero)try{byte[] raw=Encoding.Unicode.GetBytes("SYNTHETIC-ACL-WRITE-"+args[0]+"\0");afterSet=RegSetValueExW(retry,value+"-acl",0,1,raw,(uint)raw.Length);}finally{RegCloseKey(retry);}}}}}finally{if(app!=IntPtr.Zero)FreeSid(app);if(descriptor!=IntPtr.Zero)LocalFree(descriptor);}}}
            bool control=readHr==0&&read!=IntPtr.Zero&&query==2&&name.Length!=0;bool directDenied=writeHr==unchecked((int)0x80070005)||(writeHr==0&&set==5);bool dacDenied=dacHr==unchecked((int)0x80070005)||(dacHr==0&&setDac==5);bool denied=control&&directDenied&&dacDenied;
            Console.WriteLine("SFPREG_REPORT:{\"probe\":\"D21_PRIVATE_REGISTRY_NATIVE_V2\",\"pid\":"+System.Diagnostics.Process.GetCurrentProcess().Id+",\"read_hresult\":"+readHr+",\"absent_value_query\":"+query+",\"write_hresult\":"+writeHr+",\"set_value_status\":"+set+",\"write_dac_hresult\":"+dacHr+",\"set_dac_status\":"+setDac+",\"after_dac_write_status\":"+afterSet+",\"native_key_name_b64\":\""+Convert.ToBase64String(Encoding.UTF8.GetBytes(name))+"\",\"write_denied\":"+(denied?"true":"false")+"}");
            return denied?0:(writeHr==0&&set==0)||setDac==0||afterSet==0?40:41;
        }finally{if(read!=IntPtr.Zero)RegCloseKey(read);if(write!=IntPtr.Zero)RegCloseKey(write);if(change!=IntPtr.Zero)RegCloseKey(change);}
    }
    [DllImport("userenv.dll")]static extern int GetAppContainerRegistryLocation(uint desiredAccess,out IntPtr key);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern int RegQueryValueExW(IntPtr key,string name,IntPtr reserved,out uint type,IntPtr data,ref uint bytes);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern int RegSetValueExW(IntPtr key,string name,uint reserved,uint type,byte[] data,uint bytes);
    [DllImport("advapi32.dll")]static extern int RegCloseKey(IntPtr key);
    [DllImport("ntdll.dll")]static extern int NtQueryKey(IntPtr key,int kind,IntPtr buffer,uint bytes,out uint needed);
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)]static extern int DeriveAppContainerSidFromAppContainerName(string name,out IntPtr sid);
    [DllImport("advapi32.dll")]static extern IntPtr FreeSid(IntPtr sid);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string text,uint revision,out IntPtr descriptor,out uint bytes);
    [DllImport("advapi32.dll")]static extern int RegSetKeySecurity(IntPtr key,uint information,IntPtr descriptor);
    [DllImport("kernel32.dll")]static extern IntPtr LocalFree(IntPtr pointer);
}
