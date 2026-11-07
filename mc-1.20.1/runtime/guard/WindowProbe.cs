using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
// Read-only, bounded test observer. Compile outside the untrusted MC Job.
public static class WindowProbe {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct ProcessEntry {
  public uint size,usage,pid;public IntPtr heap;public uint module,threads,parent;public int priority;public uint flags;
  [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string name;
 }
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Process32FirstW(IntPtr snapshot,ref ProcessEntry entry);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool Process32NextW(IntPtr snapshot,ref ProcessEntry entry);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder path,ref int size);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 // Resolve the single direct Java child from OS process metadata, never a PID supplied by MC.
 // Keep both Process handles open so PID reuse cannot substitute a later process.
 static Process JavaChild(Process launcher,string expectedImage) {
  expectedImage=Path.GetFullPath(expectedImage);Process found=null;
  IntPtr snapshot=CreateToolhelp32Snapshot(2,0);if(snapshot==new IntPtr(-1))throw new IOException("PROCESS_SNAPSHOT_FAILED");
  try {
   var entry=new ProcessEntry();entry.size=(uint)Marshal.SizeOf(typeof(ProcessEntry));
   if(!Process32FirstW(snapshot,ref entry))throw new IOException("PROCESS_SNAPSHOT_EMPTY");
   do {
    if(entry.parent!=(uint)launcher.Id)continue;
    var child=Process.GetProcessById((int)entry.pid);bool keep=false;
    try {
     var image=new StringBuilder(32768);int length=image.Capacity;
     if(!QueryFullProcessImageName(child.Handle,0,image,ref length))throw new IOException("PROCESS_IMAGE_UNAVAILABLE");
     if(!String.Equals(Path.GetFullPath(image.ToString()),expectedImage,StringComparison.OrdinalIgnoreCase))continue;
     if(child.HasExited||child.StartTime.ToUniversalTime()<launcher.StartTime.ToUniversalTime()||child.SessionId!=launcher.SessionId)throw new IOException("PROCESS_IDENTITY_MISMATCH");
     if(found!=null)throw new IOException("AMBIGUOUS_JAVA_CHILD");found=child;keep=true;
    }finally{if(!keep)child.Dispose();}
   }while(Process32NextW(snapshot,ref entry));
   if(found==null||launcher.HasExited)throw new IOException("JAVA_CHILD_REQUIRED");
   return found;
  }catch{if(found!=null)found.Dispose();throw;}finally{CloseHandle(snapshot);}
 }
 delegate bool Callback(IntPtr h,IntPtr p);
 static Process AwaitJavaChild(Process launcher,string image) {
  var deadline=Stopwatch.StartNew();
  while(true) {
   try{return JavaChild(launcher,image);}
   catch(IOException error){
    // Wait only for INITIAL creation. Never rebind after a Java process/window was observed.
    if(error.Message!="JAVA_CHILD_REQUIRED"||launcher.HasExited||deadline.ElapsedMilliseconds>=10000)throw;
    Thread.Sleep(100);
   }
  }
 }
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback cb,IntPtr p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [StructLayout(LayoutKind.Sequential)] struct Rect {public int left,top,right,bottom;}
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h,out Rect rect);
 [DllImport("user32.dll")] static extern IntPtr GetWindowDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 static Rect CaptureRect(IntPtr window) {
  // Match the target DC: DPI-aware OpenGL uses physical pixels, an unaware GDI fixture logical pixels.
  IntPtr context=GetWindowDpiAwarenessContext(window);
  if(context==IntPtr.Zero)throw new IOException("WINDOW_DPI_CONTEXT_UNAVAILABLE");
  IntPtr previous=SetThreadDpiAwarenessContext(context);
  if(previous==IntPtr.Zero)throw new IOException("OBSERVER_DPI_CONTEXT_UNAVAILABLE");
  try {Rect r;if(!GetClientRect(window,out r))throw new IOException("WINDOW_CLIENT_RECT_UNAVAILABLE");return r;}
  finally{SetThreadDpiAwarenessContext(previous);}
 }
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr h,uint m,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
  [DllImport("kernel32.dll")] static extern void SetLastError(uint error);
  [DllImport("user32.dll")] static extern bool IsHungAppWindow(IntPtr h);
 public static int Main(string[] args) {
  bool resolve=args.Length==3&&args[0]=="--child-java";
  bool exact=args.Length==4&&args[0]=="--window";
  int launchPid;if((!resolve&&!exact&&args.Length!=1)||!int.TryParse(args[resolve||exact?1:0],out launchPid)||launchPid<=0)return 2;
  try { using(var launcher=Process.GetProcessById(launchPid)) {
   // Force acquisition of the original launcher handle before enumerating its child.
   var retained=launcher.Handle;
   using(var p=resolve?AwaitJavaChild(launcher,args[2]):Process.GetProcessById(launchPid)) {
   var retainedChild=p.Handle;int pid=p.Id;
   var start=p.StartTime.ToUniversalTime();var timer=Stopwatch.StartNew();IntPtr gameWindow=IntPtr.Zero;
   if(exact) {
    long ticks,handle;
    if(!long.TryParse(args[2],out ticks)||ticks!=start.Ticks||!long.TryParse(args[3],System.Globalization.NumberStyles.HexNumber,System.Globalization.CultureInfo.InvariantCulture,out handle)||handle==0)return 4;
    gameWindow=new IntPtr(handle);
   }
   while(timer.ElapsedMilliseconds<600000) {
    bool launcherAlive=!launcher.HasExited, javaAlive=!p.HasExited;
    bool alive=launcherAlive&&javaAlive, responsive=false, present=false;
    bool identityMatches=javaAlive&&p.StartTime.ToUniversalTime()==start;
    if(alive&&identityMatches) {
     if(gameWindow==IntPtr.Zero) {
      int candidates=0;IntPtr candidate=IntPtr.Zero;
      EnumWindows((h,unused)=>{
       uint candidateOwner;GetWindowThreadProcessId(h,out candidateOwner);
       if(candidateOwner!=(uint)pid||!IsWindowVisible(h))return true;
       var name=new StringBuilder(128);GetClassName(h,name,name.Capacity);
       // Refuse ambiguous initial selection; never substitute another GLFW window later.
       if(!name.ToString().StartsWith("GLFW",StringComparison.Ordinal))return true;
       candidate=h;candidates++;return candidates<2;
      },IntPtr.Zero);
      if(candidates==1)gameWindow=candidate;
     }
    }
    // Keep the independent OS observations even on failure. Hidden/minimized/destroyed
    // windows are all unacceptable for continuous play, but are different failure modes.
    // These Win32 reads are sequential observations, not an atomic window-state snapshot.
    bool bound=gameWindow!=IntPtr.Zero, exists=bound&&IsWindow(gameWindow);
    bool visible=exists&&IsWindowVisible(gameWindow), minimized=exists&&IsIconic(gameWindow);
    uint owner=0,windowThread=exists?GetWindowThreadProcessId(gameWindow,out owner):0;
    bool ownerMatches=exists&&windowThread!=0&&owner==(uint)pid;
    bool responseChecked=alive&&identityMatches&&ownerMatches;
    int responseError=0;long responseResult=0,responseElapsedMs=0;bool hungWindow=false;
    if(responseChecked) {IntPtr result;SetLastError(0);long before=timer.ElapsedMilliseconds;
      responsive=SendMessageTimeout(gameWindow,0,IntPtr.Zero,IntPtr.Zero,2,300,out result)!=IntPtr.Zero;
      responseError=responsive?0:Marshal.GetLastWin32Error();responseResult=result.ToInt64();
      responseElapsedMs=timer.ElapsedMilliseconds-before;hungWindow=IsHungAppWindow(gameWindow);}
    Rect client=new Rect();bool rectAvailable=false;string rectError="";
    if(alive&&identityMatches&&ownerMatches) {
     try{client=CaptureRect(gameWindow);rectAvailable=true;}
     catch(IOException error){rectError=error.Message;}
    }
    present=alive&&identityMatches&&exists&&visible&&!minimized&&ownerMatches&&rectAvailable;
    string unavailable=!launcherAlive?"LAUNCHER_EXITED":!javaAlive?"JAVA_EXITED":!identityMatches?"PROCESS_IDENTITY_CHANGED":!bound?"WINDOW_NOT_BOUND":!exists?"WINDOW_DESTROYED":!ownerMatches?"WINDOW_OWNER_CHANGED":!visible?"WINDOW_HIDDEN":minimized?"WINDOW_MINIMIZED":!rectAvailable?"CLIENT_RECT_UNAVAILABLE":"";
    Console.WriteLine("{\"pid\":"+pid+",\"launchPid\":"+launchPid+",\"processStartedUtcTicks\":\""+start.Ticks+"\",\"windowHandle\":\""+gameWindow.ToInt64().ToString("x")+"\",\"windowPresent\":"+JsonBool(present)+",\"windowExists\":"+JsonBool(exists)+",\"windowVisible\":"+JsonBool(visible)+",\"windowMinimized\":"+JsonBool(minimized)+",\"windowOwnerPid\":"+owner+",\"windowOwnerMatches\":"+JsonBool(ownerMatches)+",\"windowThreadId\":"+windowThread+",\"processIdentityMatches\":"+JsonBool(identityMatches)+",\"launcherAlive\":"+JsonBool(launcherAlive)+",\"javaAlive\":"+JsonBool(javaAlive)+",\"responseChecked\":"+JsonBool(responseChecked)+",\"responseError\":"+responseError+",\"responseResult\":"+responseResult+",\"responseElapsedMs\":"+responseElapsedMs+",\"hungWindow\":"+JsonBool(hungWindow)+",\"clientRectAvailable\":"+JsonBool(rectAvailable)+",\"clientRectError\":\""+rectError+"\",\"windowUnavailableReason\":\""+unavailable+"\",\"clientWidth\":"+(client.right-client.left)+",\"clientHeight\":"+(client.bottom-client.top)+",\"atMs\":"+timer.ElapsedMilliseconds+",\"alive\":"+JsonBool(alive)+",\"responsive\":"+JsonBool(responsive)+"}");
    if(!alive)return 1;Thread.Sleep(1000);
   }
  }}return 0;}catch(Exception error){Console.Error.WriteLine("WINDOW_PROBE_"+error.GetType().Name+":"+error.Message);return 3;}
 }
 static string JsonBool(bool value){return value?"true":"false";}
}
