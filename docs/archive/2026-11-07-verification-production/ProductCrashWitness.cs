// Ordinary-user synthetic crash witness. Holds stable process handles, never a Job handle.
using System;using System.IO;using System.Text;using System.Linq;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Security.Principal;using System.Security.Cryptography;using System.Web.Script.Serialization;
internal static class ProductCrashWitness {
 static JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=16*1024*1024};
 static void Need(bool ok,string code){if(!ok)throw new InvalidOperationException(code);}
 static string Hash(string file){using(var h=SHA256.Create())using(var s=File.OpenRead(file))return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
 static Dictionary<string,object> Read(string file){NoLinks(file);return Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));}
 static void NoLinks(string file){for(string p=Path.GetFullPath(file);p!=null;p=Path.GetDirectoryName(p))if(Directory.Exists(p)||File.Exists(p))Need((File.GetAttributes(p)&FileAttributes.ReparsePoint)==0,"LINK_FORBIDDEN");}
 static Dictionary<string,object> Data(Dictionary<string,object> e){return (Dictionary<string,object>)e["data"];}
 static string Image(IntPtr handle){var b=new StringBuilder(32768);uint n=(uint)b.Capacity;Need(QueryFullProcessImageNameW(handle,0,b,ref n),"IMAGE_QUERY");return b.ToString();}
 static long Created(IntPtr handle){long c,e,k,u;Need(GetProcessTimes(handle,out c,out e,out k,out u),"PROCESS_TIMES");return c;}
 static IntPtr Stable(uint pid,long birth,string image,bool terminate){IntPtr handle=OpenProcess(terminate?0x101001U:0x101000U,false,pid);Need(handle!=IntPtr.Zero,"OPEN_PROCESS:"+Marshal.GetLastWin32Error());try{Need(Created(handle)==birth&&String.Equals(Image(handle),image,StringComparison.OrdinalIgnoreCase)&&WaitForSingleObject(handle,0)==258,"PROCESS_IDENTITY");return handle;}catch{CloseHandle(handle);throw;}}
 static uint Exit(IntPtr handle,uint timeout){Need(WaitForSingleObject(handle,timeout)==0,"PROCESS_SURVIVED");uint code;Need(GetExitCodeProcess(handle,out code),"EXIT_QUERY");return code;}
 internal static int Main(string[] args){IntPtr broker=IntPtr.Zero,app=IntPtr.Zero,daemon=IntPtr.Zero;
  try{
   Need(args.Length==3&&(args[2]=="broker"||args[2]=="daemon"),"ARGS");Guid fixtureId,attemptId;
   string fixture=Path.GetFullPath(args[0]),nonce=args[1],workspace=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"..",".."));
   Need(Guid.TryParseExact(Path.GetFileName(fixture),"N",out fixtureId)&&Guid.TryParseExact(nonce,"N",out attemptId)&&String.Equals(Path.GetDirectoryName(fixture),Path.Combine(workspace,".tmp","verification-public-kernel"),StringComparison.OrdinalIgnoreCase),"SCOPE");
   Need(!new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator),"UNELEVATED_REQUIRED");NoLinks(fixture);
   var reservation=Read(Path.Combine(fixture,"reservation.json"));Need((string)reservation["root"]==fixture&&(string)reservation["kind"]=="D23_SELF_OWNED_PUBLIC_KERNEL_FIXTURE","RESERVATION");
   string bin=Path.Combine(fixture,"config","sf-user","bin"),owner=Path.Combine(fixture,"config","sf-user","runtime","verification-owner"),root=Path.Combine(owner,"runs",nonce),eventsFile=Path.Combine(root,"events.jsonl");
   var plan=Read(Path.Combine(owner,"native-plans",nonce+".json"));Need((string)plan["attempt_id"]==nonce&&(string)plan["attempt_root"]==root,"PLAN");
   var events=File.ReadAllLines(eventsFile).Where(l=>l.Length!=0).Select(l=>Json.Deserialize<Dictionary<string,object>>(l)).ToArray();
   var b=Data(events.Single(e=>(string)e["name"]=="broker_identity"));var a=Data(events.Single(e=>(string)e["name"]=="process_created_suspended"));var d=Data(events.Single(e=>(string)e["name"]=="parent_lifetime_bound"));
   Need(events.Any(e=>(string)e["name"]=="process_resumed"),"RESUME_REQUIRED");
   string brokerImage=Path.Combine(bin,"verification","specforge-verify.exe"),daemonImage=Path.Combine(bin,"specforged.exe"),appImage=Path.Combine(root,"runtime","node.exe");
   var identities=(Dictionary<string,object>)reservation["build_identities"];
   Need(Hash(brokerImage)==(string)identities["sf-user/bin/verification/specforge-verify.exe"]&&Hash(daemonImage)==(string)identities["sf-user/bin/specforged.exe"]&&Hash(appImage)=="3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237","ASSET_HASH");
   broker=Stable(Convert.ToUInt32(b["pid"]),Convert.ToInt64(b["created_filetime"]),brokerImage,args[2]=="broker");
   app=Stable(Convert.ToUInt32(a["pid"]),Convert.ToInt64(a["created_filetime"]),appImage,false);
   daemon=Stable(Convert.ToUInt32(d["parent_pid"]),Convert.ToInt64(d["parent_created_filetime"]),daemonImage,args[2]=="daemon");
   string witness=Path.Combine(fixture,"crash-"+args[2]+"-"+nonce+".json");Need(!File.Exists(witness),"WITNESS_COLLISION");
   Need(TerminateProcess(args[2]=="broker"?broker:daemon,args[2]=="broker"?198U:199U),"TERMINATE_FAILED");
   uint targetExit=Exit(args[2]=="broker"?broker:daemon,5000),brokerExit=Exit(broker,10000),appExit=Exit(app,5000);
   Need(targetExit==(args[2]=="broker"?198U:199U),"TARGET_EXIT");if(args[2]=="broker")Need(WaitForSingleObject(daemon,0)==258,"UNRELATED_DAEMON_STOPPED");
   var result=new{utc=DateTime.UtcNow.ToString("o"),fixture=fixture,attempt_id=nonce,target=args[2],target_exit=targetExit,broker_exit=brokerExit,application_exit=appExit,stable_handles_ended=true,job_handle_duplicated=false,events_sha256=Hash(eventsFile),application_passed=false};
   using(var stream=new FileStream(witness,FileMode.CreateNew,FileAccess.Write))using(var writer=new StreamWriter(stream,new UTF8Encoding(false)))writer.Write(Json.Serialize(result)+"\n");Console.WriteLine(Json.Serialize(result));return 0;
  }catch(Exception e){Console.Error.WriteLine(Json.Serialize(new{utc=DateTime.UtcNow.ToString("o"),error=e.Message,application_passed=false}));return 1;}
  finally{foreach(var h in new[]{broker,app,daemon})if(h!=IntPtr.Zero)CloseHandle(h);}
 }
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(IntPtr process,out long c,out long e,out long k,out long u);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool QueryFullProcessImageNameW(IntPtr process,uint flags,StringBuilder image,ref uint size);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool TerminateProcess(IntPtr process,uint exit);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint WaitForSingleObject(IntPtr process,uint milliseconds);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
}
