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
    static string HashText(string text) {using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(new UTF8Encoding(false).GetBytes(text))).Replace("-","").ToLowerInvariant();}
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
    static void VerifyToken(IntPtr process,string expectedSid,bool expectedLpac,string expectedCapability=null) {
        IntPtr token;Check(OpenProcessToken(process,10,out token),"OpenProcessToken");
        try {
            int ac,caps;
            IntPtr v=TokenInfo(token,IsAppContainer);try{ac=Marshal.ReadInt32(v);}finally{Marshal.FreeHGlobal(v);}
            // Win32 docs do not specify a class46 result contract; preserve real rejection.
            v=Marshal.AllocHGlobal(4);uint returned;bool query;int queryError,lpacValue;
            try {Marshal.WriteInt32(v,-1);query=GetTokenInformation(token,IsLpac,v,4,out returned);queryError=query?0:Marshal.GetLastWin32Error();lpacValue=Marshal.ReadInt32(v);}
            finally{Marshal.FreeHGlobal(v);}
            Record("class46_diagnostic",new {api_success=query,win32_error=queryError,returned_bytes=returned,value=query?(int?)lpacValue:null,expected_lpac=expectedLpac});
            string actualCapability=null;uint capabilityFlags=0;
            v=TokenInfo(token,30);try{caps=Marshal.ReadInt32(v);if(caps==1){actualCapability=SidText(Marshal.ReadIntPtr(v,8));capabilityFlags=unchecked((uint)Marshal.ReadInt32(v,16));}}finally{Marshal.FreeHGlobal(v);}
            v=TokenInfo(token,AppContainerSid);string actual;try{actual=SidText(Marshal.ReadIntPtr(v));}finally{Marshal.FreeHGlobal(v);}
            if(ac!=1 || caps!=(expectedCapability==null?0:1) || actual!=expectedSid || actualCapability!=expectedCapability || (caps==1&&(capabilityFlags&4)==0))throw new InvalidOperationException("TOKEN_BOUNDARY_MISMATCH");
            IntPtr duplicate;Check(DuplicateToken(token,2,out duplicate),"DuplicateToken");
            bool own,unscoped,allApps;
            try {own=ProbeAccess(duplicate,expectedSid,"package-read");unscoped=ProbeAccess(duplicate,null,"everyone-only");allApps=ProbeAccess(duplicate,"S-1-15-2-1","all-application-packages");}
            finally{CloseHandle(duplicate);}
            Record("actual_token",new {is_appcontainer=ac,lpac_effective_check=expectedLpac,capability_count=caps,capability_sid=actualCapability,capability_flags=capabilityFlags,sid=actual,package_read=own,everyone_only=unscoped,all_application_packages=allApps});
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
                        lock(Bytes){if(Bytes.Length+n>1048576) {Overflow=true;TerminateJobObject(job,137);break;}Bytes.Write(buffer,0,n);}
                    }
                }} catch(Exception e) {Error=e.GetType().Name+":"+e.Message;}
            });Thread.IsBackground=true;Thread.Start();
        }
        internal byte[] Snapshot(){lock(Bytes)return Bytes.ToArray();}
    }
    static void Attribute(IntPtr list,long name,IntPtr value,int size) {Check(UpdateProcThreadAttribute(list,0,new IntPtr(name),value,new UIntPtr((uint)size),IntPtr.Zero,IntPtr.Zero),"UpdateAttribute:"+name);}
    static IntPtr AllocStructure(object value,List<IntPtr> allocations) {
        var p=Marshal.AllocHGlobal(Marshal.SizeOf(value));allocations.Add(p);Marshal.StructureToPtr(value,p,false);return p;
    }
    static BasicAccounting Accounting(IntPtr job) {
        BasicAccounting data;Check(QueryInformationJobObject(job,1,out data,(uint)Marshal.SizeOf(typeof(BasicAccounting)),IntPtr.Zero),"JobAccounting");return data;
    }
    static int ObserveOwnedDescendants(IntPtr job,string sid,string capability,HashSet<uint> verified) {
        int bytes=8+32*IntPtr.Size;IntPtr buffer=Marshal.AllocHGlobal(bytes);
        try {
            var before=Accounting(job);uint returned;Check(QueryJobProcessIds(job,3,buffer,(uint)bytes,out returned),"Query Job PID list");int assigned=Marshal.ReadInt32(buffer,0),count=Marshal.ReadInt32(buffer,4);
            if(count<0||count>32)throw new InvalidOperationException("JOB_PID_LIST_BOUNDS");
            int live=0;var liveness=new List<object>();
            for(int i=0;i<count;i++){
                ulong raw=unchecked((ulong)Marshal.ReadInt64(buffer,8+i*IntPtr.Size));if(raw>UInt32.MaxValue)throw new InvalidOperationException("PID_WIDTH");uint pid=(uint)raw;
                IntPtr process=OpenProcess(0x1400,false,pid);Check(process!=IntPtr.Zero,"Open owned descendant");
                try{bool inJob;Check(IsProcessInJob(process,job,out inJob),"Descendant Job association");if(!inJob)throw new InvalidOperationException("DESCENDANT_NOT_IN_JOB");long created,ended,kernel,user;Check(GetProcessTimes(process,out created,out ended,out kernel,out user),"Owned descendant liveness");uint code;Check(GetExitCodeProcess(process,out code),"Owned descendant exit observation");bool running=ended==0&&code==259;if(running)live++;liveness.Add(new{pid=pid,created_filetime=created,ended_filetime=ended,exit_code=code,running=running});if(!verified.Contains(pid)){VerifyToken(process,sid,true,capability);var image=new StringBuilder(32768);uint chars=(uint)image.Capacity;Check(QueryFullProcessImageNameW(process,0,image,ref chars),"Owned descendant image identity");verified.Add(pid);Record("descendant_independently_verified",new{pid=pid,image=image.ToString(),created_filetime=created,created_utc=DateTime.FromFileTimeUtc(created).ToString("o"),ended_filetime=ended,exit_code_at_observation=code,job_association=true,token_sid_and_capability_checked=true});}}
                finally{CloseHandle(process);}
            }
            var after=Accounting(job);if(count!=live||live!=before.ActiveProcesses||live!=after.ActiveProcesses)Record("job_pid_liveness",new{listed=count,assigned=assigned,live=live,accounting_active_before=before.ActiveProcesses,accounting_active_after=after.ActiveProcesses,accounting_total=after.TotalProcesses,processes=liveness.ToArray(),note="Independent native observations; discrepancies are not accepted or explained by this record"});return live;
        }finally{Marshal.FreeHGlobal(buffer);}
    }
    static string Quote(string s) {if(s.IndexOf('"')>=0 || s.EndsWith("\\"))throw new InvalidOperationException("UNSUPPORTED_ARGUMENT");return "\""+s+"\"";}
    public static int Main(string[] args) {
        // Fixed P01 probe; no caller-supplied script/argv/environment.
        string resourceKind=args.Length==0?null:LpacResourceProbe.Kind(args[0]);bool resourceProbe=resourceKind!=null;
        var acceptedModes=new HashSet<string>(new[]{"--synthetic-p01","--synthetic-trace","--synthetic-registry-read-p01","--synthetic-registry-read-inline-p01","--synthetic-registry-read-canary","--synthetic-registry-read-pipe-trace-canary","--synthetic-registry-read-inherited-canary","--synthetic-registry-read-file-descendants","--synthetic-registry-read-private-registry","--synthetic-registry-read-private-registry-locked","--synthetic-registry-read-network-locked","--synthetic-registry-read-aliases-locked","--synthetic-registry-read-provisioned-symbolic-locked","--synthetic-registry-read-native-com-locked","--synthetic-registry-read-network-unc-locked"});
        acceptedModes.Add("--synthetic-registry-read-node-file-locked");acceptedModes.Add("--synthetic-registry-read-node-test-file-locked");
        acceptedModes.Add("--synthetic-registry-read-single-process-file");acceptedModes.Add("--synthetic-registry-read-single-process-native");
        acceptedModes.Add("--synthetic-registry-read-single-process-typescript");acceptedModes.Add("--synthetic-single-process-esm");acceptedModes.Add("--synthetic-single-process-inline");
        acceptedModes.Add("--synthetic-single-files");
        if(args.Length!=3 || (!resourceProbe&&!acceptedModes.Contains(args[0])) || IntPtr.Size!=8) {Console.Error.WriteLine("usage: synthetic mode NEW_ATTEMPT_ROOT PINNED_NODE_EXE");return 64;}
        bool nodeEsm=args[0]=="--synthetic-single-process-esm",singleInline=args[0]=="--synthetic-single-process-inline",singleBoundaryNode=args[0]=="--synthetic-single-files";
        bool nodeTypeScript=args[0]=="--synthetic-registry-read-single-process-typescript"||singleInline;
        string scriptName=singleInline?"positive.cjs":nodeTypeScript?"tests/positive.test.ts":nodeEsm?"tests/positive.test.mjs":"positive.cjs",moduleName=nodeTypeScript?"src/fixed-module.ts":nodeEsm?"src/fixed-module.mjs":"fixed-module.cjs";
        bool singleProcess=args[0]=="--synthetic-registry-read-single-process-file"||args[0]=="--synthetic-registry-read-single-process-native"||nodeTypeScript||nodeEsm||singleBoundaryNode;
        bool singleProcessNative=args[0]=="--synthetic-registry-read-single-process-native";
        bool nodeFileProbe=args[0]=="--synthetic-registry-read-node-file-locked"||args[0]=="--synthetic-registry-read-node-test-file-locked"||singleProcess&&!singleProcessNative&&!singleBoundaryNode;
        bool nodeTestRunner=nodeFileProbe&&!singleInline&&(args[0]=="--synthetic-registry-read-node-test-file-locked"||singleProcess);
        bool extendedNetwork=args[0]=="--synthetic-registry-read-network-unc-locked";
        bool nativeBoundary=args[0]=="--synthetic-registry-read-native-com-locked";
        bool provisionedSymbolic=args[0]=="--synthetic-registry-read-provisioned-symbolic-locked";
        bool aliasProbe=args[0]=="--synthetic-registry-read-aliases-locked"||provisionedSymbolic;
        bool networkProbe=args[0]=="--synthetic-registry-read-network-locked"||aliasProbe||nativeBoundary||extendedNetwork;
        bool lockPrivateRegistry=args[0]=="--synthetic-registry-read-private-registry-locked"||networkProbe||resourceProbe||nodeFileProbe||singleProcess;
        bool privateRegistryProbe=args[0]=="--synthetic-registry-read-private-registry"||(!resourceProbe&&!nodeFileProbe&&!singleProcess&&lockPrivateRegistry);
        bool fileProbe=args[0]=="--synthetic-registry-read-file-descendants"||privateRegistryProbe;
        bool pipeTrace=args[0]=="--synthetic-registry-read-pipe-trace-canary";
        bool inheritTransport=args[0]=="--synthetic-registry-read-inherited-canary";
        bool traceMode=args[0]=="--synthetic-trace"||pipeTrace;
        bool canaryProbe=args[0]=="--synthetic-registry-read-canary"||pipeTrace||inheritTransport;
        bool registryExperiment=args[0]=="--synthetic-registry-read-p01"||args[0]=="--synthetic-registry-read-inline-p01"||canaryProbe||fileProbe||resourceProbe||nodeFileProbe||singleProcess;
        bool inlineProbe=args[0]=="--synthetic-registry-read-inline-p01"||canaryProbe||fileProbe||resourceProbe||singleInline||singleBoundaryNode;
        string profileId=singleProcess?"windows-lpac-node-single-process-readonly/v1":registryExperiment?"windows-lpac-node-readonly-registry-read-experiment/v1":"windows-lpac-node-readonly/v1";
        int wallMs=resourceKind=="crash"||resourceKind=="daemon-crash"?20000:resourceProbe?8000:pipeTrace||inheritTransport||fileProbe||nodeFileProbe||singleProcess?20000:120000;
        uint processLimit=singleProcess?1u:resourceKind=="process"?8u:32u;ulong memoryLimit=resourceKind=="memory"?268435456ul:1073741824ul;
        string root=Path.GetFullPath(args[1]),sourceNode=Path.GetFullPath(args[2]);
        if(Directory.Exists(root) || File.Exists(root)) {Console.Error.WriteLine("ATTEMPT_COLLISION");return 65;}
        // Only a new UUID leaf in this exact synthetic scope is eligible for ACL edits.
        string parent=Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,".tmp","verification-lpac"));
        Guid nonce;
        if(Path.GetDirectoryName(root)!=parent || !Guid.TryParseExact(Path.GetFileName(root),"N",out nonce))return 66;
        Directory.CreateDirectory(parent);NoLinks(parent);NoLinks(sourceNode);
        Directory.CreateDirectory(root);eventFile=Path.Combine(root,"events.jsonl");
        string moniker=(registryExperiment?"specforge.regread.":"specforge.poc.")+nonce.ToString("N"),sidText=null,profile=null;
        bool profileCreated=false,started=false,allEnded=false,resumed=false,timedOut=false;
        uint? exit=null;int result=1;string error=null;
        IntPtr sid=IntPtr.Zero,job=IntPtr.Zero,attributes=IntPtr.Zero,environment=IntPtr.Zero,observationHandle=IntPtr.Zero;
        var pi=new ProcessInformation();var allocations=new List<IntPtr>();var handles=new List<IntPtr>();
        var stdout=new Output();var stderr=new Output();
        LpacRegistryReadCapability capability=null;
        LpacRegistryReadCanary canary=null;
        LpacParentLifetime parentLifetime=null;bool parentLost=false;
        LpacFileBoundaryProbe files=null;var verifiedPids=new HashSet<uint>();
        LpacSingleBoundaryFixture singleFiles=null;
        LpacInputIdentity.Identity[] inputIdentityBefore=null;
        LpacJobNotifications notifications=null;bool cancelled=false,parentExited=false,processBudgetExceeded=false,crashReady=false;int peakActive=0;
        var startedUtc=DateTime.UtcNow.ToString("o");var timer=Stopwatch.StartNew();
        Record("attempt_reserved",new {root=root,moniker=moniker,source_node=sourceNode,node_sha256=Hash(sourceNode),launcher_sha256=Hash(System.Reflection.Assembly.GetExecutingAssembly().Location),wall_ms=wallMs,process_limit=processLimit,job_commit_bytes=memoryLimit,output_limit_each=1048576,capabilities=registryExperiment?new[]{"registryRead"}:new string[0],application_file_write=false,profile_id=profileId});
        try {
            bool brokerAdmin=new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);using(var broker=Process.GetCurrentProcess())Record("broker_identity",new{pid=broker.Id,created_filetime=broker.StartTime.ToUniversalTime().ToFileTimeUtc(),user_sid=WindowsIdentity.GetCurrent().User.Value,administrator=brokerAdmin});if(registryExperiment&&brokerAdmin)throw new InvalidOperationException("SYNTHETIC_BROKER_MUST_REMAIN_UNELEVATED");
            if(registryExperiment){if(Hash(sourceNode)!="3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237")throw new InvalidOperationException("PINNED_NODE_DRIFT");capability=LpacRegistryReadCapability.Derive();Record("experiment_capability_derived",new{name="registryRead",sid=capability.Sid,count=1,profile_id=profileId,debugger=traceMode});}
            if(resourceKind=="daemon-crash")parentLifetime=new LpacParentLifetime(Record);
            if(lockPrivateRegistry)LpacOwnedRegistryGuard.AssertAbsent(moniker,Record);
            int hr=CreateAppContainerProfile(moniker,moniker,"SpecForge synthetic readonly acceptance",capability==null?IntPtr.Zero:capability.Attributes,capability==null?0u:1u,out sid);
            if(hr!=0)throw new COMException("CreateAppContainerProfile",hr);profileCreated=true;sidText=SidText(sid);
            Record("profile_created",new {moniker=moniker,sid=sidText});
            if(lockPrivateRegistry)LpacOwnedRegistryGuard.Lock(moniker,sidText,Record);
            IntPtr folder;hr=GetAppContainerFolderPath(sidText,out folder);if(hr!=0)throw new COMException("GetAppContainerFolderPath",hr);
            try{profile=Marshal.PtrToStringUni(folder);}finally{Marshal.FreeCoTaskMem(folder);}
            string ownedProfile=Path.GetFullPath(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Packages",moniker));
            if(!Path.GetFullPath(profile).StartsWith(ownedProfile+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("PROFILE_OWNERSHIP_MISMATCH");
            NoLinks(ownedProfile);Record("profile_path",new {profile=profile,owned_root=ownedProfile});
            string input=Path.Combine(root,"input"),runtime=Path.Combine(root,"runtime");
            Directory.CreateDirectory(input);Directory.CreateDirectory(runtime);Directory.CreateDirectory(Path.Combine(profile,"Temp"));
            string node=Path.Combine(runtime,"node.exe");File.Copy(sourceNode,node,false);
            // P01 only: no filesystem mutation probes until token/Job startup works.
            if(canaryProbe)canary=new LpacRegistryReadCanary(nonce.ToString("N"),Record);
            if(fileProbe)files=new LpacFileBoundaryProbe(root,input,runtime,profile,Record,privateRegistryProbe,networkProbe,aliasProbe,sidText,provisionedSymbolic,nativeBoundary,extendedNetwork);
            if(singleBoundaryNode){singleFiles=new LpacSingleBoundaryFixture(root,input,runtime,profile,sidText,Record);files=singleFiles.Files;}
            if(nodeTypeScript||nodeEsm){Directory.CreateDirectory(Path.Combine(input,"tests"));Directory.CreateDirectory(Path.Combine(input,"src"));}
            string probeScript=singleInline?LpacNodeFileProbe.InlineScript():nodeEsm?LpacNodeFileProbe.EsmScript():LpacNodeFileProbe.Script(nodeTypeScript),probeModule=nodeEsm?LpacNodeFileProbe.EsmModule():LpacNodeFileProbe.Module(nodeTypeScript);
            NewFile(Path.Combine(input,scriptName),singleBoundaryNode?singleFiles.NodeScript():nodeFileProbe?probeScript:resourceProbe?LpacResourceProbe.Script(resourceKind):fileProbe?files.Script():canaryProbe?canary.Script(pipeTrace,inheritTransport):"'use strict';const assert=require('node:assert/strict');assert.equal(2+2,4);console.log('SPECFORGE_SYNTHETIC_P01');\n");
            if(nodeFileProbe)NewFile(Path.Combine(input,moduleName),probeModule);
            if(nodeTypeScript||nodeEsm)NewFile(Path.Combine(input,"package.json"),"{\"type\":\"module\"}\n");
            string application=node;
            if(singleProcessNative){string helper=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"LpacSingleProcessNative.exe");NoLinks(helper);application=Path.Combine(input,"native-probe.exe");File.Copy(helper,application,false);Record("single_process_native_frozen",new{application=application,sha256=Hash(application)});}
            if(singleProcess){inputIdentityBefore=LpacInputIdentity.ValidateTree(input).Concat(LpacInputIdentity.ValidateTree(runtime)).ToArray();Record("single_input_identity_before",new{files=inputIdentityBefore,hardlinks_rejected=true,reparse_ancestors_rejected_before_follow=true,raw_byte_hashes=true});}
            ReadOnlyTree(ownedProfile,new SecurityIdentifier(sid));ReadOnlyTree(input,new SecurityIdentifier(sid));ReadOnlyTree(runtime,new SecurityIdentifier(sid));
            if(files!=null)files.Freeze();
            if(singleFiles!=null)singleFiles.Freeze();
            Record("input_frozen",new {node_sha256=Hash(node),input_sha256=Hash(Path.Combine(input,scriptName)),script=Path.Combine(input,scriptName)});
            job=CreateJobObjectW(IntPtr.Zero,null);Check(job!=IntPtr.Zero,"CreateJobObject");
            if(resourceProbe)notifications=new LpacJobNotifications(job,Record);
            var limits=new ExtendedLimit();limits.Basic.LimitFlags=KillOnClose|ActiveLimit|JobMemory;limits.Basic.ActiveProcessLimit=processLimit;limits.JobMemoryLimit=new UIntPtr(memoryLimit);
            Check(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(ExtendedLimit))),"SetJobLimits");
            ExtendedLimit actualLimits;Check(QueryJobLimits(job,9,out actualLimits,(uint)Marshal.SizeOf(typeof(ExtendedLimit)),IntPtr.Zero),"QueryJobLimits");
            if(actualLimits.Basic.LimitFlags!=limits.Basic.LimitFlags || actualLimits.Basic.ActiveProcessLimit!=processLimit || actualLimits.JobMemoryLimit.ToUInt64()!=memoryLimit)throw new InvalidOperationException("JOB_LIMIT_MISMATCH");
            Record("job_limits",new {flags=actualLimits.Basic.LimitFlags,processes=actualLimits.Basic.ActiveProcessLimit,memory=actualLimits.JobMemoryLimit.ToUInt64(),breakaway=false});
            var sa=new SecurityAttributes();sa.Length=Marshal.SizeOf(typeof(SecurityAttributes));sa.Inherit=1;
            IntPtr outRead,outWrite,errRead,errWrite;
            Check(CreatePipe(out outRead,out outWrite,ref sa,0),"stdout pipe");handles.Add(outRead);handles.Add(outWrite);
            Check(SetHandleInformation(outRead,1,0),"stdout no inherit");
            Check(CreatePipe(out errRead,out errWrite,ref sa,0),"stderr pipe");handles.Add(errRead);handles.Add(errWrite);
            Check(SetHandleInformation(errRead,1,0),"stderr no inherit");
            IntPtr stdin=CreateFileW("NUL",0x80000000,3,ref sa,3,0,IntPtr.Zero);Check(stdin!=new IntPtr(-1),"stdin NUL");handles.Add(stdin);
            int attributeCount=singleProcess?4:3;UIntPtr attrBytes=UIntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,attributeCount,0,ref attrBytes);
            attributes=Marshal.AllocHGlobal(checked((int)attrBytes.ToUInt64()));Check(InitializeProcThreadAttributeList(attributes,attributeCount,0,ref attrBytes),"InitializeAttributes");
            if(singleProcess){var childPolicy=Marshal.AllocHGlobal(4);allocations.Add(childPolicy);Marshal.WriteInt32(childPolicy,1);Attribute(attributes,0x2000E,childPolicy,4);Record("child_creation_policy_requested",new{flags=1,process_budget=1,detached_console=true});}
            var caps=new SecurityCapabilities();caps.AppContainerSid=sid;
            if(capability!=null){caps.Capabilities=capability.Attributes;caps.CapabilityCount=1;}
            Attribute(attributes,0x20009,AllocStructure(caps,allocations),Marshal.SizeOf(typeof(SecurityCapabilities)));
            var policy=Marshal.AllocHGlobal(4);allocations.Add(policy);Marshal.WriteInt32(policy,1);Attribute(attributes,0x2000F,policy,4);
            var inheritList=Marshal.AllocHGlobal(IntPtr.Size*3);allocations.Add(inheritList);
            Marshal.WriteIntPtr(inheritList,0,stdin);Marshal.WriteIntPtr(inheritList,IntPtr.Size,outWrite);Marshal.WriteIntPtr(inheritList,IntPtr.Size*2,errWrite);
            Attribute(attributes,0x20002,inheritList,IntPtr.Size*3);
            var si=new StartupInfoEx();si.Startup.Size=Marshal.SizeOf(typeof(StartupInfoEx));si.Startup.Flags=singleProcess?0x101u:0x100u;si.Startup.Show=0;si.Startup.StdInput=stdin;si.Startup.StdOutput=outWrite;si.Startup.StdError=errWrite;si.Attributes=attributes;
            string systemRoot=Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            string env="APPDATA="+profile+"\0LOCALAPPDATA="+profile+"\0SystemRoot="+systemRoot+"\0TEMP="+Path.Combine(profile,"Temp")+"\0TMP="+Path.Combine(profile,"Temp")+"\0USERPROFILE="+profile+"\0WINDIR="+systemRoot+"\0\0";
            environment=Marshal.StringToHGlobalUni(env);
            string inlineSource=inlineProbe?File.ReadAllText(Path.Combine(input,scriptName),new UTF8Encoding(false)):null;
            string command=Quote(node)+(singleInline||singleBoundaryNode?" --no-addons --preserve-symlinks --preserve-symlinks-main -e "+Quote(inlineSource):nodeFileProbe?(singleProcess?" --no-addons":"")+" --preserve-symlinks --preserve-symlinks-main --test-reporter=tap"+(nodeTestRunner?" --test --test-isolation=none":"")+" "+Quote(nodeTestRunner?scriptName:Path.Combine(input,scriptName)):inlineProbe?" -e "+Quote(inlineSource):" "+Quote(Path.Combine(input,scriptName)));
            if(singleProcessNative)command=Quote(application);
            if(nodeFileProbe)Record("node_file_probe_frozen",new{test_runner=nodeTestRunner,typescript=nodeTypeScript,esm=nodeEsm,inline=singleInline,module_sha256=Hash(Path.Combine(input,moduleName)),script_sha256=Hash(Path.Combine(input,scriptName)),package_sha256=nodeTypeScript||nodeEsm?Hash(Path.Combine(input,"package.json")):null,original_unflagged_command_passed=false});
            Record("execution_identity",new{kind=singleProcessNative?"native_single_process_attack":singleInline?"node_inline_single_process":singleProcess?"node_file_single_process":nodeFileProbe?"node_file_fixed_flags":resourceProbe?"node_inline_frozen_resource_"+resourceKind:fileProbe?"node_inline_frozen_file_descendants":inheritTransport?"node_inline_frozen_inherited_stdio_probe":inlineProbe?"node_inline_frozen":"node_script_file",source_sha256=Hash(Path.Combine(input,scriptName)),actual_command_line=command,original_file_entry_passed=false,original_default_pipe_command_passed=false});
            uint creationFlags=singleProcess?0x0008040cu:0x08080404u;
            Record("create_suspended_requested",new {executable=application,command_line=command,cwd=input,environment_keys=new[]{"APPDATA","LOCALAPPDATA","SystemRoot","TEMP","TMP","USERPROFILE","WINDIR"},creation_flags=creationFlags});
            // Negative control is ordinary AppContainer but NEVER resumed. Same executable,
            // SID/capabilities/handles/Job; only the opt-out policy differs.
            Marshal.WriteInt32(policy,0);
            var control=new ProcessInformation();
            try {
                Check(CreateProcessW(application,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,true,creationFlags,environment,input,ref si,out control),"Create ordinary AppContainer suspended control");
                Record("control_created_suspended",new{pid=control.ProcessId});
                Check(AssignProcessToJobObject(job,control.Process),"Assign control Job");VerifyToken(control.Process,sidText,false,capability==null?null:capability.Sid);
                if(singleProcess)LpacSingleProcessProbe.RequirePolicy(control.Process,Record);
            } finally {
                if(control.Process!=IntPtr.Zero) {Check(TerminateProcess(control.Process,125),"Terminate control");Check(WaitForSingleObject(control.Process,5000)==0,"Wait control termination");CloseHandle(control.Process);CloseHandle(control.Thread);Record("control_terminated_never_resumed",new{pid=control.ProcessId});}
            }
            Marshal.WriteInt32(policy,1);
            uint actualFlags=creationFlags|(traceMode?2u:0u);
            Record("actual_creation_flags",new{flags=actualFlags,diagnostic_debugger=traceMode});
            Check(CreateProcessW(application,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,true,actualFlags,environment,input,ref si,out pi),"CreateProcessW LPAC suspended");started=true;
            if(traceMode){observationHandle=LpacReadTrace.DuplicateOwnedHandle(pi.Process);handles.Add(observationHandle);}
            Record("process_created_suspended",new {pid=pi.ProcessId,thread_id=pi.ThreadId});
            Check(AssignProcessToJobObject(job,pi.Process),"AssignProcessToJobObject");
            bool inJob;Check(IsProcessInJob(pi.Process,job,out inJob),"IsProcessInJob");if(!inJob)throw new InvalidOperationException("JOB_ASSOCIATION_MISSING");
            VerifyToken(pi.Process,sidText,true,capability==null?null:capability.Sid);Record("pre_resume_checks",new {job_association=true,actual_token_checked=true,acl_readback=true,ordinary_appcontainer_control_verified=true});
            if(singleProcess)LpacSingleProcessProbe.RequirePolicy(pi.Process,Record);
            verifiedPids.Add(pi.ProcessId);
            // Broker closes its copies of child pipe endpoints before reading.
            foreach(var h in new[]{outWrite,errWrite,stdin}) {CloseHandle(h);handles.Remove(h);}
            stdout.Start(outRead,job);handles.Remove(outRead);stderr.Start(errRead,job);handles.Remove(errRead);
            if(parentLifetime!=null)parentLifetime.RequireAlive();
            Check(ResumeThread(pi.Thread)!=UInt32.MaxValue,"ResumeThread");resumed=true;Record("process_resumed",new {pid=pi.ProcessId});
            if(traceMode){uint traceExit=LpacReadTrace.Run(observationHandle,job,pi.ProcessId,Record,delegate{return timer.ElapsedMilliseconds;},pipeTrace);Record("diagnostic_trace_complete",new{exit_code=traceExit,isolation_acceptance="INCOMPLETE"});}
            for(;;) {
                if(notifications!=null)notifications.Drain();
                if(parentLifetime!=null&&!parentLost&&parentLifetime.Ended){parentLost=true;Record("parent_lifetime_ended",new{termination_code=140,observed_utc=DateTime.UtcNow.ToString("o"),observation_period_ms=20});Check(TerminateJobObject(job,140),"Terminate Job after daemon parent death");}
                if((fileProbe||resourceProbe||nodeFileProbe||singleProcess)&&!parentLost){int active=ObserveOwnedDescendants(job,sidText,capability.Sid,verifiedPids);if(active>peakActive){peakActive=active;Record("job_peak_active_observed",new{active=active});}if(active>processLimit&&!processBudgetExceeded){processBudgetExceeded=true;Record("process_budget_exceeded",new{observed_live=active,configured_limit=processLimit,termination_code=139,observation_period_ms=20,all_members_counted=true});Check(TerminateJobObject(job,139),"Terminate Job observed process budget exceeded");}}
                var count=Accounting(job);
                if(count.ActiveProcesses==0) {allEnded=true;Record("job_empty",new {active=count.ActiveProcesses,total=count.TotalProcesses,terminated=count.TotalTerminatedProcesses});break;}
                if(resourceKind=="parent-exit"&&!parentExited){uint parentCode;Check(GetExitCodeProcess(pi.Process,out parentCode),"Observe primary exit while descendants live");if(parentCode!=259){parentExited=true;Record("parent_exit_with_live_descendants",new{application_exit_code=parentCode,active=count.ActiveProcesses});}}
                if((resourceKind=="crash"||resourceKind=="daemon-crash")&&!crashReady){var bytes=stdout.Snapshot();if(LpacResourceProbe.ReadyNodeCount(bytes,resourceKind,verifiedPids)==3){string witness=Path.Combine(root,"crash-stdout-witness.bin");using(var file=new FileStream(witness,FileMode.CreateNew,FileAccess.Write))file.Write(bytes,0,bytes.Length);Record("crash_tree_ready",new{ready_node_roles=3,witness=witness,witness_sha256=Hash(witness),independently_verified_pids=verifiedPids.ToArray(),active_at_observation=count.ActiveProcesses});crashReady=true;}}
                if(resourceKind=="cancel"&&!cancelled&&timer.ElapsedMilliseconds>=3000&&LpacResourceProbe.ReadyNodeCount(stdout.Snapshot(),resourceKind,verifiedPids)==3){cancelled=true;Check(TerminateJobObject(job,130),"Terminate Job explicit synthetic cancel");Record("owner_cancel",new{elapsed_ms=timer.ElapsedMilliseconds,termination_code=130,ready_node_roles=3});}
                if(timer.ElapsedMilliseconds>wallMs&&!timedOut) {timedOut=true;Record("wall_timeout",new {elapsed_ms=timer.ElapsedMilliseconds});Check(TerminateJobObject(job,124),"TerminateJob timeout");}
                if(timer.ElapsedMilliseconds>wallMs+10000)throw new InvalidOperationException("JOB_TERMINATION_UNPROVED");
                Thread.Sleep(20);
            }
            uint code;Check(GetExitCodeProcess(traceMode?observationHandle:pi.Process,out code),"GetExitCodeProcess");exit=code;
            if(!stdout.Thread.Join(5000)||!stderr.Thread.Join(5000))throw new InvalidOperationException("OUTPUT_NOT_COMPLETE");
            if(notifications!=null){notifications.Drain();ExtendedLimit finalLimits;Check(QueryJobLimits(job,9,out finalLimits,(uint)Marshal.SizeOf(typeof(ExtendedLimit)),IntPtr.Zero),"Query final Job limits and peaks");Record("job_limits_after",new{process_limit=finalLimits.Basic.ActiveProcessLimit,memory_limit=finalLimits.JobMemoryLimit.ToUInt64(),peak_job_commit=finalLimits.PeakJobMemory.ToUInt64(),peak_process_commit=finalLimits.PeakProcessMemory.ToUInt64()});LpacResourceProbe.Outcome(resourceKind,code,allEnded,timedOut,cancelled,parentExited,processBudgetExceeded,processLimit,verifiedPids,peakActive,stdout.Overflow,stderr.Overflow,stdout.Error,stderr.Error,stdout.Bytes.ToArray(),notifications.Messages,Record);throw new InvalidOperationException("SYNTHETIC_RESOURCE_REJECTION_NOT_A_PASSED_EXECUTION");}
            if(stdout.Overflow||stderr.Overflow||stdout.Error!=null||stderr.Error!=null)throw new InvalidOperationException("OUTPUT_INCOMPLETE");
            if(timedOut){Record("experiment_outcome",new{result="INCONCLUSIVE_WALL_LIMIT",application_exit_code=code,canary_checks_completed=false});throw new TimeoutException("SYNTHETIC_WALL_LIMIT");}
            string output=Encoding.UTF8.GetString(stdout.Bytes.ToArray());
            if(pipeTrace)throw new InvalidOperationException("PIPE_DIAGNOSTIC_NOT_AN_ACCEPTANCE_RUN");
            if(singleProcessNative){if(!LpacSingleProcessProbe.Validate(stdout.Bytes.ToArray(),stderr.Bytes.ToArray(),code,pi.ProcessId,(uint)Process.GetCurrentProcess().Id))throw new InvalidOperationException("SINGLE_PROCESS_NATIVE_BOUNDARY_NOT_PROVED");}
            else if(singleBoundaryNode){if(!singleFiles.Validate(stdout.Bytes.ToArray(),stderr.Bytes.ToArray(),code,pi.ProcessId))throw new InvalidOperationException("SINGLE_PROCESS_FILES_NOT_PROVED");}
            else if(nodeFileProbe){if(!(singleInline?code==0&&stderr.Bytes.Length==0&&output=="SFINLINE_IMPORT_PASSED\n":LpacNodeFileProbe.Validate(stdout.Bytes.ToArray(),stderr.Bytes.ToArray(),code))||Hash(Path.Combine(input,moduleName))!=HashText(probeModule)||Hash(Path.Combine(input,scriptName))!=HashText(probeScript)||(nodeTypeScript||nodeEsm)&&Hash(Path.Combine(input,"package.json"))!=HashText("{\"type\":\"module\"}\n"))throw new InvalidOperationException("FIXED_NODE_FILE_TEST_NOT_PROVED");Record("node_file_probe_validated",new{test_runner=nodeTestRunner,typescript=nodeTypeScript,actual_exit_code=code,input_bytes_unchanged=true});}
            else if(fileProbe){if(!files.Validate(stdout.Bytes.ToArray(),stderr.Bytes.ToArray(),code,verifiedPids))throw new InvalidOperationException("FILE_DESCENDANT_BOUNDARY_NOT_PROVED");}
            else if(canaryProbe){if(!(inheritTransport?canary.ValidateInherited(stdout.Bytes.ToArray(),stderr.Bytes.ToArray(),code):canary.Validate(output,code)))throw new InvalidOperationException("REGISTRY_CANARY_NOT_SAFE_OR_UNPROVED");}
            else if(exit!=0||output!="SPECFORGE_SYNTHETIC_P01\n")throw new InvalidOperationException("POSITIVE_ASSERTION_NOT_MET");
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
            if(notifications!=null)notifications.Dispose();
            if(parentLifetime!=null)parentLifetime.Dispose();
            if(attributes!=IntPtr.Zero){DeleteProcThreadAttributeList(attributes);Marshal.FreeHGlobal(attributes);}
            foreach(var p in allocations)Marshal.FreeHGlobal(p);if(environment!=IntPtr.Zero)Marshal.FreeHGlobal(environment);
            if(inputIdentityBefore!=null&&(!started||allEnded))try{var after=LpacInputIdentity.ValidateTree(Path.Combine(root,"input")).Concat(LpacInputIdentity.ValidateTree(Path.Combine(root,"runtime"))).ToArray();bool same=LpacInputIdentity.Same(inputIdentityBefore,after);Record("single_input_identity_after",new{unchanged=same,files=after});if(!same)result=1;}catch(Exception cleanup){Record("single_input_identity_reconcile_failed",new{type=cleanup.GetType().FullName,message=cleanup.Message});result=1;}
            if(singleFiles!=null&&(!started||allEnded))try{if(!singleFiles.Reconcile())throw new InvalidOperationException("SINGLE_ALIAS_CHANGED_OR_UNPROVED");}catch(Exception cleanup){Record("single_alias_reconcile_failed",new{type=cleanup.GetType().FullName,message=cleanup.Message});result=1;}
            if(files!=null&&(!started||allEnded))try{if(!files.Reconcile())throw new InvalidOperationException("FILE_FIXTURE_CHANGED_OR_UNPROVED");}catch(Exception cleanup){Record("file_fixture_reconcile_failed",new{type=cleanup.GetType().FullName,message=cleanup.Message});result=1;}
            if(profileCreated&&(!started||allEnded)) {int hr=DeleteAppContainerProfile(moniker);Record("profile_cleanup",new{moniker=moniker,hresult=hr,profile_path_exists=profile!=null&&Directory.Exists(profile)});if(hr!=0)result=1;}
            if(sid!=IntPtr.Zero)FreeSid(sid);
            if(capability!=null)capability.Dispose();
            if(canary!=null&&(!started||allEnded))try{canary.ReconcileAndCleanup();}catch(Exception cleanup){Record("canary_cleanup_failed",new{type=cleanup.GetType().FullName,message=cleanup.Message});result=1;}
            File.WriteAllBytes(Path.Combine(root,"stdout.bin"),stdout.Bytes.ToArray());File.WriteAllBytes(Path.Combine(root,"stderr.bin"),stderr.Bytes.ToArray());
            var receipt=new {schema="synthetic-lpac-startup/1",started_utc=startedUtc,finished_utc=DateTime.UtcNow.ToString("o"),duration_ms=timer.ElapsedMilliseconds,root=root,moniker=moniker,sid=sidText,profile=profile,process_started=started,process_resumed=resumed,application_exit_code=exit,job_all_ended=allEnded,timed_out=timedOut,scope=singleProcess?"D22 single-process synthetic evidence only; full new matrix and product adoption not accepted":resourceProbe?"Synthetic resource expected rejection only; never a passed execution":fileProbe?"P01 inline node:test parent child grandchild and direct-path files only; remaining matrix NOT_ACCEPTED":pipeTrace?"Bounded pipe diagnosis only; not canary acceptance":canaryProbe?"D21 registry canary only; remaining isolation checks NOT_EXECUTED":registryExperiment?"D21 synthetic startup experiment only; not product acceptance":traceMode?"Diagnostic observation only; not isolation acceptance":"P01 startup only; other matrix rows NOT_EXECUTED",debug_observer=traceMode,execution_kind=singleProcessNative?"native_single_process_attack":singleInline?"node_inline_single_process":singleProcess?"node_file_single_process":nodeFileProbe?"node_file_fixed_flags":resourceProbe?"node_inline_frozen_resource_"+resourceKind:fileProbe?"node_inline_frozen_file_descendants":inheritTransport?"node_inline_frozen_inherited_stdio_probe":inlineProbe?"node_inline_frozen":"node_script_file",capability_sid=capability==null?null:capability.Sid,profile_id=profileId,startup_result=result==0?(singleProcess?"D22_SINGLE_PROCESS_FINITE_PROBE_OBSERVED":fileProbe?"INLINE_NODE_TEST_AND_DIRECT_FILE_DESCENDANTS_OBSERVED":canaryProbe?"SINGLE_CANARY_READ_DENIAL_OBSERVED":"P01_STARTUP_OBSERVED"):"FAILED",isolation_acceptance="INCOMPLETE",error=error,inner_exit_code=result};
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
    [DllImport("kernel32.dll",EntryPoint="QueryInformationJobObject",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] static extern bool QueryJobProcessIds(IntPtr job,int kind,IntPtr info,uint size,out uint returned);
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,[MarshalAs(UnmanagedType.Bool)]bool inherit,uint pid);
    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)][return:MarshalAs(UnmanagedType.Bool)]static extern bool QueryFullProcessImageNameW(IntPtr process,uint flags,StringBuilder name,ref uint chars);
    [DllImport("kernel32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool GetProcessTimes(IntPtr process,out long created,out long ended,out long kernel,out long user);
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
