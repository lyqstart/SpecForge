// Finite synthetic resource/termination tests, not a production test executor.
using System;using System.Text;using System.Collections.Generic;using System.Linq;
using System.Web.Script.Serialization;
internal static class LpacResourceProbe {
    internal static string Kind(string mode){switch(mode){case "--synthetic-resource-wall":return "wall";case "--synthetic-resource-cancel":return "cancel";case "--synthetic-resource-parent-exit":return "parent-exit";case "--synthetic-resource-output":return "output";case "--synthetic-resource-memory":return "memory";case "--synthetic-resource-process":return "process";default:return null;}}
    internal static string Script(string kind){
        string header="'use strict';const assert=require('node:assert/strict');assert.equal(2+2,4);const role=process.argv[1]||'0';console.log('SFRESOURCE_READY:'+JSON.stringify({kind:'"+kind+"',pid:process.pid,role}));\n";
        if(kind=="output")return header+"const fs=require('node:fs'),b=Buffer.alloc(65536,0x58);for(;;)fs.writeSync(1,b);\n";
        if(kind=="memory")return header+"const blocks=[];for(;;)blocks.push(Buffer.alloc(16*1024*1024,0xa5));\n";
        if(kind=="process")return header+"if(role==='0'){const cp=require('node:child_process');for(let i=0;i<20;i++){const c=cp.spawn(process.execPath,['-e',process.execArgv[1],'idle'],{stdio:'inherit',windowsHide:true});c.on('error',e=>console.log('SFRESOURCE_SPAWN_ERROR:'+JSON.stringify({code:e.code})));}}setInterval(()=>{},1000);\n";
        return header+"const n=Number(role);if(n<2){const c=require('node:child_process').spawn(process.execPath,['-e',process.execArgv[1],String(n+1)],{stdio:'inherit',windowsHide:true});c.on('error',e=>{console.error('SFRESOURCE_SPAWN_ERROR:'+e.code);process.exitCode=42;});}setInterval(()=>{},1000);\n"+(kind=="parent-exit"?"if(n===0)setTimeout(()=>{console.log('SFRESOURCE_PARENT_EXIT');process.exit(0);},2000);\n":"");
    }
    internal static int ReadyNodeCount(byte[] bytes,string kind,HashSet<uint> verified){
        const string prefix="SFRESOURCE_READY:";var roles=new Dictionary<int,uint>();var lines=Encoding.UTF8.GetString(bytes).Split('\n');
        for(int i=0;i<lines.Length-1;i++){string line=lines[i];if(!line.StartsWith(prefix,StringComparison.Ordinal))continue;try{var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(line.Substring(prefix.Length).TrimEnd('\r'));int role;if(data==null||!data.ContainsKey("kind")||(string)data["kind"]!=kind||!data.ContainsKey("role")||!Int32.TryParse(Convert.ToString(data["role"]),out role)||role<0||role>2||!data.ContainsKey("pid"))continue;uint pid=Convert.ToUInt32(data["pid"]);if(!verified.Contains(pid))continue;if(roles.ContainsKey(role)&&roles[role]!=pid)return 0;roles[role]=pid;}catch(ArgumentException){}catch(InvalidOperationException){}catch(InvalidCastException){}catch(FormatException){}catch(OverflowException){}}
        return roles.Values.Distinct().Count();
    }
    internal static void Outcome(string kind,uint exit,bool ended,bool timedOut,bool cancelled,bool parentExited,HashSet<uint> verified,int peak,bool stdoutOverflow,bool stderrOverflow,string stdoutError,string stderrError,byte[] stdout,IEnumerable<uint> notifications,Action<string,object> record){
        string text=Encoding.UTF8.GetString(stdout);int readyNodes=ReadyNodeCount(stdout,kind,verified);bool ready=readyNodes>=1,proved=false;var messages=notifications.ToArray();
        switch(kind){case "wall":proved=readyNodes==3&&timedOut&&exit==124;break;case "cancel":proved=readyNodes==3&&cancelled&&!timedOut&&exit==130;break;case "parent-exit":proved=readyNodes==3&&parentExited&&timedOut&&exit==0;break;case "output":proved=ready&&(stdoutOverflow||stderrOverflow)&&exit==137;break;case "memory":proved=ready&&messages.Contains(10u)&&exit!=0;break;case "process":proved=ready&&messages.Contains(3u)&&peak==8&&verified.Count>=8&&text.Contains("SFRESOURCE_SPAWN_ERROR:");break;}
        proved&=ended&&(kind=="output"||(!stdoutOverflow&&!stderrOverflow))&&stdoutError==null&&stderrError==null;
        record("synthetic_resource_outcome",new{kind=kind,expected_rejection_proved=proved,application_passed=false,application_exit_code=exit,job_all_ended=ended,timed_out=timedOut,owner_cancelled=cancelled,parent_exit_with_live_descendants=parentExited,independently_verified_processes=verified.Count,ready_node_roles_independently_bound=readyNodes,peak_active_processes=peak,stdout_overflow=stdoutOverflow,stderr_overflow=stderrOverflow,job_messages=messages,scope="Synthetic expected rejection only; not a passed production execution or full isolation acceptance"});
    }
}
