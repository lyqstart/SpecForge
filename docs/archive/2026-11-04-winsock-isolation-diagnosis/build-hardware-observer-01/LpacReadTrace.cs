// Diagnostic observer for a newly created synthetic process only. Never a product executor.
// Hardware breakpoints alter debug registers/timing, not application/DLL code or permissions.
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;

internal static class LpacReadTrace {
    const uint Continue=0x00010002,NotHandled=0x80010001;
    static void Check(bool ok,string name) {if(!ok)throw new Win32Exception(Marshal.GetLastWin32Error(),name);}
    internal static IntPtr DuplicateOwnedHandle(IntPtr handle) {
        IntPtr copy;Check(DuplicateHandle(new IntPtr(-1),handle,new IntPtr(-1),out copy,0,false,2),"Duplicate observation handle");return copy;
    }
    sealed class Context:IDisposable {
        readonly IntPtr allocation; internal readonly IntPtr Pointer;
        internal Context(IntPtr thread) {
            allocation=Marshal.AllocHGlobal(1248);Pointer=new IntPtr((allocation.ToInt64()+15)&~15L);
            Marshal.Copy(new byte[1232],0,Pointer,1232);Marshal.WriteInt32(Pointer,48,0x100013);
            try{Check(GetThreadContext(thread,Pointer),"GetThreadContext AMD64");}catch{Marshal.FreeHGlobal(allocation);throw;}
        }
        internal long Read(int offset){return Marshal.ReadInt64(Pointer,offset);}
        internal void Write(int offset,long value){Marshal.WriteInt64(Pointer,offset,value);}
        public void Dispose(){Marshal.FreeHGlobal(allocation);}
    }
    sealed class Call {internal int Id;internal string Api,Name;internal long OutHandle,ReturnAddress;internal uint Access;}
    sealed class ThreadState {internal IntPtr Handle;internal Stack<Call> Calls=new Stack<Call>();}
    sealed class Observer {
        internal readonly IntPtr Process,Job;internal readonly uint Pid;
        internal readonly Action<string,object> Record;internal readonly Func<long> Elapsed;
        readonly Dictionary<uint,ThreadState> threads=new Dictionary<uint,ThreadState>();
        readonly string[] names={"NtOpenKey","NtOpenKeyEx","NtCreateFile"};
        readonly long[] entries=new long[3];
        bool installed,initialBreakpoint;int callId,events;
        internal Observer(IntPtr process,IntPtr job,uint pid,Action<string,object> record,Func<long> elapsed){Process=process;Job=job;Pid=pid;Record=record;Elapsed=elapsed;}
        byte[] Read(long address,int bytes) {
            if(address<=0||bytes<0||bytes>8192)throw new InvalidOperationException("TRACE_READ_BOUNDS");
            var buffer=new byte[bytes];UIntPtr read;Check(ReadProcessMemory(Process,new IntPtr(address),buffer,new UIntPtr((uint)bytes),out read),"Read synthetic memory");
            if(read.ToUInt64()!=(ulong)bytes)throw new InvalidOperationException("TRACE_PARTIAL_READ");return buffer;
        }
        string Unicode(long pointer) {
            if(pointer==0)return "";var value=Read(pointer,16);int length=BitConverter.ToUInt16(value,0);
            if(length>8192||(length&1)!=0)throw new InvalidOperationException("TRACE_UNICODE_BOUNDS");
            return length==0?"":Encoding.Unicode.GetString(Read(BitConverter.ToInt64(value,8),length));
        }
        string RootName(long handle) {
            IntPtr copy;
            if(!DuplicateHandle(Process,new IntPtr(handle),new IntPtr(-1),out copy,0,false,2))return "<unresolved-root:"+handle.ToString("x")+">";
            IntPtr buffer=Marshal.AllocHGlobal(8192);
            try {
                uint required;int status=NtQueryObject(copy,1,buffer,8192,out required);
                if(status!=0)return "<unresolved-root:"+handle.ToString("x")+":"+unchecked((uint)status).ToString("x8")+">";
                int length=(ushort)Marshal.ReadInt16(buffer);long start=Marshal.ReadIntPtr(buffer,8).ToInt64();
                if((length&1)!=0||length>8192||start<buffer.ToInt64()||start+length>buffer.ToInt64()+8192)throw new InvalidOperationException("OBJECT_NAME_BOUNDS");
                return Marshal.PtrToStringUni(new IntPtr(start),length/2);
            }finally{Marshal.FreeHGlobal(buffer);CloseHandle(copy);}
        }
        string ObjectName(long attributes) {
            if(attributes==0)return "<null-object-attributes>";
            var data=Read(attributes,48);long root=BitConverter.ToInt64(data,8),name=BitConverter.ToInt64(data,16);
            string relative=Unicode(name);return root==0?relative:RootName(root).TrimEnd('\\')+"\\"+relative;
        }
        void Apply(ThreadState thread,Context context,bool resumeFault) {
            for(int i=0;i<3;i++)context.Write(72+i*8,entries[i]);
            context.Write(96,thread.Calls.Count==0?0:thread.Calls.Peek().ReturnAddress);
            context.Write(104,0);context.Write(112,thread.Calls.Count==0?0x415:0x455);
            if(resumeFault)Marshal.WriteInt32(context.Pointer,68,Marshal.ReadInt32(context.Pointer,68)|0x10000);
            Check(SetThreadContext(thread.Handle,context.Pointer),"Set hardware debug context");
        }
        void ConfigureAll() {foreach(var thread in threads.Values)using(var context=new Context(thread.Handle))Apply(thread,context,false);}
        string ImagePath(IntPtr file) {
            if(file==IntPtr.Zero||file==new IntPtr(-1))return "<unavailable>";
            var value=new StringBuilder(32768);uint size=GetFinalPathNameByHandleW(file,value,(uint)value.Capacity,0);
            if(size==0||size>=value.Capacity)return "<unavailable>";
            string result=value.ToString();return result.StartsWith("\\\\?\\")?result.Substring(4):result;
        }
        void LoadModule(DebugEvent ev) {
            string file=ImagePath(ev.Handle0);long remote=ev.Pointer8.ToInt64();
            Record("trace_module",new{path=file,address=remote.ToString("x")});
            if(!String.Equals(file,Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"ntdll.dll"),StringComparison.OrdinalIgnoreCase))return;
            if(installed)throw new InvalidOperationException("DUPLICATE_NTDLL");
            IntPtr local=GetModuleHandleW("ntdll.dll");Check(local!=IntPtr.Zero,"Get local ntdll");
            for(int i=0;i<names.Length;i++) {
                IntPtr entry=GetProcAddress(local,names[i]);Check(entry!=IntPtr.Zero,"Get system export");
                long offset=entry.ToInt64()-local.ToInt64();if(offset<0||offset>16*1024*1024)throw new InvalidOperationException("EXPORT_RVA_BOUNDS");
                entries[i]=remote+offset;var actual=Read(entries[i],16);var expected=new byte[16];Marshal.Copy(entry,expected,0,16);
                for(int n=0;n<16;n++)if(actual[n]!=expected[n])throw new InvalidOperationException("SYSTEM_STUB_IDENTITY_MISMATCH");
                Record("trace_hook_identity",new{api=names[i],module=file,export_rva=offset,address=entries[i].ToString("x"),remote_first16_equal_local=true,mechanism="hardware execution breakpoint; no code patch"});
            }
            installed=true;ConfigureAll();
        }
        uint Exception(DebugEvent ev) {
            if(ev.ExceptionCode==0x80000003&&!initialBreakpoint) {initialBreakpoint=true;Record("trace_initial_breakpoint",new{thread=ev.Tid,address=ev.ExceptionAddress.ToInt64().ToString("x")});return Continue;}
            if(ev.ExceptionCode!=0x80000004||!installed) {
                Record("trace_exception",new{code=ev.ExceptionCode.ToString("x8"),first_chance=ev.FirstChance,thread=ev.Tid,address=ev.ExceptionAddress.ToInt64().ToString("x")});return NotHandled;
            }
            ThreadState thread;if(!threads.TryGetValue(ev.Tid,out thread))throw new InvalidOperationException("UNKNOWN_TRACE_THREAD");
            using(var context=new Context(thread.Handle)) {
                long rip=context.Read(248),status=context.Read(104)&15;
                if(status==0)return NotHandled;
                if((status&8)!=0) {
                    if(thread.Calls.Count==0||thread.Calls.Peek().ReturnAddress!=rip)throw new InvalidOperationException("TRACE_RETURN_MISMATCH");
                    do {
                        var call=thread.Calls.Pop();uint result=unchecked((uint)context.Read(120));
                        Record("trace_call_return",new{call_id=call.Id,thread=ev.Tid,api=call.Api,object_name=call.Name,desired_access="0x"+call.Access.ToString("x8"),ntstatus="0x"+result.ToString("x8"),return_address=rip.ToString("x")});
                    }while(thread.Calls.Count!=0&&thread.Calls.Peek().ReturnAddress==rip);
                }
                for(int i=0;i<3;i++)if((status&(1L<<i))!=0) {
                    if(rip!=entries[i])throw new InvalidOperationException("TRACE_ENTRY_MISMATCH");
                    var call=new Call{Id=++callId,Api=names[i],OutHandle=context.Read(128),Access=unchecked((uint)context.Read(136)),Name=ObjectName(context.Read(184)),ReturnAddress=BitConverter.ToInt64(Read(context.Read(152),8),0)};
                    if(thread.Calls.Count>16)throw new InvalidOperationException("TRACE_NESTING_LIMIT");thread.Calls.Push(call);
                    Record("trace_call_enter",new{call_id=call.Id,thread=ev.Tid,api=call.Api,object_name=call.Name,desired_access="0x"+call.Access.ToString("x8"),return_address=call.ReturnAddress.ToString("x")});
                }
                Apply(thread,context,true);return Continue;
            }
        }
        internal uint Run() {
            Record("trace_observer_started",new{pid=Pid,mechanism="hardware debug registers plus bounded ReadProcessMemory; no code patch; no permission change",apis=names,event_limit=4096,timeout_ms=120000,diagnosis_only=true});
            for(;;) {
                if(Elapsed()>120000)throw new TimeoutException("TRACE_WALL_LIMIT");
                DebugEvent ev;
                if(!WaitForDebugEvent(out ev,20)){int error=Marshal.GetLastWin32Error();if(error==121)continue;throw new Win32Exception(error,"WaitForDebugEvent");}
                uint continuation=Continue;bool exit=false;uint exitCode=0;
                try {
                    if(++events>4096)throw new InvalidOperationException("TRACE_EVENT_LIMIT");
                    if(ev.Pid!=Pid)throw new InvalidOperationException("UNEXPECTED_DEBUG_PROCESS");
                    switch(ev.Code) {
                        case 3:
                            threads.Add(ev.Tid,new ThreadState{Handle=ev.Pointer16});
                            Record("trace_create_process",new{pid=ev.Pid,thread=ev.Tid,image=ImagePath(ev.Handle0)});break;
                        case 2:
                            var thread=new ThreadState{Handle=ev.Handle0};threads.Add(ev.Tid,thread);
                            if(installed)using(var context=new Context(thread.Handle))Apply(thread,context,false);break;
                        case 4:threads.Remove(ev.Tid);break;
                        case 6:LoadModule(ev);break;
                        case 1:continuation=Exception(ev);break;
                        case 5:
                            exit=true;exitCode=ev.ExceptionCode;
                            Record("trace_process_exit",new{pid=ev.Pid,exit_code=exitCode,hooks_installed=installed,observed_calls=callId,debug_events=events});break;
                    }
                } finally {
                    if((ev.Code==3||ev.Code==6)&&ev.Handle0!=IntPtr.Zero&&ev.Handle0!=new IntPtr(-1))CloseHandle(ev.Handle0);
                    Check(ContinueDebugEvent(ev.Pid,ev.Tid,continuation),"ContinueDebugEvent");
                }
                if(exit){if(!installed||callId==0)throw new InvalidOperationException("TRACE_COVERAGE_MISSING");return exitCode;}
            }
        }
    }
    internal static uint Run(IntPtr process,IntPtr job,uint pid,Action<string,object> record,Func<long> elapsed) {
        if(IntPtr.Size!=8||Marshal.SizeOf(typeof(DebugEvent))!=176)throw new InvalidOperationException("TRACE_ABI_MISMATCH");
        try{return new Observer(process,job,pid,record,elapsed).Run();}
        catch(Exception error) {
            record("trace_failed",new{type=error.GetType().FullName,message=error.Message});
            TerminateJobObject(job,125);var timer=System.Diagnostics.Stopwatch.StartNew();
            while(timer.ElapsedMilliseconds<5000){DebugEvent ev;if(!WaitForDebugEvent(out ev,20))continue;bool end=ev.Code==5&&ev.Pid==pid;ContinueDebugEvent(ev.Pid,ev.Tid,Continue);if(end)break;}
            throw;
        }
    }
    [StructLayout(LayoutKind.Explicit,Size=176)] struct DebugEvent {
        [FieldOffset(0)]public uint Code;[FieldOffset(4)]public uint Pid;[FieldOffset(8)]public uint Tid;
        [FieldOffset(16)]public IntPtr Handle0;[FieldOffset(24)]public IntPtr Pointer8;[FieldOffset(32)]public IntPtr Pointer16;
        [FieldOffset(16)]public uint ExceptionCode;[FieldOffset(32)]public IntPtr ExceptionAddress;[FieldOffset(168)]public uint FirstChance;
    }
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool ReadProcessMemory(IntPtr process,IntPtr address,[Out]byte[] buffer,UIntPtr size,out UIntPtr read);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool GetThreadContext(IntPtr thread,IntPtr context);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool SetThreadContext(IntPtr thread,IntPtr context);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool WaitForDebugEvent(out DebugEvent ev,uint timeout);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool ContinueDebugEvent(uint pid,uint tid,uint status);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern uint GetFinalPathNameByHandleW(IntPtr file,StringBuilder name,uint count,uint flags);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandleW(string module);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr module,string name);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool DuplicateHandle(IntPtr sourceProcess,IntPtr sourceHandle,IntPtr targetProcess,out IntPtr target,uint access,[MarshalAs(UnmanagedType.Bool)]bool inherit,uint options);
    [DllImport("ntdll.dll")] static extern int NtQueryObject(IntPtr handle,int info,IntPtr buffer,uint bytes,out uint needed);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool TerminateJobObject(IntPtr job,uint exit);
}
