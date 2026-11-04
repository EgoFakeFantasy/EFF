using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
// Read-only, bounded test observer. Compile outside the untrusted MC Job.
public static class WindowProbe {
 delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback cb,IntPtr p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr h,uint m,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
 public static int Main(string[] args) {
  int pid;if(args.Length!=1||!int.TryParse(args[0],out pid)||pid<=0)return 2;
  try { using(var p=Process.GetProcessById(pid)) {
   var start=p.StartTime.ToUniversalTime();var timer=Stopwatch.StartNew();IntPtr gameWindow=IntPtr.Zero;
   while(timer.ElapsedMilliseconds<180000) {
    bool alive=!p.HasExited, responsive=false, present=false;
    if(alive&&p.StartTime.ToUniversalTime()==start) {
     if(gameWindow==IntPtr.Zero) {
      int candidates=0;IntPtr candidate=IntPtr.Zero;
      EnumWindows((h,unused)=>{
       uint owner;GetWindowThreadProcessId(h,out owner);
       if(owner!=(uint)pid||!IsWindowVisible(h))return true;
       var name=new StringBuilder(128);GetClassName(h,name,name.Capacity);
       // Refuse ambiguous initial selection; never substitute another GLFW window later.
       if(!name.ToString().StartsWith("GLFW",StringComparison.Ordinal))return true;
       candidate=h;candidates++;return candidates<2;
      },IntPtr.Zero);
      if(candidates==1)gameWindow=candidate;
     }
     if(gameWindow!=IntPtr.Zero&&IsWindow(gameWindow)&&IsWindowVisible(gameWindow)) {
      uint owner;GetWindowThreadProcessId(gameWindow,out owner);
      present=owner==(uint)pid;
      // WM_NULL checks message dispatch, not renderer or simulation progress.
      if(present) {IntPtr result;responsive=SendMessageTimeout(gameWindow,0,IntPtr.Zero,IntPtr.Zero,2,300,out result)!=IntPtr.Zero;}
     }
    }
    Console.WriteLine("{\"pid\":"+pid+",\"windowHandle\":\""+gameWindow.ToInt64().ToString("x")+"\",\"windowPresent\":"+(present?"true":"false")+",\"atMs\":"+timer.ElapsedMilliseconds+",\"alive\":"+(alive?"true":"false")+",\"responsive\":"+(responsive?"true":"false")+"}");
    if(!alive)return 1;Thread.Sleep(1000);
   }
  }return 0;}catch{return 3;}
 }
}
