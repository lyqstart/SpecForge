// Read-only loader metadata; none of the resolved operations is invoked.
using System;using System.IO;using System.Text;using System.Runtime.InteropServices;using System.Security.Cryptography;using System.Collections.Generic;using System.Web.Script.Serialization;
internal static class ResolveSystemExports {
    static string Hash(string file){using(var s=SHA256.Create())return BitConverter.ToString(s.ComputeHash(File.ReadAllBytes(file))).Replace("-","").ToLowerInvariant();}
    internal static int Main(){var facts=new List<object>();foreach(var name in new[]{"CreateNamedPipeA","CreateNamedPipeW","CreateProcessW"}){
        IntPtr module=GetModuleHandleW("kernel32.dll"),entry=GetProcAddress(module,name),owner;if(entry==IntPtr.Zero||!GetModuleHandleExW(6,entry,out owner))return 1;
        var file=new StringBuilder(32768);uint length=GetModuleFileNameW(owner,file,(uint)file.Capacity);if(length==0||length>=file.Capacity)return 2;
        facts.Add(new{name=name,actual_module=file.ToString(),export_rva=entry.ToInt64()-owner.ToInt64(),module_sha256=Hash(file.ToString())});}
        Console.WriteLine(new JavaScriptSerializer().Serialize(new{utc=DateTime.UtcNow.ToString("o"),method="GetProcAddress resolution plus owner-module metadata only",facts=facts,inner_exit_code=0}));return 0;}
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr GetModuleHandleW(string name);
    [DllImport("kernel32.dll",CharSet=CharSet.Ansi)]static extern IntPtr GetProcAddress(IntPtr module,string name);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool GetModuleHandleExW(uint flags,IntPtr address,out IntPtr module);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern uint GetModuleFileNameW(IntPtr module,StringBuilder file,uint count);
}
