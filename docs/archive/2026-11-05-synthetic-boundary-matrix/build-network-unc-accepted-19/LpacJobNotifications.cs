// Trusted broker Job completion port; never inherited by the application.
using System;using System.Collections.Generic;using System.Runtime.InteropServices;
internal sealed class LpacJobNotifications:IDisposable {
    IntPtr port;readonly Action<string,object> record;internal readonly List<uint> Messages=new List<uint>();
    [StructLayout(LayoutKind.Sequential)]struct Association{internal IntPtr Key,Port;}
    internal LpacJobNotifications(IntPtr job,Action<string,object> record){this.record=record;port=CreateIoCompletionPort(new IntPtr(-1),IntPtr.Zero,UIntPtr.Zero,1);if(port==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"Create owned Job completion port");var association=new Association{Key=new IntPtr(1),Port=port};if(!SetInformationJobObject(job,7,ref association,(uint)Marshal.SizeOf(typeof(Association)))){int error=Marshal.GetLastWin32Error();Dispose();throw new System.ComponentModel.Win32Exception(error,"Associate Job completion port");}record("job_completion_port_created",new{inherited_by_application=false,completion_key=1});}
    internal void Drain(){for(int i=0;i<4096;i++){uint message;UIntPtr key;IntPtr value;if(!GetQueuedCompletionStatus(port,out message,out key,out value,0)){int error=Marshal.GetLastWin32Error();if(error==258)return;throw new System.ComponentModel.Win32Exception(error,"Read owned Job notification");}if(key.ToUInt64()!=1)throw new InvalidOperationException("JOB_COMPLETION_KEY");Messages.Add(message);record("job_notification",new{message=message,pid_or_value=value.ToInt64()});}throw new InvalidOperationException("JOB_NOTIFICATION_BUDGET");}
    public void Dispose(){if(port!=IntPtr.Zero){CloseHandle(port);port=IntPtr.Zero;}}
    [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr CreateIoCompletionPort(IntPtr file,IntPtr existing,UIntPtr key,uint threads);
    [DllImport("kernel32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool SetInformationJobObject(IntPtr job,int kind,ref Association data,uint bytes);
    [DllImport("kernel32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool GetQueuedCompletionStatus(IntPtr port,out uint bytes,out UIntPtr key,out IntPtr value,uint timeout);
    [DllImport("kernel32.dll")][return:MarshalAs(UnmanagedType.Bool)]static extern bool CloseHandle(IntPtr handle);
}
