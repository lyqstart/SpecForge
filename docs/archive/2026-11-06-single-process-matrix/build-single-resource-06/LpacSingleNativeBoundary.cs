// Fixed native calls executed in the primary LPAC process, never a child.
using System;using System.IO;using System.Text;using System.Linq;using System.Collections;using System.Collections.Generic;using System.Diagnostics;using System.Runtime.InteropServices;using System.Security.Principal;using System.Web.Script.Serialization;
internal static class LpacSingleNativeBoundary {
    internal static int Main(string[] args){
        if(args.Length!=0)return 64;string input=Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location),nonce=Path.GetFileName(Path.GetDirectoryName(input));Guid id;if(!Guid.TryParseExact(nonce,"N",out id))return 65;
        int process=LpacSingleProcessProbe.Main(new string[0]);int storage=LpacPrivateRegistryChild.Main(new[]{nonce});int unc=LpacUncProbe.Run(nonce,0,false);
        int system=Open(new IntPtr(unchecked((int)0x80000002)),@"System\CurrentControlSet\Services\WinSock2\Parameters",0x20019);
        string hostKey=WindowsIdentity.GetCurrent().User.Value+@"\Software\SpecForgeIsolationCanary-"+nonce;int read=Open(new IntPtr(unchecked((int)0x80000003)),hostKey,1),write=Open(new IntPtr(unchecked((int)0x80000003)),hostKey,2);
        Console.WriteLine("SFSINGLE_REGISTRY:"+new LpacProbeJson().Serialize(new{pid=Process.GetCurrentProcess().Id,system_read_error=system,host_fake_read_error=read,host_fake_write_error=write}));
        bool connected=false;int hr=0;string stage="co_initialize";try{using(var com=new LpacNativeWmiCom()){connected=com.Connected;stage=com.Stage;}}catch(Exception e){hr=e.HResult;if(e.Data.Contains("native_com_stage"))stage=Convert.ToString(e.Data["native_com_stage"]);}
        bool denied=!connected&&(hr==unchecked((int)0x80070005)||hr==unchecked((int)0x80041003));Console.WriteLine("SFSINGLE_COM:"+new LpacProbeJson().Serialize(new{pid=Process.GetCurrentProcess().Id,connected=connected,hresult=hr,stage=stage,creation_method_reached=false}));
        return process==0&&storage==0&&unc==0&&system==0&&read==5&&write==5&&denied?0:45;
    }
    static int Open(IntPtr root,string path,uint access){IntPtr key;int status=RegOpenKeyExW(root,path,0,access,out key);if(status==0)RegCloseKey(key);return status;}
    internal static bool Validate(byte[] stdout,byte[] stderr,uint exit,uint pid,uint parent,Action<string,object> record){
        string text=Encoding.UTF8.GetString(stdout);var lines=text.TrimEnd('\r','\n').Split('\n').Select(l=>l.TrimEnd('\r')).ToArray();bool valid=exit==0&&stderr.Length==0&&lines.Length==7;
        if(!valid){record("single_native_boundary_result",new{accepted=false,application_exit_code=exit,line_count=lines.Length});return false;}
        valid&=LpacSingleProcessProbe.Validate(Encoding.UTF8.GetBytes(lines[0]+"\n"+lines[1]+"\n"),stderr,exit,pid,parent);
        var json=new JavaScriptSerializer();var reports=new List<object>();string[] prefixes={"SFPREG_REPORT:","SFFACL_REPORT:","SFUNC_NATIVE:","SFSINGLE_REGISTRY:","SFSINGLE_COM:"};
        for(int i=0;i<prefixes.Length;i++){
            if(!lines[i+2].StartsWith(prefixes[i],StringComparison.Ordinal))return false;var d=json.Deserialize<Dictionary<string,object>>(lines[i+2].Substring(prefixes[i].Length));valid&=Convert.ToUInt32(d["pid"])==pid;reports.Add(d);
            if(i==0){valid&=(string)d["probe"]=="D21_PRIVATE_REGISTRY_NATIVE_V2"&&Convert.ToInt32(d["read_hresult"])==0&&Convert.ToInt32(d["absent_value_query"])==2&&Convert.ToBoolean(d["write_denied"]);int w=Convert.ToInt32(d["write_hresult"]),dac=Convert.ToInt32(d["write_dac_hresult"]);valid&=(w==unchecked((int)0x80070005)||w==0&&Convert.ToInt32(d["set_value_status"])==5)&&(dac==unchecked((int)0x80070005)||dac==0&&Convert.ToInt32(d["set_dac_status"])==5);}
            if(i==1){var rows=((IEnumerable)d["rows"]).Cast<Dictionary<string,object>>().ToArray();valid&=(string)d["probe"]=="D21_FILE_ACL_NATIVE_V2"&&Convert.ToBoolean(d["denied"])&&rows.Length==6&&rows.Select(r=>Convert.ToInt32(r["index"])).OrderBy(n=>n).SequenceEqual(Enumerable.Range(0,6))&&rows.All(r=>Convert.ToInt32(r["open_write_dac_error"])==5||Convert.ToInt32(r["open_write_dac_error"])==0&&Convert.ToInt32(r["set_dacl_error"])==5);}
            if(i==2)valid&=LpacUncProbe.ValidateReports(lines[i+2]+"\n",new HashSet<uint>(new[]{pid}),1);
            if(i==3)valid&=Convert.ToInt32(d["system_read_error"])==0&&Convert.ToInt32(d["host_fake_read_error"])==5&&Convert.ToInt32(d["host_fake_write_error"])==5;
            if(i==4){int hr=Convert.ToInt32(d["hresult"]);valid&=!Convert.ToBoolean(d["connected"])&&!Convert.ToBoolean(d["creation_method_reached"])&&(hr==unchecked((int)0x80070005)||hr==unchecked((int)0x80041003));}
        }
        record("single_native_boundary_result",new{accepted=valid,pid=pid,direct_parent_pid=parent,reports=reports.ToArray(),no_child_helper_created=true});return valid;
    }
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern int RegOpenKeyExW(IntPtr parent,string key,uint options,uint access,out IntPtr result);
    [DllImport("advapi32.dll")]static extern int RegCloseKey(IntPtr key);
}
