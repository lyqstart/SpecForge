using System;using System.IO;using System.Text;using System.Collections.Generic;using System.Web.Script.Serialization;
internal static class ResourceReadinessRegression {
    internal static int Main(string[] args){if(args.Length!=1)return 64;var verified=new HashSet<uint>();uint root=0;foreach(var line in File.ReadAllLines(Path.Combine(args[0],"events.jsonl"))){var e=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(line);if((string)e["name"]=="process_created_suspended"||(string)e["name"]=="descendant_independently_verified"){uint pid=Convert.ToUInt32(((Dictionary<string,object>)e["data"])["pid"]);verified.Add(pid);if((string)e["name"]=="process_created_suspended")root=pid;}}
        byte[] raw=File.ReadAllBytes(Path.Combine(args[0],"stdout.bin"));if(verified.Count!=3||LpacResourceProbe.ReadyNodeCount(raw,"cancel",verified)!=1)return 1;string outcome=null;LpacResourceProbe.Outcome("cancel",130,true,false,true,false,verified,3,false,false,null,null,raw,new uint[0],(name,data)=>{outcome=new JavaScriptSerializer().Serialize(data);});if(outcome==null||!outcome.Contains("\"expected_rejection_proved\":false"))return 2;
        string same="";for(int i=0;i<3;i++)same+="SFRESOURCE_READY:{\"kind\":\"cancel\",\"role\":\""+i+"\",\"pid\":"+root+"}\n";if(LpacResourceProbe.ReadyNodeCount(Encoding.UTF8.GetBytes(same),"cancel",verified)==3)return 3;
        Console.WriteLine("ACTUAL_CONHOST_COUNT_FALSE_POSITIVE_REJECTED;DISTINCT_NODE_ROLE_BINDING_REQUIRED;EXIT=0;NO_OS_RESOURCES");return 0;
    }
}
