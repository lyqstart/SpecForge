using System;using System.IO;using System.Linq;using System.Collections.Generic;using System.Web.Script.Serialization;
internal static class UncNativeReportRegression {
    internal static int Main(string[] args){string text=File.ReadAllText(args[0]);var lines=text.Split('\n').Where(l=>l.StartsWith("SFUNC_NATIVE:")).ToArray();if(lines.Length!=3)throw new Exception("ACTUAL_SOURCE");var ids=new HashSet<uint>(lines.Select(l=>Convert.ToUInt32(new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(l.Substring("SFUNC_NATIVE:".Length))["pid"])));int checks=0;
        Action<string,bool,HashSet<uint>> check=(raw,expected,pids)=>{if(LpacUncProbe.ValidateReports(raw,pids)!=expected)throw new Exception("UNC_REPORT_REGRESSION:"+checks);checks++;};
        check(text,true,ids);check(text+"\n"+lines[0],false,ids);check(text.Replace(lines[0],""),false,ids);check(text.Replace("\"win32_error\":65","\"win32_error\":2"),false,ids);check(text.Replace("\"opened\":false","\"opened\":true"),false,ids);check(text.Replace("\"known_denial\":true","\"known_denial\":false"),false,ids);check(text,false,new HashSet<uint>());check("SFUNC_NATIVE:{broken}\n",false,ids);check(text.Replace("\"role\":1","\"role\":0"),false,ids);
        Console.WriteLine("{\"actual_raw_and_negative_checks\":"+checks+",\"inner_exit_code\":0}");return 0;
    }
}
