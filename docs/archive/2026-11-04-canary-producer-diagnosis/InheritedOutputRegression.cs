// Replay actual frozen output and negative acceptance cases; no OS resources.
using System;using System.IO;using System.Text;using System.Reflection;
using System.Runtime.Serialization;using System.Collections.Generic;
using System.Web.Script.Serialization;
internal static class InheritedOutputRegression {
    static int checks;static string last;
    static void Check(bool value,string label){if(!value)throw new Exception(label);checks++;}
    static byte[] Join(byte[] a,byte[] b){var r=new byte[a.Length+b.Length];a.CopyTo(r,0);b.CopyTo(r,a.Length);return r;}
    internal static int Main(string[] args){
        if(args.Length!=1)return 64;string root=args[0],fake=null;
        foreach(var line in File.ReadAllLines(Path.Combine(root,"events.jsonl"))){var e=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(line);if((string)e["name"]=="canary_created")fake=(string)((Dictionary<string,object>)e["data"])["fake_value"];}
        Check(fake!=null,"FAKE_VALUE_REQUIRED");
        // Bypass resource-creating constructor only in this isolated replay test.
        var canary=(LpacRegistryReadCanary)FormatterServices.GetUninitializedObject(typeof(LpacRegistryReadCanary));
        typeof(LpacRegistryReadCanary).GetField("fakeValue",BindingFlags.NonPublic|BindingFlags.Instance).SetValue(canary,fake);
        Action<string,object> record=(name,data)=>{last=new JavaScriptSerializer().Serialize(data);};
        typeof(LpacRegistryReadCanary).GetField("record",BindingFlags.NonPublic|BindingFlags.Instance).SetValue(canary,record);
        var stdout=File.ReadAllBytes(Path.Combine(root,"stdout.bin"));var stderr=File.ReadAllBytes(Path.Combine(root,"stderr.bin"));
        Check(canary.ValidateInherited(stdout,stderr,0),"ACTUAL_SINGLE_CANARY");
        Check(!canary.ValidateInherited(stdout,stderr,41),"NONZERO_APPLICATION");
        foreach(var encoding in new[]{Encoding.UTF8,Encoding.Unicode})foreach(bool outPipe in new[]{false,true}){
            var leak=encoding.GetBytes(fake);Check(!canary.ValidateInherited(outPipe?Join(stdout,leak):stdout,outPipe?stderr:Join(stderr,leak),0),"LEAK_ACCEPTED");
            Check(last.Contains("FAIL_HOST_FAKE_CREDENTIAL_READABLE"),"LEAK_NOT_IDENTIFIED");
        }
        Check(!canary.ValidateInherited(new byte[0],stderr,0),"EMPTY_ACCEPTED");
        Check(!canary.ValidateInherited(Join(stdout,stdout),stderr,0),"DUPLICATE_ACCEPTED");
        var failedControl=Encoding.UTF8.GetString(stdout).Replace("\"system\":{\"status\":0","\"system\":{\"status\":1");
        Check(!canary.ValidateInherited(Encoding.UTF8.GetBytes(failedControl),stderr,0),"BAD_CONTROL_ACCEPTED");
        foreach(var malformed in new[]{"SFPROBE_REPORT:null\n","SFPROBE_REPORT:{broken}\n","SFPROBE_REPORT:{\"probe\":17}\n"}){
            bool accepted=false;try{accepted=canary.ValidateInherited(Encoding.UTF8.GetBytes(malformed),stderr,0);}catch(ArgumentException){}catch(InvalidOperationException){}catch(InvalidCastException){}
            Check(!accepted,"MALFORMED_ACCEPTED");
        }
        Console.WriteLine("ACTUAL_OUTPUT_AND_NEGATIVE_ACCEPTANCE_REPLAY checks="+checks+" exit=0; malformed payloads remain owner failure, not denial; no OS experiment");return 0;
    }
}
