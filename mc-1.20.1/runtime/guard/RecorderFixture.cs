using System;
using System.Diagnostics;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;
// Test fixture only. No Minecraft, Java, mod loading, or desktop capture.
public sealed class RecorderFixture : Form {
 [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int command);
 int frames;readonly Stopwatch clock=Stopwatch.StartNew();
 readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
 RecorderFixture() {
  Text="EFF OFFLINE RECORDER TEST - NOT MINECRAFT";ClientSize=new Size(640,360);
  StartPosition=FormStartPosition.CenterScreen;DoubleBuffered=true;BackColor=Color.FromArgb(12,23,40);
  timer.Interval=50;timer.Tick+=(s,e)=>{frames++;Invalidate();if(clock.ElapsedMilliseconds>30000)Close();};
  Shown+=(s,e)=>{
   ShowWindow(Handle,5);
   using(var p=Process.GetCurrentProcess())Console.WriteLine("{\"pid\":"+p.Id+",\"windowHandle\":\""+Handle.ToInt64().ToString("x")+"\",\"processStartedUtcTicks\":\""+p.StartTime.ToUniversalTime().Ticks+"\"}");
   timer.Start();var input=new Thread(()=>{Console.ReadLine();try{BeginInvoke(new Action(Close));}catch{}});input.IsBackground=true;input.Start();
  };
 }
 protected override void OnPaint(PaintEventArgs e){
  base.OnPaint(e);using(var font=new Font("Consolas",18)){
   e.Graphics.DrawString("OFFLINE FIXTURE / NOT MINECRAFT",font,Brushes.White,20,24);
   e.Graphics.DrawString("Frame "+frames+"    "+clock.ElapsedMilliseconds+" ms",font,Brushes.Yellow,20,75);
   e.Graphics.DrawString("Window-only recording",font,Brushes.White,20,300);
  }
  e.Graphics.FillRectangle(Brushes.Cyan,20+(frames*7)%520,150,80,80);
 }
 [STAThread] public static void Main(){Application.EnableVisualStyles();Application.Run(new RecorderFixture());}
}
