// Shared first-party physical input checks and owned junction fixture creation.
using System;using System.IO;using System.Text;using System.Runtime.InteropServices;using System.Collections.Generic;
internal static class LpacInputIdentity {
    internal sealed class Identity {public string Path,FinalPath;public uint Attributes,HardLinks,Volume,IndexHigh,IndexLow,ReparseTag;}
    static void Check(bool ok,string operation){if(!ok)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),operation);}
    internal static Identity Inspect(string path,bool resolveTarget=true){
        path=System.IO.Path.GetFullPath(path);IntPtr handle=CreateFileW(path,0x80,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero);Check(handle!=new IntPtr(-1),"Open physical input identity");
        var result=new Identity();result.Path=path;
        try{Information info;Check(GetFileInformationByHandle(handle,out info),"Read physical input identity");result.Attributes=info.Attributes;result.HardLinks=info.Links;result.Volume=info.Volume;result.IndexHigh=info.IndexHigh;result.IndexLow=info.IndexLow;
            if((info.Attributes&0x400)!=0){byte[] data=new byte[16384];uint returned;Check(DeviceIoControl(handle,0x900A8,IntPtr.Zero,0,data,(uint)data.Length,out returned,IntPtr.Zero),"Read actual reparse tag");if(returned<8)throw new InvalidOperationException("REPARSE_DATA_SHORT");result.ReparseTag=BitConverter.ToUInt32(data,0);}
        }finally{CloseHandle(handle);}
        if(!resolveTarget)return result;
        handle=CreateFileW(path,0x80,7,IntPtr.Zero,3,0x02000000,IntPtr.Zero);Check(handle!=new IntPtr(-1),"Open fixture final target");
        try{var target=new StringBuilder(32768);uint length=GetFinalPathNameByHandleW(handle,target,(uint)target.Capacity,0);Check(length>0&&length<target.Capacity,"Read fixture final target");result.FinalPath=target.ToString();}finally{CloseHandle(handle);}return result;
    }
    internal static Identity ValidateFile(string path){
        CheckParents(path,false);
        Identity identity=Inspect(path,false);if((identity.Attributes&0x400)!=0||identity.ReparseTag!=0)throw new InvalidOperationException("INPUT_REPARSE");if((identity.Attributes&0x10)!=0)throw new InvalidOperationException("INPUT_NOT_REGULAR_FILE");if(identity.HardLinks!=1)throw new InvalidOperationException("INPUT_HARDLINK");return identity;
    }
    internal static Identity[] ValidateTree(string directory){
        CheckParents(directory,true);var result=new List<Identity>();Action<string> walk=null;walk=delegate(string current){if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("INPUT_REPARSE_DIRECTORY");foreach(string item in Directory.GetFileSystemEntries(current)){FileAttributes attributes=File.GetAttributes(item);if((attributes&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("INPUT_REPARSE_ENTRY");if((attributes&FileAttributes.Directory)!=0)walk(item);else result.Add(ValidateFile(item));}};walk(System.IO.Path.GetFullPath(directory));return result.ToArray();
    }
    static void CheckParents(string path,bool includeSelf){var parents=new List<string>();for(string parent=includeSelf?System.IO.Path.GetFullPath(path):System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(path));parent!=null;parent=System.IO.Path.GetDirectoryName(parent))parents.Add(parent);parents.Reverse();foreach(string parent in parents)if((File.GetAttributes(parent)&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("INPUT_REPARSE_PARENT");}
    internal static Identity CreateOwnedShadowJunction(string root){
        root=System.IO.Path.GetFullPath(root);Guid nonce;if(System.IO.Path.GetDirectoryName(root)!=System.IO.Path.GetFullPath(".tmp/verification-lpac")||!Guid.TryParseExact(System.IO.Path.GetFileName(root),"N",out nonce))throw new InvalidOperationException("JUNCTION_OWNER_SCOPE");
        string target=System.IO.Path.Combine(root,"shadow-home"),parent=System.IO.Path.Combine(root,"alias-fixtures"),link=System.IO.Path.Combine(parent,"shadow-junction");if(!Directory.Exists(target)||!Directory.Exists(parent)||Directory.Exists(link)||File.Exists(link))throw new InvalidOperationException("JUNCTION_FIXTURE_STATE");
        byte[] substitute=Encoding.Unicode.GetBytes(@"\??\"+target),print=Encoding.Unicode.GetBytes(target),data=new byte[16+substitute.Length+2+print.Length+2];
        Buffer.BlockCopy(BitConverter.GetBytes(0xA0000003u),0,data,0,4);Buffer.BlockCopy(BitConverter.GetBytes((ushort)(data.Length-8)),0,data,4,2);Buffer.BlockCopy(BitConverter.GetBytes((ushort)substitute.Length),0,data,10,2);Buffer.BlockCopy(BitConverter.GetBytes((ushort)(substitute.Length+2)),0,data,12,2);Buffer.BlockCopy(BitConverter.GetBytes((ushort)print.Length),0,data,14,2);Buffer.BlockCopy(substitute,0,data,16,substitute.Length);Buffer.BlockCopy(print,0,data,16+substitute.Length+2,print.Length);
        Directory.CreateDirectory(link);IntPtr handle=CreateFileW(link,0x40000000,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero);Check(handle!=new IntPtr(-1),"Open new owned junction");try{uint returned;Check(DeviceIoControlSet(handle,0x900A4,data,(uint)data.Length,IntPtr.Zero,0,out returned,IntPtr.Zero),"Create new owned directory junction");}finally{CloseHandle(handle);}
        Identity identity=Inspect(link);string expected=@"\\?\"+target;if(identity.ReparseTag!=0xA0000003u||!String.Equals(identity.FinalPath.TrimEnd('\\'),expected.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("JUNCTION_ACTUAL_TAG_OR_TARGET");return identity;
    }
    [StructLayout(LayoutKind.Sequential)]struct Information {internal uint Attributes,CreationLow,CreationHigh,AccessLow,AccessHigh,WriteLow,WriteHigh,Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool GetFileInformationByHandle(IntPtr handle,out Information information);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern uint GetFinalPathNameByHandleW(IntPtr handle,StringBuilder path,uint capacity,uint flags);
    [DllImport("kernel32.dll",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool DeviceIoControl(IntPtr handle,uint code,IntPtr input,uint inputLength,byte[] output,uint outputLength,out uint returned,IntPtr overlap);
    [DllImport("kernel32.dll",EntryPoint="DeviceIoControl",SetLastError=true)][return:MarshalAs(UnmanagedType.Bool)]static extern bool DeviceIoControlSet(IntPtr handle,uint code,byte[] input,uint inputLength,IntPtr output,uint outputLength,out uint returned,IntPtr overlap);
    [DllImport("kernel32.dll")][return:MarshalAs(UnmanagedType.Bool)]static extern bool CloseHandle(IntPtr handle);
}
