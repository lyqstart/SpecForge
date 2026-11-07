// Synthetic daemon-crash fixture only; retain a stable, non-inherited parent handle.
using System;using System.IO;using System.Text;using System.Diagnostics;using System.Runtime.InteropServices;using System.Security.Principal;using System.Security.Cryptography;
internal sealed class LpacParentLifetime:IDisposable {
    IntPtr handle;
    internal LpacParentLifetime(Action<string,object> record){var basic=new Basic();uint returned;int status=NtQueryInformationProcess(GetCurrentProcess(),0,ref basic,(uint)Marshal.SizeOf(typeof(Basic)),out returned);if(status!=0||returned!=Marshal.SizeOf(typeof(Basic)))throw new InvalidOperationException("PARENT_BASIC_INFORMATION");ulong raw=basic.Parent.ToUInt64();if(raw==0||raw>UInt32.MaxValue)throw new InvalidOperationException("PARENT_PID_WIDTH");
        handle=OpenProcess(0x101000,false,(uint)raw);if(handle==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"Open actual parent");try{var name=new StringBuilder(32768);uint chars=(uint)name.Capacity;if(!QueryFullProcessImageNameW(handle,0,name,ref chars))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"Actual parent image");string expected="C:\\Users\\lyq\\AppData\\Roaming\\npm\\node_modules\\bun\\bin\\bun.exe";if(!String.Equals(name.ToString(),expected,StringComparison.OrdinalIgnoreCase)||Hash(expected)!="0187f68d843f825a72ada4a7eca60db896ed753759a7f8252edcd31ac1bf1b9c")throw new InvalidOperationException("PINNED_SYNTHETIC_DAEMON_PARENT");long parent=Created(handle),self=Created(GetCurrentProcess());if(parent>self||Ended)throw new InvalidOperationException("PARENT_CREATION_IDENTITY");
            IntPtr token;if(!OpenProcessToken(handle,8,out token))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"Parent token");try{uint needed;GetTokenInformation(token,1,IntPtr.Zero,0,out needed);if(needed<8||needed>65536)throw new InvalidOperationException("PARENT_TOKEN_SIZE");IntPtr buffer=Marshal.AllocHGlobal((int)needed);try{if(!GetTokenInformation(token,1,buffer,needed,out needed))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"Parent user");if(new SecurityIdentifier(Marshal.ReadIntPtr(buffer)).Value!=WindowsIdentity.GetCurrent().User.Value)throw new InvalidOperationException("PARENT_USER_MISMATCH");}finally{Marshal.FreeHGlobal(buffer);}}finally{CloseHandle(token);}
            record("parent_lifetime_bound",new{parent_pid=(uint)raw,parent_created_filetime=parent,parent_image=name.ToString(),parent_image_sha256=Hash(expected),launcher_pid=Process.GetCurrentProcess().Id,launcher_created_filetime=self,handle_inherited=false,user_sid=WindowsIdentity.GetCurrent().User.Value});
        }catch{Dispose();throw;}
    }
    internal bool Ended {get{uint result=WaitForSingleObject(handle,0);if(result!=0&&result!=258)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"Parent lifetime wait");return result==0;}}
    internal void RequireAlive(){if(Ended)throw new InvalidOperationException("DAEMON_PARENT_ENDED_BEFORE_RESUME");}
    static long Created(IntPtr process){long created,ended,kernel,user;if(!GetProcessTimes(process,out created,out ended,out kernel,out user))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"Parent creation time");return created;}
    static string Hash(string file){using(var sha=SHA256.Create())using(var stream=File.OpenRead(file))return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
    public void Dispose(){if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;}}
    [StructLayout(LayoutKind.Sequential)]struct Basic{internal int ExitStatus;internal IntPtr Peb;internal UIntPtr Affinity;internal int BasePriority;internal UIntPtr Pid,Parent;}
    [DllImport("ntdll.dll")]static extern int NtQueryInformationProcess(IntPtr process,int kind,ref Basic info,uint size,out uint returned);
    [DllImport("kernel32.dll")]static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,[MarshalAs(UnmanagedType.Bool)]bool inherit,uint pid);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool QueryFullProcessImageNameW(IntPtr process,uint flags,StringBuilder name,ref uint chars);
    [DllImport("kernel32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool GetProcessTimes(IntPtr process,out long created,out long ended,out long kernel,out long user);
    [DllImport("kernel32.dll",SetLastError=true)]static extern uint WaitForSingleObject(IntPtr process,uint ms);
    [DllImport("advapi32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
    [DllImport("advapi32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr buffer,uint size,out uint needed);
    [DllImport("kernel32.dll")][return:MarshalAs(UnmanagedType.Bool)]static extern bool CloseHandle(IntPtr handle);
}
