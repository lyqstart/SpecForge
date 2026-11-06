// Direct, explicitly initialized COM scripting bridge. No System.Management timers.
using System;using System.Collections.Generic;using System.Reflection;using System.Runtime.InteropServices;
internal sealed class LpacNativeWmiCom:IDisposable {
    readonly List<object> objects=new List<object>();bool initialized;object services;
    internal string Stage="co_initialize";internal int InitializeHresult;internal bool Connected;
    internal LpacNativeWmiCom(){
        try{InitializeHresult=CoInitializeEx(IntPtr.Zero,0);initialized=InitializeHresult>=0;if(InitializeHresult<0&&InitializeHresult!=unchecked((int)0x80010106))Marshal.ThrowExceptionForHR(InitializeHresult);Stage="co_create_locator";var clsid=new Guid("76a64158-cb41-11d1-8b02-00600806d9b6");var iid=new Guid("00020400-0000-0000-c000-000000000046");IntPtr pointer;int hr=CoCreateInstance(ref clsid,IntPtr.Zero,1,ref iid,out pointer);if(hr<0)Marshal.ThrowExceptionForHR(hr);object locator;try{locator=Keep(Marshal.GetObjectForIUnknown(pointer));}finally{Marshal.Release(pointer);}Stage="connect_server";services=Call(locator,"ConnectServer",new object[]{".","root\\cimv2"});Connected=true;object security=Get(services,"Security_");Put(security,"ImpersonationLevel",3);Stage="connected";
        }catch(Exception e){if(!e.Data.Contains("native_com_stage"))e.Data["native_com_stage"]=Stage;e.Data["native_com_initialize_hresult"]=InitializeHresult;Dispose();throw;}
    }
    object Keep(object value){if(value!=null&&Marshal.IsComObject(value)&&!objects.Exists(item=>Object.ReferenceEquals(item,value)))objects.Add(value);return value;}
    internal static Exception Actual(Exception error){while(error is TargetInvocationException&&error.InnerException!=null)error=error.InnerException;return error;}
    Exception Failure(Exception error,string member){var e=Actual(error);e.Data["native_com_stage"]=Stage+":"+member;return e;}
    object Call(object target,string name,object[] args){try{return Keep(target.GetType().InvokeMember(name,BindingFlags.InvokeMethod|BindingFlags.OptionalParamBinding,null,target,args));}catch(Exception e){throw Failure(e,name);}}
    object Get(object target,string name){try{return Keep(target.GetType().InvokeMember(name,BindingFlags.GetProperty,null,target,new object[0]));}catch(Exception e){throw Failure(e,name);}}
    void Put(object target,string name,object value){try{target.GetType().InvokeMember(name,BindingFlags.SetProperty,null,target,new[]{value});}catch(Exception e){throw Failure(e,name);}}
    internal uint Create(string command,string cwd,out uint pid){Stage="get_process_class";object process=Call(services,"Get",new object[]{"Win32_Process"});object startupClass=Call(services,"Get",new object[]{"Win32_ProcessStartup"});object startup=Call(startupClass,"SpawnInstance_",new object[0]);Put(startup,"ShowWindow",(ushort)0);
        object methods=Get(process,"Methods_");object method=Call(methods,"Item",new object[]{"Create"});object definition=Get(method,"InParameters");object input=Call(definition,"SpawnInstance_",new object[0]);Put(input,"CommandLine",command);Put(input,"CurrentDirectory",cwd);Put(input,"ProcessStartupInformation",startup);Stage="exec_process_create";object result=Call(services,"ExecMethod",new object[]{"Win32_Process","Create",input});pid=Convert.ToUInt32(Get(result,"ProcessId"));return Convert.ToUInt32(Get(result,"ReturnValue"));
    }
    public void Dispose(){Exception failure=null;for(int i=objects.Count-1;i>=0;i--)try{Marshal.FinalReleaseComObject(objects[i]);}catch(Exception e){failure=e;}objects.Clear();if(initialized){CoUninitialize();initialized=false;}if(failure!=null)throw new InvalidOperationException("EXPLICIT_COM_RELEASE_FAILED",failure);}
    [DllImport("ole32.dll")]static extern int CoInitializeEx(IntPtr reserved,uint flags);
    [DllImport("ole32.dll")]static extern void CoUninitialize();
    [DllImport("ole32.dll")]static extern int CoCreateInstance(ref Guid clsid,IntPtr outer,uint context,ref Guid iid,out IntPtr result);
}
