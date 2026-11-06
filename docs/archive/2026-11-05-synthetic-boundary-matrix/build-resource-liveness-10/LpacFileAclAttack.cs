// Native file security attack against this attempt's fixtures only.
using System;using System.IO;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;
internal static class LpacFileAclAttack {
    internal static bool Run(string nonce){
        string input=Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location),root=Path.GetDirectoryName(input),profile=Environment.GetEnvironmentVariable("USERPROFILE");
        if(Path.GetFileName(root)!=nonce)throw new InvalidOperationException("ACL_FIXTURE_OWNER");
        var targets=new[]{Path.Combine(input,"fixture.txt"),input,Path.Combine(root,"runtime"),profile,Path.Combine(profile,"Temp"),Path.Combine(root,"shadow-home","fake-credentials.txt")};
        bool denied=true;var rows=new List<string>();IntPtr sid=IntPtr.Zero,descriptor=IntPtr.Zero;uint length;
        try{
            if(DeriveAppContainerSidFromAppContainerName("specforge.regread."+nonce,out sid)!=0||sid==IntPtr.Zero)throw new InvalidOperationException("ACL_APP_SID");
            string app=new System.Security.Principal.SecurityIdentifier(sid).Value;
            if(!ConvertStringSecurityDescriptorToSecurityDescriptorW("D:(A;;FA;;;WD)(A;;FA;;;"+app+")",1,out descriptor,out length))throw new InvalidOperationException("ACL_DESCRIPTOR");
            for(int i=0;i<targets.Length;i++){
                IntPtr handle=CreateFileW(targets[i],0x40000,7,IntPtr.Zero,3,0x02000000,IntPtr.Zero);int open=handle==new IntPtr(-1)?Marshal.GetLastWin32Error():0,set=-1,write=-1;
                if(handle!=new IntPtr(-1))try{bool changed=SetKernelObjectSecurity(handle,4,descriptor);set=changed?0:Marshal.GetLastWin32Error();if(changed)try{if(i==0||i==5)File.WriteAllText(targets[i],"SYNTHETIC-ACL-MUTATION");else File.WriteAllText(Path.Combine(targets[i],"unauthorized-native-acl.txt"),"SYNTHETIC-ACL-MUTATION");write=0;}catch(Exception e){write=e.HResult;}}finally{CloseHandle(handle);}
                denied&=open==5||(open==0&&set==5);rows.Add("{\"index\":"+i+",\"open_write_dac_error\":"+open+",\"set_dacl_error\":"+set+",\"after_dacl_write_error\":"+write+"}");
            }
            Console.WriteLine("SFFACL_REPORT:{\"probe\":\"D21_FILE_ACL_NATIVE_V1\",\"pid\":"+System.Diagnostics.Process.GetCurrentProcess().Id+",\"denied\":"+(denied?"true":"false")+",\"rows\":["+String.Join(",",rows.ToArray())+"]}");return denied;
        }finally{if(sid!=IntPtr.Zero)FreeSid(sid);if(descriptor!=IntPtr.Zero)LocalFree(descriptor);}
    }
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)]static extern int DeriveAppContainerSidFromAppContainerName(string name,out IntPtr sid);
    [DllImport("advapi32.dll")]static extern IntPtr FreeSid(IntPtr sid);
    [DllImport("kernel32.dll")]static extern IntPtr LocalFree(IntPtr descriptor);
    [DllImport("advapi32.dll",SetLastError=true,CharSet=CharSet.Unicode)][return:MarshalAs(UnmanagedType.Bool)]static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string text,uint revision,out IntPtr descriptor,out uint length);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)]static extern IntPtr CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    [DllImport("advapi32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool SetKernelObjectSecurity(IntPtr handle,uint information,IntPtr descriptor);
    [DllImport("kernel32.dll")][return:MarshalAs(UnmanagedType.Bool)]static extern bool CloseHandle(IntPtr handle);
}
