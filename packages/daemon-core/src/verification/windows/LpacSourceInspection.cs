// D25 controller-only physical inventory. No application launch or filesystem mutation.
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

internal static class LpacSourceInspection {
    const string Contract="verification-source-inspection/v1";
    static void Require(bool ok,string code){if(!ok)throw new InvalidOperationException("SOURCE_"+code);}
    static string Hash(byte[] raw){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(raw)).Replace("-","").ToLowerInvariant();}
    static string Text(Dictionary<string,object> value,string key){object v;Require(value.TryGetValue(key,out v)&&v is string,"FIELD");return (string)v;}
    static void Relative(string value){Require(value.Length>0&&value.Length<=1024&&!Path.IsPathRooted(value)&&!value.Contains('\\'),"PATH");foreach(string part in value.Split('/'))Require(part.Length>0&&part!="."&&part!=".."&&!part.EndsWith(".")&&!part.EndsWith(" ")&&part.IndexOfAny(Path.GetInvalidFileNameChars())<0&&!System.Text.RegularExpressions.Regex.IsMatch(part,@"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)",System.Text.RegularExpressions.RegexOptions.IgnoreCase),"PATH_COMPONENT");}
    [StructLayout(LayoutKind.Sequential)]struct Info {internal uint Attributes,CreationLow,CreationHigh,AccessLow,AccessHigh,WriteLow,WriteHigh,Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
    sealed class Held:IDisposable {
        internal SafeFileHandle Handle;internal Info Identity;
        internal Held(string file,bool read){
            Handle=CreateFileW(file,read?0x80000000u:0x80u,1,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
            if(Handle.IsInvalid)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"SOURCE_OPEN");
            try{Require(GetFileInformationByHandle(Handle,out Identity),"IDENTITY");Require((Identity.Attributes&0x440)==0,"REPARSE_OR_DEVICE");if((Identity.Attributes&0x10)==0)Require(Identity.Links==1,"HARDLINK");}catch{Handle.Dispose();throw;}
        }
        internal string FileId {get{return (((ulong)Identity.IndexHigh<<32)|Identity.IndexLow).ToString(System.Globalization.CultureInfo.InvariantCulture);}}
        internal long Size {get{return checked((long)(((ulong)Identity.SizeHigh<<32)|Identity.SizeLow));}}
        public void Dispose(){Handle.Dispose();}
    }
    static void Parents(string full,List<Held> held){var parents=new List<string>();for(string p=Path.GetDirectoryName(full);p!=null;p=Path.GetDirectoryName(p))parents.Add(p);parents.Reverse();Require(parents.Count<=64,"ANCESTOR_BUDGET");foreach(string p in parents){var h=new Held(p,false);held.Add(h);Require((h.Identity.Attributes&0x10)!=0,"PARENT_KIND");}}
    internal static int Run(string request,string expectedHash){
        Require(System.Text.RegularExpressions.Regex.IsMatch(expectedHash??"","^[a-f0-9]{64}$"),"REQUEST_HASH");
        string config=Environment.GetEnvironmentVariable("OPENCODE_CONFIG_DIR");Require(!String.IsNullOrWhiteSpace(config)&&Path.IsPathRooted(config),"CONFIG_ROOT");
        string full=Path.GetFullPath(request),directory=Path.Combine(Path.GetFullPath(config),"sf-user","runtime","verification-owner","source-requests");Guid nonce;
        Require(String.Equals(Path.GetDirectoryName(full),directory,StringComparison.OrdinalIgnoreCase)&&Path.GetExtension(full)==".json"&&Guid.TryParseExact(Path.GetFileNameWithoutExtension(full),"N",out nonce),"REQUEST_LOCATION");
        var held=new List<Held>();
        try{
            Parents(full,held);var requestHandle=new Held(full,true);held.Add(requestHandle);Require((requestHandle.Identity.Attributes&0x10)==0&&requestHandle.Size<=262144,"REQUEST_SIZE");
            byte[] raw;using(var borrowed=new SafeFileHandle(requestHandle.Handle.DangerousGetHandle(),false))using(var stream=new FileStream(borrowed,FileAccess.Read))using(var output=new MemoryStream()){stream.CopyTo(output);raw=output.ToArray();}
            Require(Hash(raw)==expectedHash,"REQUEST_DRIFT");var serializer=new JavaScriptSerializer{MaxJsonLength=25165824};var value=serializer.Deserialize<Dictionary<string,object>>(new UTF8Encoding(false,true).GetString(raw));
            Require(value!=null&&value.Count==3&&value.ContainsKey("contract")&&value.ContainsKey("projectRoot")&&value.ContainsKey("selectedPaths")&&Text(value,"contract")==Contract,"REQUEST_SCHEMA");
            string root=Text(value,"projectRoot");Require(Path.IsPathRooted(root)&&!root.StartsWith(@"\\")&&root==Path.GetFullPath(root),"ROOT");
            Require(value["selectedPaths"] is IList,"SELECTED_SCHEMA");var selected=new HashSet<string>(StringComparer.Ordinal);var aliases=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach(object item in (IList)value["selectedPaths"]){Require(item is string,"SELECTED_PATH");string name=(string)item;Relative(name);Require(!name.Split('/').Any(p=>new[]{".aws",".ssh",".config",".opencode"}.Contains(p.ToLowerInvariant()))&&!System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(name),@"^(?:\.env(?:\..*)?|auth\.json|credentials\.json|host-profile\.json|opencode\.jsonc?)$",System.Text.RegularExpressions.RegexOptions.IgnoreCase),"CREDENTIAL_INPUT");Require(selected.Add(name)&&aliases.Add(name)&&selected.Count<=2048,"SELECTED_ALIAS_OR_BUDGET");}
            Parents(root,held);var inventory=new List<Dictionary<string,object>>();var files=new List<Dictionary<string,object>>();var physical=new HashSet<string>();var directorySets=new Dictionary<string,string[]>();long total=0;aliases.Clear();
            Action<string,string,int> walk=null;walk=delegate(string file,string relative,int depth){
                Require(depth<=64&&inventory.Count<4096,"INVENTORY_BUDGET");if(relative.Length>0){Relative(relative);Require(aliases.Add(relative),"PATH_ALIAS");}
                var h=new Held(file,selected.Contains(relative));held.Add(h);bool isDirectory=(h.Identity.Attributes&0x10)!=0;
                string name=Path.GetFileName(file);if(relative.Length>0){Require(!String.Equals(name,".git",StringComparison.OrdinalIgnoreCase)&&!String.Equals(name,"node_modules",StringComparison.OrdinalIgnoreCase),"GIT_OR_DEPENDENCY");if(String.Equals(name,".specforge",StringComparison.OrdinalIgnoreCase))Require(relative==".specforge"&&isDirectory,"GOVERNANCE_ALIAS");}
                Require(physical.Add(h.Identity.Volume+":"+h.FileId),"PHYSICAL_ALIAS");inventory.Add(new Dictionary<string,object>{{"path",relative},{"type",isDirectory?"directory":"file"},{"volume",h.Identity.Volume.ToString(System.Globalization.CultureInfo.InvariantCulture)},{"fileId",h.FileId}});
                if(isDirectory){Require(!selected.Contains(relative),"SELECTED_DIRECTORY");if(relative==".specforge")return;string[] children=Directory.EnumerateFileSystemEntries(file).Take(4097).OrderBy(x=>x,StringComparer.Ordinal).ToArray();Require(children.Length<=4096,"DIRECTORY_BUDGET");directorySets.Add(file,children);foreach(string child in children)walk(child,relative.Length==0?Path.GetFileName(child):relative+"/"+Path.GetFileName(child),depth+1);}
                else if(selected.Contains(relative)){
                    total+=h.Size;Require(total<=16777216,"INPUT_BUDGET");byte[] selectedBytes;using(var borrowed=new SafeFileHandle(h.Handle.DangerousGetHandle(),false))using(var stream=new FileStream(borrowed,FileAccess.Read))using(var content=new MemoryStream()){Require(stream.Length==h.Size,"FILE_SIZE_DRIFT");stream.CopyTo(content);Require(stream.Position==h.Size,"FILE_SHORT_READ");selectedBytes=content.ToArray();}
                    files.Add(new Dictionary<string,object>{{"path",relative},{"bytes",h.Size},{"sha256",Hash(selectedBytes)},{"volume",h.Identity.Volume.ToString(System.Globalization.CultureInfo.InvariantCulture)},{"fileId",h.FileId},{"bytesBase64",Convert.ToBase64String(selectedBytes)}});
                }
            };
            walk(root,"",0);Require(files.Count==selected.Count,"SELECTED_MISSING");foreach(var row in directorySets)Require(row.Value.SequenceEqual(Directory.EnumerateFileSystemEntries(row.Key).Take(4097).OrderBy(x=>x,StringComparer.Ordinal)),"INVENTORY_DRIFT");
            string result=serializer.Serialize(new Dictionary<string,object>{{"contract",Contract},{"projectRoot",root},{"inventory",inventory.OrderBy(x=>(string)x["path"],StringComparer.Ordinal).ToArray()},{"selectedFiles",files.OrderBy(x=>(string)x["path"],StringComparer.Ordinal).ToArray()}});Require(Encoding.UTF8.GetByteCount(result)+1<=25165824,"OUTPUT_BUDGET");Console.OutputEncoding=new UTF8Encoding(false);Console.WriteLine(result);return 0;
        }finally{for(int i=held.Count-1;i>=0;i--)held[i].Dispose();}
    }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Info info);
}
