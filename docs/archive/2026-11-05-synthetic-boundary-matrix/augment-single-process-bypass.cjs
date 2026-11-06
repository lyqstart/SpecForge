// Full source edits are preconditioned on the frozen prior raw identity.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const file=path.resolve('packages/daemon-core/src/verification/windows/LpacSingleProcessProbe.cs'),old=fs.readFileSync(file),identity=JSON.parse(fs.readFileSync(path.join(__dirname,'build-single-process-typescript-29/identity.json')));
if(crypto.createHash('sha256').update(old).digest('hex')!==identity.members.find(m=>m.file==='LpacSingleProcessProbe.cs').sha256)throw Error('SOURCE_DRIFT');let text=old.toString('utf8');
function replace(a,b){if(text.split(a).length!==2)throw Error('EXACT_REPLACEMENT_COUNT:'+a);text=text.replace(a,b);}
replace('int baseline=Create(node,0),breakaway=', 'bool bypass=Bypass(host,node);int baseline=Create(node,0),breakaway=');
replace('return host?(queried', 'return !bypass?40:host?(queried');
const first=text.indexOf('    internal static bool Validate('),last=text.indexOf('    [StructLayout',first);if(first<0||last<first)throw Error('VALIDATE_BOUNDARY');
text=text.slice(0,first)+String.raw`    internal static bool Validate(byte[] stdout,byte[] stderr,uint exit,uint expectedPid,uint expectedParent){
        if(exit!=0||stderr.Length!=0)return false;string[] lines=Encoding.UTF8.GetString(stdout).Trim().Split('\n');if(lines.Length!=2||!lines[0].StartsWith("SFSINGLE_BYPASS:")||!lines[1].StartsWith("SFSINGLE_NATIVE:"))return false;
        var json=new System.Web.Script.Serialization.JavaScriptSerializer();var b=json.Deserialize<Dictionary<string,object>>(lines[0].Substring("SFSINGLE_BYPASS:".Length));var d=json.Deserialize<Dictionary<string,object>>(lines[1].Substring("SFSINGLE_NATIVE:".Length));
        if(Convert.ToUInt32(d["pid"])!=expectedPid||Convert.ToUInt32(b["pid"])!=expectedPid||Convert.ToUInt32(b["parent_pid"])!=expectedParent||Convert.ToBoolean(b["host_control"])||Convert.ToBoolean(d["host_control"])||!Convert.ToBoolean(d["child_policy_query"])||Convert.ToUInt32(d["child_policy_flags"])!=1)return false;
        var rights=(System.Collections.ArrayList)b["parent_privileged_access"];var errors=(System.Collections.ArrayList)b["parent_privileged_open_errors"];uint[] expected={0x80,0x28,0x40};if(rights.Count!=3||errors.Count!=3)return false;for(int i=0;i<3;i++)if(Convert.ToUInt32(rights[i])!=expected[i]||Convert.ToInt32(errors[i])!=5)return false;
        int child=Convert.ToInt32(d["breakaway_create_error"]),console=Convert.ToInt32(d["console_error"]),over=Convert.ToInt32(b["override_create_error"]);return Convert.ToInt32(d["baseline_create_error"])==367&&(child==367||child==5)&&Convert.ToInt32(b["override_attribute_error"])==0&&(over==367||over==5)&&!Convert.ToBoolean(d["console_allocated"])&&(console==367||console==5);
    }
    static bool Bypass(bool host,string node){
        var basic=new Basic();uint returned;int status=NtQueryInformationProcess(GetCurrentProcess(),0,ref basic,(uint)Marshal.SizeOf(typeof(Basic)),out returned);if(status!=0||returned!=Marshal.SizeOf(typeof(Basic))||basic.Parent.ToUInt64()==0||basic.Parent.ToUInt64()>UInt32.MaxValue)throw new Exception("PARENT_IDENTITY_UNKNOWN");
        uint parent=(uint)basic.Parent.ToUInt64();uint[] rights={0x80,0x28,0x40};var errors=new int[3];for(int i=0;i<3;i++){IntPtr handle=OpenProcess(rights[i],false,parent);errors[i]=handle==IntPtr.Zero?Marshal.GetLastWin32Error():0;if(handle!=IntPtr.Zero)CloseHandle(handle);}
        int setup;int created=CreateOverride(node,out setup);Console.WriteLine("SFSINGLE_BYPASS:"+new LpacProbeJson().Serialize(new{pid=Process.GetCurrentProcess().Id,parent_pid=parent,host_control=host,parent_privileged_access=rights,parent_privileged_open_errors=errors,override_attribute_error=setup,override_create_error=created}));return Array.TrueForAll(errors,e=>e==(host?0:5))&&setup==0&&(host?created==0:created==367||created==5);
    }
    static int CreateOverride(string node,out int setup){
        setup=0;UIntPtr bytes=UIntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref bytes);if(bytes.ToUInt64()==0||bytes.ToUInt64()>65536)throw new Exception("OVERRIDE_ATTRIBUTE_SIZE");IntPtr list=Marshal.AllocHGlobal((int)bytes.ToUInt64()),value=Marshal.AllocHGlobal(4);bool initialized=false;
        try{initialized=InitializeProcThreadAttributeList(list,1,0,ref bytes);if(!initialized){setup=Marshal.GetLastWin32Error();return -1;}Marshal.WriteInt32(value,2);if(!UpdateProcThreadAttribute(list,0,new IntPtr(0x2000E),value,new UIntPtr(4),IntPtr.Zero,IntPtr.Zero)){setup=Marshal.GetLastWin32Error();return -1;}
            var startup=new StartupInfoEx();startup.Startup.Size=Marshal.SizeOf(typeof(StartupInfoEx));startup.Attributes=list;var process=new ProcessInformation();bool ok=CreateProcessOverride(node,new StringBuilder("\""+node+"\" -e \"process.exit(0)\""),IntPtr.Zero,IntPtr.Zero,false,0x08080404u,IntPtr.Zero,Path.GetDirectoryName(node),ref startup,out process);int error=ok?0:Marshal.GetLastWin32Error();if(ok)try{if(!TerminateProcess(process.Process,125)||WaitForSingleObject(process.Process,5000)!=0)throw new Exception("OVERRIDE_CHILD_CLEANUP_UNKNOWN");uint code;if(!GetExitCodeProcess(process.Process,out code)||code!=125)throw new Exception("OVERRIDE_CHILD_EXIT_UNKNOWN");}finally{CloseHandle(process.Thread);CloseHandle(process.Process);}return error;
        }finally{if(initialized)DeleteProcThreadAttributeList(list);Marshal.FreeHGlobal(value);Marshal.FreeHGlobal(list);}
    }
`+text.slice(last);
const methods=String.raw`
    [StructLayout(LayoutKind.Sequential)]struct Basic{internal int ExitStatus;internal IntPtr Peb;internal UIntPtr Affinity;internal int BasePriority;internal UIntPtr Pid,Parent;}
    [StructLayout(LayoutKind.Sequential)]struct StartupInfoEx{internal StartupInfo Startup;internal IntPtr Attributes;}
    [DllImport("ntdll.dll")]static extern int NtQueryInformationProcess(IntPtr process,int kind,ref Basic info,uint size,out uint returned);
    [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,[MarshalAs(UnmanagedType.Bool)]bool inherit,uint pid);
    [DllImport("kernel32.dll",EntryPoint="CreateProcessW",CharSet=CharSet.Unicode,SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool CreateProcessOverride(string image,StringBuilder command,IntPtr pa,IntPtr ta,[MarshalAs(UnmanagedType.Bool)]bool inherit,uint flags,IntPtr env,string cwd,ref StartupInfoEx startup,out ProcessInformation info);
    [DllImport("kernel32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref UIntPtr bytes);
    [DllImport("kernel32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,UIntPtr size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32.dll")]static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool GetExitCodeProcess(IntPtr process,out uint code);
`;
const end=text.lastIndexOf('}');text=text.slice(0,end)+methods+text.slice(end);fs.writeFileSync(file,text);console.log('FROZEN_SOURCE_PRECONDITION_PASS;BYPASS_PROBE_ADDED');
