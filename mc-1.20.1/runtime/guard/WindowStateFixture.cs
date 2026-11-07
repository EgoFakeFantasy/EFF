using System;
using System.Diagnostics;
using System.Windows.Forms;
// Bounded Win32 observer fixture only. Does not load Java or Minecraft.
public sealed class WindowStateFixture : Form {
 readonly Stopwatch clock=Stopwatch.StartNew();
 readonly Timer timer=new Timer();int stage;
 WindowStateFixture() {
  Text="EFF WINDOW STATE TEST - NOT MINECRAFT";
  Width=640;Height=360;
  Shown+=(sender,args)=>{
   using(var p=Process.GetCurrentProcess())Console.WriteLine("{\"pid\":"+p.Id+",\"windowHandle\":\""+Handle.ToInt64().ToString("x")+"\",\"processStartedUtcTicks\":\""+p.StartTime.ToUniversalTime().Ticks+"\"}");
   clock.Restart();timer.Interval=50;timer.Start();
  };
  timer.Tick+=(sender,args)=>{
   long t=clock.ElapsedMilliseconds;
   // Hold each state from the completion of its own transition. A busy desktop
   // must not consume the destroyed-but-process-alive observation interval.
   if(stage==0&&t>=4000){stage++;Hide();clock.Restart();}
   else if(stage==1&&t>=2500){stage++;Show();clock.Restart();}
   else if(stage==2&&t>=2500){stage++;WindowState=FormWindowState.Minimized;clock.Restart();}
   else if(stage==3&&t>=2500){stage++;WindowState=FormWindowState.Normal;clock.Restart();}
   else if(stage==4&&t>=2500){stage++;DestroyHandle();clock.Restart();}
   else if(stage==5&&t>=3000){timer.Stop();Application.Exit();}
  };
 }
 // A main-form ApplicationContext exits on HandleDestroyed. Keep an independent
 // message loop so the destroyed HWND is observed while its process still lives.
 [STAThread] public static void Main(){Application.EnableVisualStyles();var window=new WindowStateFixture();window.Show();Application.Run();}
}
