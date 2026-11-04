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
    sealed class Call {internal int Id,ParentId;internal string Api,Name;internal long ReturnAddress;internal uint Access;internal bool WithinStartup;}
    sealed class ThreadState {internal IntPtr Handle;internal Stack<Call> Calls=new Stack<Call>();}
    sealed class Observer {
        internal readonly IntPtr Process,Job;internal readonly uint Pid;
        internal readonly Action<string,object> Record;internal readonly Func<long> Elapsed;
        readonly Dictionary<uint,ThreadState> threads=new Dictionary<uint,ThreadState>();
        readonly string[] names={"RegOpenKeyExA","WSAStartup","NtOpenKeyEx"};
        readonly string[] libraries={"kernelbase.dll","ws2_32.dll","ntdll.dll"};
        readonly long[] entries=new long[3];
        bool installed,initialBreakpoint,sawStartup;int callId,events;
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
        string WideString(long pointer) {
            if(pointer==0)return "";var bytes=new List<byte>();
            for(int i=0;i<4096;i++){var pair=Read(pointer+i*2,2);if(pair[0]==0&&pair[1]==0)return Encoding.Unicode.GetString(bytes.ToArray());bytes.AddRange(pair);}
            throw new InvalidOperationException("TRACE_WSTRING_BOUNDS");
        }
        string RegistryName(long handle,long subkey) {
            string root;
            switch(unchecked((uint)handle)) {
                case 0x80000000:root="HKCR";break;case 0x80000001:root="HKCU";break;
                case 0x80000002:root="HKLM";break;case 0x80000003:root="HKU";break;
                case 0x80000005:root="HKCC";break;default:root=RootName(handle);break;
            }
            // This diagnostic profile supports ASCII subkey names only. Preserve
            // uncertainty instead of assuming the broker's code page matches.
            var bytes=new List<byte>();
            if(subkey!=0)for(int i=0;;i++) {
                if(i>=8192)throw new InvalidOperationException("TRACE_ANSI_BOUNDS");
                byte value=Read(subkey+i,1)[0];if(value==0)break;
                if(value>127)throw new InvalidOperationException("TRACE_ANSI_CODEPAGE_UNPROVED");bytes.Add(value);
            }
            return root+"\\"+Encoding.ASCII.GetString(bytes.ToArray());
        }
        static int PeOffset(byte[] image,uint rva,int sections,int sectionCount) {
            for(int i=0;i<sectionCount;i++) {
                int s=checked(sections+i*40);uint start=BitConverter.ToUInt32(image,s+12),length=BitConverter.ToUInt32(image,s+16),raw=BitConverter.ToUInt32(image,s+20);
                if(rva>=start&&(ulong)rva-start<length) {long offset=(long)raw+rva-start;if(offset<0||offset>=image.Length)throw new InvalidOperationException("PE_RVA_BOUNDS");return checked((int)offset);}
            }throw new InvalidOperationException("PE_RVA_UNMAPPED");
        }
        static long ExportRva(byte[] image,string export,out byte[] initial) {
            if(image.Length<256||BitConverter.ToUInt16(image,0)!=0x5a4d)throw new InvalidOperationException("PE_DOS");
            int pe=BitConverter.ToInt32(image,60);if(pe<64||pe+264>image.Length||BitConverter.ToUInt32(image,pe)!=0x4550||BitConverter.ToUInt16(image,pe+4)!=0x8664)throw new InvalidOperationException("PE_AMD64");
            int count=BitConverter.ToUInt16(image,pe+6),optional=pe+24,sections=optional+BitConverter.ToUInt16(image,pe+20);
            if(count<1||count>96||sections+count*40>image.Length||BitConverter.ToUInt16(image,optional)!=0x20b)throw new InvalidOperationException("PE_SECTIONS");
            uint exportRva=BitConverter.ToUInt32(image,optional+112),exportSize=BitConverter.ToUInt32(image,optional+116);
            int directory=PeOffset(image,exportRva,sections,count);uint nameCount=BitConverter.ToUInt32(image,directory+24);
            if(nameCount>65536)throw new InvalidOperationException("PE_EXPORT_COUNT");
            int namesTable=PeOffset(image,BitConverter.ToUInt32(image,directory+32),sections,count),ordinals=PeOffset(image,BitConverter.ToUInt32(image,directory+36),sections,count),functions=PeOffset(image,BitConverter.ToUInt32(image,directory+28),sections,count);
            for(int i=0;i<nameCount;i++) {
                int offset=PeOffset(image,BitConverter.ToUInt32(image,checked(namesTable+i*4)),sections,count),end=offset;
                while(end<image.Length&&image[end]!=0&&end-offset<256)end++;
                if(end==image.Length||end-offset>=256)throw new InvalidOperationException("PE_EXPORT_NAME");
                if(Encoding.ASCII.GetString(image,offset,end-offset)!=export)continue;
                uint ordinal=BitConverter.ToUInt16(image,checked(ordinals+i*2));if(ordinal>=BitConverter.ToUInt32(image,directory+20))throw new InvalidOperationException("PE_ORDINAL");
                uint rva=BitConverter.ToUInt32(image,checked(functions+(int)ordinal*4));
                if(rva>=exportRva&&(ulong)rva<((ulong)exportRva+exportSize))throw new InvalidOperationException("FORWARDED_EXPORT_NOT_OBSERVED_DIRECTLY");
                int code=PeOffset(image,rva,sections,count);if(code+16>image.Length)throw new InvalidOperationException("PE_CODE_BOUNDS");
                initial=new byte[16];Array.Copy(image,code,initial,0,16);return rva;
            }throw new InvalidOperationException("PE_EXPORT_NOT_FOUND:"+export);
        }
        void Apply(ThreadState thread,Context context,bool resumeFault) {
            for(int i=0;i<3;i++)context.Write(72+i*8,entries[i]);
            context.Write(96,thread.Calls.Count==0?0:thread.Calls.Peek().ReturnAddress);
            long enabled=0x400;for(int i=0;i<3;i++)if(entries[i]!=0)enabled|=1L<<(i*2);
            if(thread.Calls.Count!=0)enabled|=0x40;
            context.Write(104,0);context.Write(112,enabled);
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
            for(int i=0;i<names.Length;i++) {
                if(!String.Equals(file,Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),libraries[i]),StringComparison.OrdinalIgnoreCase))continue;
                if(entries[i]!=0)throw new InvalidOperationException("DUPLICATE_OBSERVED_MODULE");
                byte[] expected;byte[] image=File.ReadAllBytes(file);long offset=ExportRva(image,names[i],out expected);
                entries[i]=remote+offset;var actual=Read(entries[i],16);
                for(int n=0;n<16;n++)if(actual[n]!=expected[n])throw new InvalidOperationException("SYSTEM_STUB_IDENTITY_MISMATCH");
                string hash;using(var sha=System.Security.Cryptography.SHA256.Create())hash=BitConverter.ToString(sha.ComputeHash(image)).Replace("-","").ToLowerInvariant();
                Record("trace_hook_identity",new{api=names[i],module=file,module_sha256=hash,export_rva=offset,address=entries[i].ToString("x"),remote_first16_equal_disk=true,mechanism="hardware execution breakpoint; no code patch"});
                installed=true;ConfigureAll();
            }
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
                        Record("trace_call_return",new{call_id=call.Id,parent_call_id=call.ParentId,inside_wsa_startup=call.WithinStartup,thread=ev.Tid,api=call.Api,object_name=call.Name,desired_access="0x"+call.Access.ToString("x8"),ntstatus=call.Api.StartsWith("Nt")?"0x"+result.ToString("x8"):null,return_value=result,return_kind=call.Api.StartsWith("Nt")?"NTSTATUS":call.Api=="WSAStartup"?"Winsock error code":"Win32 error code",return_address=rip.ToString("x")});
                    }while(thread.Calls.Count!=0&&thread.Calls.Peek().ReturnAddress==rip);
                }
                for(int i=0;i<3;i++)if((status&(1L<<i))!=0) {
                    if(rip!=entries[i])throw new InvalidOperationException("TRACE_ENTRY_MISMATCH");
                    bool within=false;foreach(var ancestor in thread.Calls)if(ancestor.Api=="WSAStartup")within=true;
                    var call=new Call{Id=++callId,Api=names[i],ParentId=thread.Calls.Count==0?0:thread.Calls.Peek().Id,WithinStartup=within,ReturnAddress=BitConverter.ToInt64(Read(context.Read(152),8),0)};
                    if(call.Api=="WSAStartup"){call.Name="requested-version=0x"+(context.Read(128)&0xffff).ToString("x4");sawStartup=true;}
                    else if(call.Api=="RegOpenKeyExA"){call.Name=RegistryName(context.Read(128),context.Read(136));call.Access=unchecked((uint)context.Read(192));}
                    else {call.Name=ObjectName(context.Read(184));call.Access=unchecked((uint)context.Read(136));}
                    if(thread.Calls.Count>16)throw new InvalidOperationException("TRACE_NESTING_LIMIT");thread.Calls.Push(call);
                    Record("trace_call_enter",new{call_id=call.Id,parent_call_id=call.ParentId,inside_wsa_startup=call.WithinStartup,thread=ev.Tid,api=call.Api,object_name=call.Name,desired_access="0x"+call.Access.ToString("x8"),return_address=call.ReturnAddress.ToString("x")});
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
                if(exit){if(!installed||!sawStartup||callId==0||Array.IndexOf(entries,0L)>=0)throw new InvalidOperationException("TRACE_COVERAGE_MISSING");return exitCode;}
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
