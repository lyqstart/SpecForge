// Synthetic acceptance probe only. Not registered, packaged, or called by a product tool.
// D20 acceptance must finish before a production executor is wired.
using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

internal static class LpacStartupPoc {
    const uint KillOnClose=0x2000, ActiveLimit=0x8, JobMemory=0x200;
    const int IsAppContainer=29, AppContainerSid=31, IsLpac=46;
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static readonly List<object> Events = new List<object>();
    static string eventFile;
    static void Record(string name, object data) {
        var entry=new {utc=DateTime.UtcNow.ToString("o"),name=name,data=data};
        Events.Add(entry); File.AppendAllText(eventFile,Json.Serialize(entry)+"\n",new UTF8Encoding(false));
    }
    static void Check(bool ok,string operation) {if(!ok) throw new Win32Exception(Marshal.GetLastWin32Error(),operation);}
    static string Hash(string file) {using(var sha=SHA256.Create())using(var f=File.OpenRead(file))return BitConverter.ToString(sha.ComputeHash(f)).Replace("-","").ToLowerInvariant();}
    static void NewFile(string file,string text) {using(var f=new FileStream(file,FileMode.CreateNew,FileAccess.Write))using(var w=new StreamWriter(f,new UTF8Encoding(false)))w.Write(text);}
    static void NoLinks(string file) {
        for(string p=Path.GetFullPath(file);p!=null;p=Path.GetDirectoryName(p)) {
            if((File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("REPARSE:"+p);
        }
    }
    static string SidText(IntPtr sid) {return new SecurityIdentifier(sid).Value;}
    static void ReadOnlyTree(string dir, SecurityIdentifier app) {
        NoLinks(dir);
        var user=WindowsIdentity.GetCurrent().User;
        var system=new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null);
        foreach(var child in Directory.GetFileSystemEntries(dir)) {
            if((File.GetAttributes(child)&FileAttributes.Directory)!=0)ReadOnlyTree(child,app);
            else {
                NoLinks(child);
                var before=File.GetAccessControl(child,AccessControlSections.Access|AccessControlSections.Owner);
                if(before.GetOwner(typeof(SecurityIdentifier)).Value!=user.Value)throw new InvalidOperationException("OWNED_FILE_OWNER_MISMATCH");
                Record("file_acl_before",new {path=child,sddl=before.GetSecurityDescriptorSddlForm(AccessControlSections.Access|AccessControlSections.Owner)});
                // Existing owner is verified, not reassigned: ownership is not required to change the DACL.
                var acl=new FileSecurity();acl.SetAccessRuleProtection(true,false);
                acl.AddAccessRule(new FileSystemAccessRule(user,FileSystemRights.FullControl,AccessControlType.Allow));
                acl.AddAccessRule(new FileSystemAccessRule(system,FileSystemRights.FullControl,AccessControlType.Allow));
                acl.AddAccessRule(new FileSystemAccessRule(app,FileSystemRights.ReadAndExecute,AccessControlType.Allow));
                File.SetAccessControl(child,acl);
                Record("file_acl",new {path=child,sddl=File.GetAccessControl(child).GetSecurityDescriptorSddlForm(AccessControlSections.Access|AccessControlSections.Owner)});
            }
        }
        var beforeDirectory=Directory.GetAccessControl(dir,AccessControlSections.Access|AccessControlSections.Owner);
        if(beforeDirectory.GetOwner(typeof(SecurityIdentifier)).Value!=user.Value)throw new InvalidOperationException("OWNED_DIRECTORY_OWNER_MISMATCH");
        Record("directory_acl_before",new {path=dir,sddl=beforeDirectory.GetSecurityDescriptorSddlForm(AccessControlSections.Access|AccessControlSections.Owner)});
        var dacl=new DirectorySecurity();dacl.SetAccessRuleProtection(true,false);
        var inherit=InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit;
        dacl.AddAccessRule(new FileSystemAccessRule(user,FileSystemRights.FullControl,inherit,PropagationFlags.None,AccessControlType.Allow));
        dacl.AddAccessRule(new FileSystemAccessRule(system,FileSystemRights.FullControl,inherit,PropagationFlags.None,AccessControlType.Allow));
        dacl.AddAccessRule(new FileSystemAccessRule(app,FileSystemRights.ReadAndExecute,inherit,PropagationFlags.None,AccessControlType.Allow));
        Directory.SetAccessControl(dir,dacl);
        Record("directory_acl",new {path=dir,sddl=Directory.GetAccessControl(dir).GetSecurityDescriptorSddlForm(AccessControlSections.Access|AccessControlSections.Owner)});
    }
    static IntPtr TokenInfo(IntPtr token,int kind) {
        uint needed; GetTokenInformation(token,kind,IntPtr.Zero,0,out needed);
        if(needed==0 || needed>65536)throw new InvalidOperationException("TOKEN_SIZE:"+kind);
        var data=Marshal.AllocHGlobal((int)needed);
        try {Check(GetTokenInformation(token,kind,data,needed,out needed),"GetTokenInformation:"+kind);return data;}
        catch {Marshal.FreeHGlobal(data);throw;}
    }
    static bool ProbeAccess(IntPtr token,string sidGrant,string label) {
        string user=WindowsIdentity.GetCurrent().User.Value;
        string sddl="O:"+user+"G:"+user+"D:(A;;0x1;;;WD)"+(sidGrant==null?"":"(A;;0x1;;;"+sidGrant+")");
        IntPtr descriptor;uint size;Check(ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl,1,out descriptor,out size),"ConvertSecurityDescriptor");
        IntPtr privileges=Marshal.AllocHGlobal(4096);
        try {
            uint bytes=4096,granted;bool allowed;var mapping=new GenericMapping();
            mapping.Read=mapping.Write=mapping.Execute=mapping.All=1;
            Check(AccessCheck(descriptor,token,1,ref mapping,privileges,ref bytes,out granted,out allowed),"AccessCheck:"+label);
            Record("effective_access_probe",new {label=label,sddl=sddl,desired_access=1,allowed=allowed,granted=granted});
            return allowed&&granted==1;
        } finally {Marshal.FreeHGlobal(privileges);LocalFree(descriptor);}
    }
    static void VerifyToken(IntPtr process,string expectedSid,bool expectedLpac) {
        IntPtr token;Check(OpenProcessToken(process,10,out token),"OpenProcessToken");
        try {
            int ac,caps;
            IntPtr v=TokenInfo(token,IsAppContainer);try{ac=Marshal.ReadInt32(v);}finally{Marshal.FreeHGlobal(v);}
            // Win32 docs do not specify a class46 result contract; preserve real rejection.
            v=Marshal.AllocHGlobal(4);uint returned;bool query;int queryError,lpacValue;
            try {Marshal.WriteInt32(v,-1);query=GetTokenInformation(token,IsLpac,v,4,out returned);queryError=query?0:Marshal.GetLastWin32Error();lpacValue=Marshal.ReadInt32(v);}
            finally{Marshal.FreeHGlobal(v);}
            Record("class46_diagnostic",new {api_success=query,win32_error=queryError,returned_bytes=returned,value=query?(int?)lpacValue:null,expected_lpac=expectedLpac});
            v=TokenInfo(token,30);try{caps=Marshal.ReadInt32(v);}finally{Marshal.FreeHGlobal(v);}
            v=TokenInfo(token,AppContainerSid);string actual;try{actual=SidText(Marshal.ReadIntPtr(v));}finally{Marshal.FreeHGlobal(v);}
            if(ac!=1 || caps!=0 || actual!=expectedSid)throw new InvalidOperationException("TOKEN_BOUNDARY_MISMATCH");
            IntPtr duplicate;Check(DuplicateToken(token,2,out duplicate),"DuplicateToken");
            bool own,unscoped,allApps;
            try {own=ProbeAccess(duplicate,expectedSid,"package-read");unscoped=ProbeAccess(duplicate,null,"everyone-only");allApps=ProbeAccess(duplicate,"S-1-15-2-1","all-application-packages");}
            finally{CloseHandle(duplicate);}
            Record("actual_token",new {is_appcontainer=ac,lpac_effective_check=expectedLpac,capability_count=caps,sid=actual,package_read=own,everyone_only=unscoped,all_application_packages=allApps});
            if(!own || unscoped || allApps==expectedLpac || (query&&(lpacValue!=0)!=expectedLpac))throw new InvalidOperationException("LPAC_EFFECTIVE_ACCESS_MISMATCH");
        } finally {CloseHandle(token);}
    }
    sealed class Output {
        public readonly MemoryStream Bytes=new MemoryStream(); public bool Overflow; public string Error; public Thread Thread;
        public void Start(IntPtr handle,IntPtr job) {
            Thread=new Thread(delegate() {
                try {using(var file=new FileStream(new SafeFileHandle(handle,true),FileAccess.Read,4096,false)) {
                    var buffer=new byte[4096];int n;
                    while((n=file.Read(buffer,0,buffer.Length))>0) {
                        if(Bytes.Length+n>1048576) {Overflow=true;TerminateJobObject(job,137);break;}
                        Bytes.Write(buffer,0,n);
                    }
                }} catch(Exception e) {Error=e.GetType().Name+":"+e.Message;}
            });Thread.IsBackground=true;Thread.Start();
        }
    }
    static void Attribute(IntPtr list,long name,IntPtr value,int size) {Check(UpdateProcThreadAttribute(list,0,new IntPtr(name),value,new UIntPtr((uint)size),IntPtr.Zero,IntPtr.Zero),"UpdateAttribute:"+name);}
    static IntPtr AllocStructure(object value,List<IntPtr> allocations) {
        var p=Marshal.AllocHGlobal(Marshal.SizeOf(value));allocations.Add(p);Marshal.StructureToPtr(value,p,false);return p;
    }
    static BasicAccounting Accounting(IntPtr job) {
        BasicAccounting data;Check(QueryInformationJobObject(job,1,out data,(uint)Marshal.SizeOf(typeof(BasicAccounting)),IntPtr.Zero),"JobAccounting");return data;
    }
    static string Quote(string s) {if(s.IndexOf('"')>=0 || s.EndsWith("\\"))throw new InvalidOperationException("UNSUPPORTED_ARGUMENT");return "\""+s+"\"";}
    public static int Main(string[] args) {
        // Fixed P01 probe; no caller-supplied script/argv/environment.
        if(args.Length!=3 || args[0]!="--synthetic-p01" || IntPtr.Size!=8) {Console.Error.WriteLine("usage: --synthetic-p01 NEW_ATTEMPT_ROOT PINNED_NODE_EXE");return 64;}
        string root=Path.GetFullPath(args[1]),sourceNode=Path.GetFullPath(args[2]);
        if(Directory.Exists(root) || File.Exists(root)) {Console.Error.WriteLine("ATTEMPT_COLLISION");return 65;}
        // Only a new UUID leaf in this exact synthetic scope is eligible for ACL edits.
        string parent=Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,".tmp","verification-lpac"));
        Guid nonce;
        if(Path.GetDirectoryName(root)!=parent || !Guid.TryParseExact(Path.GetFileName(root),"N",out nonce))return 66;
        Directory.CreateDirectory(parent);NoLinks(parent);NoLinks(sourceNode);
        Directory.CreateDirectory(root);eventFile=Path.Combine(root,"events.jsonl");
        string moniker="specforge.poc."+nonce.ToString("N"),sidText=null,profile=null;
        bool profileCreated=false,started=false,allEnded=false,resumed=false;
        uint? exit=null;int result=1;string error=null;
        IntPtr sid=IntPtr.Zero,job=IntPtr.Zero,attributes=IntPtr.Zero,environment=IntPtr.Zero;
        var pi=new ProcessInformation();var allocations=new List<IntPtr>();var handles=new List<IntPtr>();
        var stdout=new Output();var stderr=new Output();
        var startedUtc=DateTime.UtcNow.ToString("o");var timer=Stopwatch.StartNew();
        Record("attempt_reserved",new {root=root,moniker=moniker,source_node=sourceNode,node_sha256=Hash(sourceNode),launcher_sha256=Hash(System.Reflection.Assembly.GetExecutingAssembly().Location),wall_ms=120000,process_limit=32,job_commit_bytes=1073741824,output_limit_each=1048576,capabilities=new string[0],application_file_write=false});
        try {
            int hr=CreateAppContainerProfile(moniker,moniker,"SpecForge synthetic readonly acceptance",IntPtr.Zero,0,out sid);
            if(hr!=0)throw new COMException("CreateAppContainerProfile",hr);profileCreated=true;sidText=SidText(sid);
            Record("profile_created",new {moniker=moniker,sid=sidText});
            IntPtr folder;hr=GetAppContainerFolderPath(sidText,out folder);if(hr!=0)throw new COMException("GetAppContainerFolderPath",hr);
            try{profile=Marshal.PtrToStringUni(folder);}finally{Marshal.FreeCoTaskMem(folder);}
            string ownedProfile=Path.GetFullPath(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Packages",moniker));
            if(!Path.GetFullPath(profile).StartsWith(ownedProfile+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("PROFILE_OWNERSHIP_MISMATCH");
            NoLinks(ownedProfile);Record("profile_path",new {profile=profile,owned_root=ownedProfile});
            string input=Path.Combine(root,"input"),runtime=Path.Combine(root,"runtime");
            Directory.CreateDirectory(input);Directory.CreateDirectory(runtime);Directory.CreateDirectory(Path.Combine(profile,"Temp"));
            string node=Path.Combine(runtime,"node.exe");File.Copy(sourceNode,node,false);
            // P01 only: no filesystem mutation probes until token/Job startup works.
            NewFile(Path.Combine(input,"positive.cjs"),"'use strict';const assert=require('node:assert/strict');assert.equal(2+2,4);console.log('SPECFORGE_SYNTHETIC_P01');\n");
            ReadOnlyTree(ownedProfile,new SecurityIdentifier(sid));ReadOnlyTree(input,new SecurityIdentifier(sid));ReadOnlyTree(runtime,new SecurityIdentifier(sid));
            Record("input_frozen",new {node_sha256=Hash(node),input_sha256=Hash(Path.Combine(input,"positive.cjs")),script=Path.Combine(input,"positive.cjs")});
            job=CreateJobObjectW(IntPtr.Zero,null);Check(job!=IntPtr.Zero,"CreateJobObject");
            var limits=new ExtendedLimit();limits.Basic.LimitFlags=KillOnClose|ActiveLimit|JobMemory;limits.Basic.ActiveProcessLimit=32;limits.JobMemoryLimit=new UIntPtr(1073741824);
            Check(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(ExtendedLimit))),"SetJobLimits");
            ExtendedLimit actualLimits;Check(QueryJobLimits(job,9,out actualLimits,(uint)Marshal.SizeOf(typeof(ExtendedLimit)),IntPtr.Zero),"QueryJobLimits");
            if(actualLimits.Basic.LimitFlags!=limits.Basic.LimitFlags || actualLimits.Basic.ActiveProcessLimit!=32 || actualLimits.JobMemoryLimit.ToUInt64()!=1073741824)throw new InvalidOperationException("JOB_LIMIT_MISMATCH");
            Record("job_limits",new {flags=actualLimits.Basic.LimitFlags,processes=actualLimits.Basic.ActiveProcessLimit,memory=actualLimits.JobMemoryLimit.ToUInt64(),breakaway=false});
            var sa=new SecurityAttributes();sa.Length=Marshal.SizeOf(typeof(SecurityAttributes));sa.Inherit=1;
            IntPtr outRead,outWrite,errRead,errWrite;
            Check(CreatePipe(out outRead,out outWrite,ref sa,0),"stdout pipe");handles.Add(outRead);handles.Add(outWrite);
            Check(SetHandleInformation(outRead,1,0),"stdout no inherit");
            Check(CreatePipe(out errRead,out errWrite,ref sa,0),"stderr pipe");handles.Add(errRead);handles.Add(errWrite);
            Check(SetHandleInformation(errRead,1,0),"stderr no inherit");
            IntPtr stdin=CreateFileW("NUL",0x80000000,3,ref sa,3,0,IntPtr.Zero);Check(stdin!=new IntPtr(-1),"stdin NUL");handles.Add(stdin);
            UIntPtr attrBytes=UIntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,3,0,ref attrBytes);
            attributes=Marshal.AllocHGlobal(checked((int)attrBytes.ToUInt64()));Check(InitializeProcThreadAttributeList(attributes,3,0,ref attrBytes),"InitializeAttributes");
            var caps=new SecurityCapabilities();caps.AppContainerSid=sid;
            Attribute(attributes,0x20009,AllocStructure(caps,allocations),Marshal.SizeOf(typeof(SecurityCapabilities)));
            var policy=Marshal.AllocHGlobal(4);allocations.Add(policy);Marshal.WriteInt32(policy,1);Attribute(attributes,0x2000F,policy,4);
            var inheritList=Marshal.AllocHGlobal(IntPtr.Size*3);allocations.Add(inheritList);
            Marshal.WriteIntPtr(inheritList,0,stdin);Marshal.WriteIntPtr(inheritList,IntPtr.Size,outWrite);Marshal.WriteIntPtr(inheritList,IntPtr.Size*2,errWrite);
            Attribute(attributes,0x20002,inheritList,IntPtr.Size*3);
            var si=new StartupInfoEx();si.Startup.Size=Marshal.SizeOf(typeof(StartupInfoEx));si.Startup.Flags=0x100;si.Startup.StdInput=stdin;si.Startup.StdOutput=outWrite;si.Startup.StdError=errWrite;si.Attributes=attributes;
            string systemRoot=Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            string env="APPDATA="+profile+"\0LOCALAPPDATA="+profile+"\0SystemRoot="+systemRoot+"\0TEMP="+Path.Combine(profile,"Temp")+"\0TMP="+Path.Combine(profile,"Temp")+"\0USERPROFILE="+profile+"\0WINDIR="+systemRoot+"\0\0";
            environment=Marshal.StringToHGlobalUni(env);
            string command=Quote(node)+" "+Quote(Path.Combine(input,"positive.cjs"));
            Record("create_suspended_requested",new {executable=node,command_line=command,cwd=input,environment_keys=new[]{"APPDATA","LOCALAPPDATA","SystemRoot","TEMP","TMP","USERPROFILE","WINDIR"},creation_flags=0x08080404});
            // Negative control is ordinary AppContainer but NEVER resumed. Same executable,
            // SID/capabilities/handles/Job; only the opt-out policy differs.
            Marshal.WriteInt32(policy,0);
            var control=new ProcessInformation();
            try {
                Check(CreateProcessW(node,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,true,0x08080404,environment,input,ref si,out control),"Create ordinary AppContainer suspended control");
                Record("control_created_suspended",new{pid=control.ProcessId});
                Check(AssignProcessToJobObject(job,control.Process),"Assign control Job");VerifyToken(control.Process,sidText,false);
            } finally {
                if(control.Process!=IntPtr.Zero) {Check(TerminateProcess(control.Process,125),"Terminate control");Check(WaitForSingleObject(control.Process,5000)==0,"Wait control termination");CloseHandle(control.Process);CloseHandle(control.Thread);Record("control_terminated_never_resumed",new{pid=control.ProcessId});}
            }
            Marshal.WriteInt32(policy,1);
            Check(CreateProcessW(node,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,true,0x08080404,environment,input,ref si,out pi),"CreateProcessW LPAC suspended");started=true;
            Record("process_created_suspended",new {pid=pi.ProcessId,thread_id=pi.ThreadId});
            Check(AssignProcessToJobObject(job,pi.Process),"AssignProcessToJobObject");
            bool inJob;Check(IsProcessInJob(pi.Process,job,out inJob),"IsProcessInJob");if(!inJob)throw new InvalidOperationException("JOB_ASSOCIATION_MISSING");
            VerifyToken(pi.Process,sidText,true);Record("pre_resume_checks",new {job_association=true,actual_token_checked=true,acl_readback=true,ordinary_appcontainer_control_verified=true});
            // Broker closes its copies of child pipe endpoints before reading.
            foreach(var h in new[]{outWrite,errWrite,stdin}) {CloseHandle(h);handles.Remove(h);}
            stdout.Start(outRead,job);handles.Remove(outRead);stderr.Start(errRead,job);handles.Remove(errRead);
            Check(ResumeThread(pi.Thread)!=UInt32.MaxValue,"ResumeThread");resumed=true;Record("process_resumed",new {pid=pi.ProcessId});
            for(;;) {
                var count=Accounting(job);
                if(count.ActiveProcesses==0) {allEnded=true;Record("job_empty",new {active=count.ActiveProcesses,total=count.TotalProcesses,terminated=count.TotalTerminatedProcesses});break;}
                if(timer.ElapsedMilliseconds>120000) {Record("wall_timeout",new {elapsed_ms=timer.ElapsedMilliseconds});Check(TerminateJobObject(job,124),"TerminateJob timeout");}
                if(timer.ElapsedMilliseconds>130000)throw new InvalidOperationException("JOB_TERMINATION_UNPROVED");
                Thread.Sleep(20);
            }
            uint code;Check(GetExitCodeProcess(pi.Process,out code),"GetExitCodeProcess");exit=code;
            if(!stdout.Thread.Join(5000)||!stderr.Thread.Join(5000))throw new InvalidOperationException("OUTPUT_NOT_COMPLETE");
            if(stdout.Overflow||stderr.Overflow||stdout.Error!=null||stderr.Error!=null)throw new InvalidOperationException("OUTPUT_INCOMPLETE");
            string output=Encoding.UTF8.GetString(stdout.Bytes.ToArray());
            if(exit!=0||output!="SPECFORGE_SYNTHETIC_P01\n")throw new InvalidOperationException("POSITIVE_ASSERTION_NOT_MET");
            result=0;
        } catch(Exception e) {error=e.GetType().Name+":"+e.Message;Record("failure",new {type=e.GetType().FullName,message=e.Message,stack=e.StackTrace,hresult=e.HResult,win32_error=e is Win32Exception?((Win32Exception)e).NativeErrorCode:(int?)null});}
        finally {
            if(started&&!allEnded) {
                // Includes failure before assignment: terminate suspended primary directly too.
                if(job!=IntPtr.Zero)TerminateJobObject(job,125);
                TerminateProcess(pi.Process,125);WaitForSingleObject(pi.Process,5000);
                if(job!=IntPtr.Zero)try{allEnded=Accounting(job).ActiveProcesses==0;Record("failure_job_reconciled",new{all_ended=allEnded});}catch(Exception e){Record("termination_query_failed",new{message=e.Message});}
            }
            foreach(var h in handles)CloseHandle(h);
            if(pi.Thread!=IntPtr.Zero)CloseHandle(pi.Thread);if(pi.Process!=IntPtr.Zero)CloseHandle(pi.Process);
            if(job!=IntPtr.Zero)CloseHandle(job);
            if(attributes!=IntPtr.Zero){DeleteProcThreadAttributeList(attributes);Marshal.FreeHGlobal(attributes);}
            foreach(var p in allocations)Marshal.FreeHGlobal(p);if(environment!=IntPtr.Zero)Marshal.FreeHGlobal(environment);
            if(profileCreated&&(!started||allEnded)) {int hr=DeleteAppContainerProfile(moniker);Record("profile_cleanup",new{moniker=moniker,hresult=hr,profile_path_exists=profile!=null&&Directory.Exists(profile)});if(hr!=0)result=1;}
            if(sid!=IntPtr.Zero)FreeSid(sid);
            File.WriteAllBytes(Path.Combine(root,"stdout.bin"),stdout.Bytes.ToArray());File.WriteAllBytes(Path.Combine(root,"stderr.bin"),stderr.Bytes.ToArray());
            var receipt=new {schema="synthetic-lpac-startup/1",started_utc=startedUtc,finished_utc=DateTime.UtcNow.ToString("o"),duration_ms=timer.ElapsedMilliseconds,root=root,moniker=moniker,sid=sidText,profile=profile,process_started=started,process_resumed=resumed,application_exit_code=exit,job_all_ended=allEnded,scope="P01 startup only; other matrix rows NOT_EXECUTED",startup_result=result==0?"P01_STARTUP_OBSERVED":"FAILED",isolation_acceptance="INCOMPLETE",error=error,inner_exit_code=result};
            NewFile(Path.Combine(root,"receipt.json"),Json.Serialize(receipt)+"\n");Console.WriteLine(Json.Serialize(receipt));
        }
        return result;
    }

    [StructLayout(LayoutKind.Sequential)] struct SecurityCapabilities {public IntPtr AppContainerSid,Capabilities;public uint CapabilityCount,Reserved;}
    [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes {public int Length;public IntPtr Descriptor;public int Inherit;}
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct StartupInfo {public int Size;public string Reserved,Desktop,Title;public uint X,Y,XSize,YSize,XChars,YChars,Fill,Flags;public ushort Show,ReservedSize;public IntPtr ReservedPointer,StdInput,StdOutput,StdError;}
    [StructLayout(LayoutKind.Sequential)] struct StartupInfoEx {public StartupInfo Startup;public IntPtr Attributes;}
    [StructLayout(LayoutKind.Sequential)] struct ProcessInformation {public IntPtr Process,Thread;public uint ProcessId,ThreadId;}
    [StructLayout(LayoutKind.Sequential)] struct BasicLimit {public long ProcessTime,JobTime;public uint LimitFlags;public UIntPtr MinimumWorkingSet,MaximumWorkingSet;public uint ActiveProcessLimit;public UIntPtr Affinity;public uint Priority,Scheduling;}
    [StructLayout(LayoutKind.Sequential)] struct IoCounters {public ulong ReadOperations,WriteOperations,OtherOperations,ReadBytes,WriteBytes,OtherBytes;}
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit {public BasicLimit Basic;public IoCounters Io;public UIntPtr ProcessMemoryLimit,JobMemoryLimit,PeakProcessMemory,PeakJobMemory;}
    [StructLayout(LayoutKind.Sequential)] struct BasicAccounting {public long UserTime,KernelTime,PeriodUserTime,PeriodKernelTime;public uint PageFaults,TotalProcesses,ActiveProcesses,TotalTerminatedProcesses;}
    [StructLayout(LayoutKind.Sequential)] struct GenericMapping {public uint Read,Write,Execute,All;}
    [DllImport("advapi32.dll",SetLastError=true,CharSet=CharSet.Unicode)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string sddl,uint revision,out IntPtr descriptor,out uint size);
    [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool DuplicateToken(IntPtr token,int level,out IntPtr duplicate);
    [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool AccessCheck(IntPtr descriptor,IntPtr token,uint desired,ref GenericMapping mapping,IntPtr privileges,ref uint privilegeBytes,out uint granted,[MarshalAs(UnmanagedType.Bool)]out bool accessStatus);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int CreateAppContainerProfile(string name,string display,string description,IntPtr caps,uint count,out IntPtr sid);
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int DeleteAppContainerProfile(string name);
    [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int GetAppContainerFolderPath(string sid,out IntPtr path);
    [DllImport("advapi32.dll")] static extern IntPtr FreeSid(IntPtr sid);
    [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
    [DllImport("advapi32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr buffer,uint size,out uint needed);
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr sa,string name);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref ExtendedLimit limits,uint size);
    [DllImport("kernel32.dll",EntryPoint="QueryInformationJobObject",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool QueryJobLimits(IntPtr job,int kind,out ExtendedLimit limits,uint size,IntPtr returned);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool QueryInformationJobObject(IntPtr job,int kind,out BasicAccounting info,uint size,IntPtr returned);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool TerminateJobObject(IntPtr job,uint code);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref UIntPtr bytes);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,UIntPtr size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SecurityAttributes sa,uint size);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern IntPtr CreateFileW(string name,uint access,uint share,ref SecurityAttributes sa,uint creation,uint attributes,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool CreateProcessW(string application,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,[MarshalAs(UnmanagedType.Bool)]bool inherit,uint flags,IntPtr environment,string cwd,ref StartupInfoEx startup,out ProcessInformation process);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool GetExitCodeProcess(IntPtr process,out uint exit);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool TerminateProcess(IntPtr process,uint exit);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool CloseHandle(IntPtr handle);
}
