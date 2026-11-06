// Frozen first-party native-API exercise inside a real LPAC descendant.
// Never reads real credentials; writes only a unique value in this new profile.
using System;using System.Text;using System.Runtime.InteropServices;using System.Threading;
internal static class LpacPrivateRegistryChild {
    internal static int Main(string[] args){
        Guid nonce;if(args.Length!=1||!Guid.TryParseExact(args[0],"N",out nonce))return 64;
        Thread.Sleep(700);string value="SpecForgeOwnedWriteCanary-"+args[0];IntPtr read=IntPtr.Zero,write=IntPtr.Zero;
        int readHr=GetAppContainerRegistryLocation(1,out read),writeHr=unchecked((int)0x80004005),query=-1,set=-1;string name="";
        try{
            if(readHr==0&&read!=IntPtr.Zero){uint bytes=0,type;query=RegQueryValueExW(read,value,IntPtr.Zero,out type,IntPtr.Zero,ref bytes);uint needed;NtQueryKey(read,3,IntPtr.Zero,0,out needed);if(needed>4&&needed<32768){IntPtr buffer=Marshal.AllocHGlobal((int)needed);try{if(NtQueryKey(read,3,buffer,needed,out needed)==0)name=Marshal.PtrToStringUni(IntPtr.Add(buffer,4),Marshal.ReadInt32(buffer)/2);}finally{Marshal.FreeHGlobal(buffer);}}
                if(query==2){writeHr=GetAppContainerRegistryLocation(2,out write);if(writeHr==0&&write!=IntPtr.Zero){byte[] raw=Encoding.Unicode.GetBytes("SYNTHETIC-APP-WRITE-"+args[0]+"\0");set=RegSetValueExW(write,value,0,1,raw,(uint)raw.Length);}}
            }
            bool control=readHr==0&&read!=IntPtr.Zero&&query==2&&name.Length!=0;bool denied=control&&(writeHr==unchecked((int)0x80070005)||(writeHr==0&&set==5));
            Console.WriteLine("SFPREG_REPORT:{\"probe\":\"D21_PRIVATE_REGISTRY_NATIVE_V1\",\"pid\":"+System.Diagnostics.Process.GetCurrentProcess().Id+",\"read_hresult\":"+readHr+",\"absent_value_query\":"+query+",\"write_hresult\":"+writeHr+",\"set_value_status\":"+set+",\"native_key_name_b64\":\""+Convert.ToBase64String(Encoding.UTF8.GetBytes(name))+"\",\"write_denied\":"+(denied?"true":"false")+"}");
            return denied?0:writeHr==0&&set==0?40:41;
        }finally{if(read!=IntPtr.Zero)RegCloseKey(read);if(write!=IntPtr.Zero)RegCloseKey(write);}
    }
    [DllImport("userenv.dll")]static extern int GetAppContainerRegistryLocation(uint desiredAccess,out IntPtr key);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern int RegQueryValueExW(IntPtr key,string name,IntPtr reserved,out uint type,IntPtr data,ref uint bytes);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern int RegSetValueExW(IntPtr key,string name,uint reserved,uint type,byte[] data,uint bytes);
    [DllImport("advapi32.dll")]static extern int RegCloseKey(IntPtr key);
    [DllImport("ntdll.dll")]static extern int NtQueryKey(IntPtr key,int kind,IntPtr buffer,uint bytes,out uint needed);
}
