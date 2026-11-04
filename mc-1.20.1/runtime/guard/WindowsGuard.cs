// Windows-only outer trust boundary. No service/task installation and no arbitrary process discovery.
using System;
using System.IO;
using System.Text;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Eff.Guard {
public sealed class NativeJob : IDisposable {
 [StructLayout(LayoutKind.Sequential)] struct Basic { public long ProcessTime,JobTime;public uint Flags;public UIntPtr Min,Max;public uint Active;public UIntPtr Affinity;public uint Priority,Scheduling; }
 [StructLayout(LayoutKind.Sequential)] struct Io {public ulong a,b,c,d,e,f;}
 [StructLayout(LayoutKind.Sequential)] struct Limits {public Basic Basic;public Io Io;public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob;}
 [StructLayout(LayoutKind.Sequential)] struct Accounting { public long a,b,c,d;public uint faults,total,active,terminated; }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int cls,IntPtr info,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int cls,IntPtr info,uint size,IntPtr length);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 IntPtr handle;
 public NativeJob(){handle=CreateJobObject(IntPtr.Zero,null);if(handle==IntPtr.Zero)throw new IOException("JOB_CREATE_FAILED");var l=new Limits();l.Basic.Flags=0x2000|0x8|0x200;l.Basic.Active=16;l.JobMemory=new UIntPtr(8UL*1024*1024*1024); // KILL_ON_JOB_CLOSE, no breakaway flags
  int size=Marshal.SizeOf(l);IntPtr ptr=Marshal.AllocHGlobal(size);try{Marshal.StructureToPtr(l,ptr,false);if(!SetInformationJobObject(handle,9,ptr,(uint)size))throw new IOException("JOB_LIMIT_FAILED");}finally{Marshal.FreeHGlobal(ptr);}}
 public void Add(Process process){if(!AssignProcessToJobObject(handle,process.Handle))throw new IOException("JOB_ASSIGN_FAILED_"+Marshal.GetLastWin32Error());}
 public uint Active(){int size=Marshal.SizeOf(typeof(Accounting));IntPtr ptr=Marshal.AllocHGlobal(size);try{if(!QueryInformationJobObject(handle,1,ptr,(uint)size,IntPtr.Zero))throw new IOException("JOB_QUERY_FAILED");return ((Accounting)Marshal.PtrToStructure(ptr,typeof(Accounting))).active;}finally{Marshal.FreeHGlobal(ptr);}}
 public ulong PeakMemoryBytes(){int size=Marshal.SizeOf(typeof(Limits));IntPtr ptr=Marshal.AllocHGlobal(size);try{if(!QueryInformationJobObject(handle,9,ptr,(uint)size,IntPtr.Zero))throw new IOException("JOB_MEMORY_QUERY_FAILED");return ((Limits)Marshal.PtrToStructure(ptr,typeof(Limits))).PeakJob.ToUInt64();}finally{Marshal.FreeHGlobal(ptr);}}
 public void Drain(){if(handle==IntPtr.Zero)return;if(!TerminateJobObject(handle,71))throw new IOException("JOB_TERMINATE_FAILED");var watch=Stopwatch.StartNew();while(Active()!=0){if(watch.ElapsedMilliseconds>10000)throw new IOException("OLD_JOB_NOT_EMPTY");Thread.Sleep(20);}}
 public void Dispose(){if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;}}
}
public sealed class Ledger : IDisposable {
 readonly FileStream file,keyLock,anchor;readonly byte[] key;readonly JavaScriptSerializer json;readonly string ruleset;string previous="GENESIS";
 public Dictionary<string,object> Current;
 public static void Provision(string directory){Directory.CreateDirectory(directory);string k=Path.Combine(directory,"ledger-key.dpapi"),p=Path.Combine(directory,"ledger.bin");if(File.Exists(k)||File.Exists(p))throw new IOException("LEDGER_ALREADY_PROVISIONED");byte[] raw=new byte[32];using(var r=RandomNumberGenerator.Create())r.GetBytes(raw);File.WriteAllBytes(k,ProtectedData.Protect(raw,null,DataProtectionScope.CurrentUser));using(var f=new FileStream(p,FileMode.CreateNew,FileAccess.Write,FileShare.None)){f.Flush(true);}
 using(var f=new FileStream(Path.Combine(directory,"ledger-head.bin"),FileMode.CreateNew,FileAccess.Write,FileShare.None)){byte[] body=Encoding.UTF8.GetBytes("0:GENESIS");byte[] mac;using(var h=new HMACSHA256(raw))mac=h.ComputeHash(body);var w=new BinaryWriter(f);w.Write(body.Length);w.Write(body);w.Write(mac);w.Flush();f.Flush(true);}Array.Clear(raw,0,raw.Length);}
 static byte[] ReadAll(FileStream f){f.Position=0;var b=new byte[checked((int)f.Length)];int off=0;while(off<b.Length){int n=f.Read(b,off,b.Length-off);if(n==0)throw new IOException("TRUNCATED_FILE");off+=n;}return b;}
 public Ledger(string directory,JavaScriptSerializer serializer,string expectedRuleset){json=serializer;ruleset=expectedRuleset;keyLock=new FileStream(Path.Combine(directory,"ledger-key.dpapi"),FileMode.Open,FileAccess.Read,FileShare.Read);key=ProtectedData.Unprotect(ReadAll(keyLock),null,DataProtectionScope.CurrentUser);
  try{file=new FileStream(Path.Combine(directory,"ledger.bin"),FileMode.Open,FileAccess.ReadWrite,FileShare.Read);var reader=new BinaryReader(file,Encoding.UTF8,true);while(file.Position<file.Length){if(file.Length-file.Position<4)throw new IOException("LEDGER_TRUNCATED");int length=reader.ReadInt32();if(length<2||length>131072||file.Length-file.Position<length+32)throw new IOException("LEDGER_TRUNCATED");byte[] data=reader.ReadBytes(length),mac=reader.ReadBytes(32);if(!Equal(mac,Mac(data)))throw new IOException("LEDGER_AUTHENTICATION_FAILED");var entry=Map(json.DeserializeObject(Encoding.UTF8.GetString(data)));if(Convert.ToString(entry["previous"])!=previous)throw new IOException("LEDGER_CHAIN_BROKEN");var body=Map(entry["body"]);Validate(body);Current=body;previous=Hex(mac);}
 anchor=new FileStream(Path.Combine(directory,"ledger-head.bin"),FileMode.Open,FileAccess.ReadWrite,FileShare.Read);byte[] head=ReadAll(anchor);if(head.Length<36)throw new IOException("LEDGER_HEAD_CORRUPT");int headLength=BitConverter.ToInt32(head,0);if(headLength<1||headLength>128||head.Length!=headLength+36)throw new IOException("LEDGER_HEAD_CORRUPT");byte[] bodyHead=new byte[headLength],tag=new byte[32];Array.Copy(head,4,bodyHead,0,headLength);Array.Copy(head,4+headLength,tag,0,32);if(!Equal(tag,Mac(bodyHead)))throw new IOException("LEDGER_HEAD_AUTHENTICATION_FAILED");string[] parts=Encoding.UTF8.GetString(bodyHead).Split(':');long sequence=long.Parse(parts[0]);long current=Current==null?0:Convert.ToInt64(Current["commit"]);if(sequence>current||sequence==current&&parts[1]!=previous)throw new IOException("LEDGER_ROLLBACK_DETECTED");if(sequence<current)WriteHead();}
  catch{keyLock.Dispose();if(file!=null)file.Dispose();if(anchor!=null)anchor.Dispose();throw;}}
 static bool Equal(byte[] a,byte[] b){int d=a.Length^b.Length;for(int i=0;i<Math.Min(a.Length,b.Length);i++)d|=a[i]^b[i];return d==0;}
 byte[] Mac(byte[] b){using(var h=new HMACSHA256(key))return h.ComputeHash(b);}
 static string Hex(byte[] b){return BitConverter.ToString(b).Replace("-","").ToLowerInvariant();}
 public static Dictionary<string,object> Map(object o){var v=o as Dictionary<string,object>;if(v==null)throw new IOException("INVALID_RECORD");return v;}
 static long EngineInteger(object value){if(!(value is int)&&!(value is long))throw new IOException("ENGINE_LINEAGE_INTEGER");return Convert.ToInt64(value);}
 static string EngineText(Dictionary<string,object> d,string field){object value;if(!d.TryGetValue(field,out value)||!(value is string))throw new IOException("ENGINE_LINEAGE_FIELD");return (string)value;}
 Dictionary<string,object> EngineMap(object value){var d=value as Dictionary<string,object>;if(d==null)throw new IOException("ENGINE_LINEAGE_RECORD");return d;}
 object[] Chain(Dictionary<string,object> map,string role){object value;if(!map.TryGetValue(role,out value)||!(value is object[]))throw new IOException("ENGINE_LINEAGE_CHAIN");var chain=(object[])value;if(chain.Length<1||chain.Length>17)throw new IOException("ENGINE_LINEAGE_BUDGET");return chain;}
 void ValidateEngines(Dictionary<string,object> body){
  bool had=Current!=null&&Current.ContainsKey("engines"),has=body.ContainsKey("engines");
  // Read legacy 0.4 records; adding a lineage is a one-time genesis migration.
  if(!has){if(had)throw new IOException("ENGINE_LINEAGE_REMOVED");return;}
  var next=EngineMap(body["engines"]);if(next.Count!=2||!next.ContainsKey("policy")||!next.ContainsKey("execution"))throw new IOException("ENGINE_LINEAGE_ROLES");
  var old=had?EngineMap(Current["engines"]):null;
  foreach(string role in new []{"policy","execution"}){
   var chain=Chain(next,role);var prior=had?Chain(old,role):null;
   if(!had&&chain.Length!=1)throw new IOException("ENGINE_LINEAGE_GENESIS");
   if(had&&(chain.Length<prior.Length||chain.Length>prior.Length+1))throw new IOException("ENGINE_LINEAGE_ROLLBACK_OR_JUMP");
   string parent="GENESIS";
   for(int i=0;i<chain.Length;i++){
    var d=EngineMap(chain[i]);if(d.Count!=6||!d.ContainsKey("schema")||!d.ContainsKey("generation")||EngineInteger(d["schema"])!=1||EngineInteger(d["generation"])!=i)throw new IOException("ENGINE_LINEAGE_DESCRIPTOR");
    string r=EngineText(d,"role"),seed=EngineText(d,"ruleset"),p=EngineText(d,"parent"),id=EngineText(d,"id");
    if(r!=role||seed!=ruleset||p!=parent)throw new IOException("ENGINE_LINEAGE_ANCESTRY");
    string expected;using(var sha=SHA256.Create())expected=Hex(sha.ComputeHash(Encoding.UTF8.GetBytes("eff-engine-v1\n"+role+"\n"+ruleset+"\n"+i+"\n"+parent)));
    if(id!=expected)throw new IOException("ENGINE_LINEAGE_ID");
    if(had&&i<prior.Length&&EngineText(EngineMap(prior[i]),"id")!=id)throw new IOException("ENGINE_LINEAGE_PREFIX");
    parent=id;
   }
  }
 }
 void ValidateDefense(Dictionary<string,object> body){
  bool had=Current!=null&&Current.ContainsKey("defense"),has=body.ContainsKey("defense");
  if(!has){if(had)throw new IOException("DEFENSE_REMOVED");return;}
  var d=Map(body["defense"]);
  if(d.Count!=4||!d.ContainsKey("schema")||!d.ContainsKey("incidents")||!d.ContainsKey("circuitOpen")||!d.ContainsKey("lastIncident")||EngineInteger(d["schema"])!=1||!(d["circuitOpen"] is bool))throw new IOException("DEFENSE_RECORD_INVALID");
  long count=EngineInteger(d["incidents"]);if(count<0||count>3||(bool)d["circuitOpen"]!=(count==3))throw new IOException("DEFENSE_BUDGET_INVALID");
  if(!had&&count!=0)throw new IOException("DEFENSE_GENESIS_INVALID");
  if(had){var prior=Map(Current["defense"]);long old=EngineInteger(prior["incidents"]);if(count<old)throw new IOException("DEFENSE_ROLLBACK");if(count>old+1)throw new IOException("DEFENSE_JUMP");if(count==old&&json.Serialize(d)!=json.Serialize(prior))throw new IOException("DEFENSE_REWRITE");}
  if(count==0){if(d["lastIncident"]!=null)throw new IOException("DEFENSE_GENESIS_INVALID");return;}
  var x=Map(d["lastIncident"]);if(x.Count!=5||!x.ContainsKey("id")||!x.ContainsKey("instance")||!x.ContainsKey("revision")||!x.ContainsKey("subject")||!x.ContainsKey("reason"))throw new IOException("DEFENSE_INCIDENT_INVALID");
  string id=EngineText(x,"id"),subject=EngineText(x,"subject"),reason=EngineText(x,"reason"),instance=EngineText(x,"instance");
  if(!System.Text.RegularExpressions.Regex.IsMatch(id,"^[a-f0-9]{32}$")||!System.Text.RegularExpressions.Regex.IsMatch(instance,"^[-a-zA-Z0-9]{16,96}$")||EngineInteger(x["revision"])<0||Array.IndexOf(new[]{"player","avatar","observer"},subject)<0||Array.IndexOf(new[]{"ENTITY_REMOVED","ENTITY_DYING","ENTITY_ZERO_HEALTH","ENTITY_INVALID_HEALTH","ENTITY_UNREGISTERED","ENTITY_DISPLACED","ENTITY_UNEXPECTED","OBSERVER_STALE"},reason)<0)throw new IOException("DEFENSE_INCIDENT_INVALID");
  if(had&&count>EngineInteger(Map(Current["defense"])["incidents"])){
   var state=Map(Current["state"]);if(instance!=Convert.ToString(state["instance"])||EngineInteger(x["revision"])!=Convert.ToInt64(state["revision"])||(Convert.ToString(state["outcome"])!="pending"&&!(Convert.ToString(state["outcome"])=="won"&&subject=="avatar"&&reason=="ENTITY_UNEXPECTED")))throw new IOException("DEFENSE_OBSERVATION_STALE");
  }
 }
 void Validate(Dictionary<string,object> body){long expected=Current==null?1:Convert.ToInt64(Current["commit"])+1;if(Convert.ToInt32(body["schema"])!=1||Convert.ToInt64(body["commit"])!=expected)throw new IOException("LEDGER_REVISION_MISMATCH");var next=Map(body["state"]);if(Current!=null){var old=Map(Current["state"]);if(!Convert.ToBoolean(old["recovery"])&&Convert.ToBoolean(next["recovery"]))throw new IOException("REVOCATION_ROLLBACK");if(Convert.ToInt64(next["revision"])<Convert.ToInt64(old["revision"]))throw new IOException("STATE_ROLLBACK");if(Convert.ToString(old["outcome"])!="pending"&&Convert.ToString(old["outcome"])!=Convert.ToString(next["outcome"]))throw new IOException("ENDING_ROLLBACK");}ValidateEngines(body);ValidateDefense(body);}
 public object Commit(long observed,Dictionary<string,object> body){if(observed!=(Current==null?0:Convert.ToInt64(Current["commit"])))throw new IOException("STALE_LEDGER_COMMIT");Validate(body);var entry=new Dictionary<string,object>{{"previous",previous},{"body",body}};byte[] data=Encoding.UTF8.GetBytes(json.Serialize(entry));if(data.Length>131072)throw new IOException("LEDGER_BUDGET");byte[] mac=Mac(data);long offset=file.Length;
  try{file.Position=offset;var w=new BinaryWriter(file,Encoding.UTF8,true);w.Write(data.Length);w.Write(data);w.Write(mac);w.Flush();file.Flush(true);}catch{try{file.SetLength(offset);file.Flush(true);}catch{}throw;}
  Current=body;previous=Hex(mac);WriteHead();return body;}
 void WriteHead(){byte[] b=Encoding.UTF8.GetBytes((Current==null?0:Convert.ToInt64(Current["commit"]))+":"+previous);anchor.Position=0;var w=new BinaryWriter(anchor,Encoding.UTF8,true);w.Write(b.Length);w.Write(b);w.Write(Mac(b));w.Flush();anchor.SetLength(anchor.Position);anchor.Flush(true);}
 public void Dispose(){file.Dispose();anchor.Dispose();keyLock.Dispose();Array.Clear(key,0,key.Length);}
}
#if EFF_LOW_INTEGRITY_EXPERIMENTAL
// Windows mandatory integrity control is the boundary MC cannot argue with: it is enforced by the OS kernel
// on every handle open, so code loaded into a Low integrity MC JVM (mods, mixins, agents, JNA/native calls)
// cannot open this guard, the controller or the worker JVMs for read/write/inject/terminate, cannot send
// window messages up (UIPI), and cannot read or write the authority directory labelled below.
public static class IntegrityBoundary {
 [StructLayout(LayoutKind.Sequential)] struct SidAndAttributes { public IntPtr Sid; public uint Attributes; }
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string sddl,uint revision,out IntPtr descriptor,IntPtr size);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetSecurityDescriptorSacl(IntPtr descriptor,out bool present,out IntPtr sacl,out bool defaulted);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode)] static extern uint SetNamedSecurityInfoW(string name,int type,uint info,IntPtr owner,IntPtr group,IntPtr dacl,IntPtr sacl);
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSidToSidW(string sid,out IntPtr psid);
 [DllImport("advapi32.dll")] static extern uint GetLengthSid(IntPtr sid);
 [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
 [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid,uint index);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool SetTokenInformation(IntPtr token,int cls,IntPtr info,uint length);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int cls,IntPtr info,uint length,out uint returned);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 const int FileObject=1,TokenIntegrityLevel=25;const uint LabelInformation=0x10,TokenQuery=0x8,TokenAdjustDefault=0x80,GroupIntegrity=0x20;
 public const uint Low=0x1000,Medium=0x2000;
 static void Label(string path,string sddl){
  IntPtr descriptor;if(!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl,1,out descriptor,IntPtr.Zero))throw new IOException("INTEGRITY_LABEL_SDDL_"+Marshal.GetLastWin32Error());
  try{bool present,defaulted;IntPtr sacl;if(!GetSecurityDescriptorSacl(descriptor,out present,out sacl,out defaulted)||!present)throw new IOException("INTEGRITY_LABEL_SACL");
   uint error=SetNamedSecurityInfoW(path,FileObject,LabelInformation,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,sacl);if(error!=0)throw new IOException("INTEGRITY_LABEL_FAILED_"+error);}
  finally{LocalFree(descriptor);}
 }
 // Medium label with no-read-up, no-write-up and no-execute-up, inherited by every file: a Low process
 // can neither read the ledger key/state nor write anything here. Medium kernel processes are unaffected.
 public static void SealAuthority(string directory){Label(directory,"S:(ML;OICI;NRNWNX;;;ME)");}
 // The only tree a Low MC may write: its own game directory.
 public static void OpenToLow(string directory){Label(directory,"S:(ML;OICI;NW;;;LW)");}
 public static uint Current(){
  IntPtr token;if(!OpenProcessToken(GetCurrentProcess(),TokenQuery,out token))throw new IOException("INTEGRITY_TOKEN_"+Marshal.GetLastWin32Error());
  try{uint size;GetTokenInformation(token,TokenIntegrityLevel,IntPtr.Zero,0,out size);IntPtr buffer=Marshal.AllocHGlobal((int)size);
   try{if(!GetTokenInformation(token,TokenIntegrityLevel,buffer,size,out size))throw new IOException("INTEGRITY_QUERY_"+Marshal.GetLastWin32Error());
    IntPtr sid=((SidAndAttributes)Marshal.PtrToStructure(buffer,typeof(SidAndAttributes))).Sid;int count=Marshal.ReadByte(GetSidSubAuthorityCount(sid));
    return (uint)Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)(count-1)));}
   finally{Marshal.FreeHGlobal(buffer);}}
  finally{CloseHandle(token);}
 }
 // Lowering one's own token is always permitted; nothing can raise it again without SeTcbPrivilege.
 public static void LowerSelf(){
  IntPtr token,sid;if(!OpenProcessToken(GetCurrentProcess(),TokenQuery|TokenAdjustDefault,out token))throw new IOException("INTEGRITY_TOKEN_"+Marshal.GetLastWin32Error());
  try{if(!ConvertStringSidToSidW("S-1-16-4096",out sid))throw new IOException("INTEGRITY_SID_"+Marshal.GetLastWin32Error());
   try{var label=new SidAndAttributes{Sid=sid,Attributes=GroupIntegrity};int size=Marshal.SizeOf(label)+(int)GetLengthSid(sid);IntPtr buffer=Marshal.AllocHGlobal(size);
    try{Marshal.StructureToPtr(label,buffer,false);if(!SetTokenInformation(token,TokenIntegrityLevel,buffer,(uint)size))throw new IOException("INTEGRITY_LOWER_"+Marshal.GetLastWin32Error());}
    finally{Marshal.FreeHGlobal(buffer);}}
   finally{LocalFree(sid);}}
  finally{CloseHandle(token);}
  if(Current()!=Low)throw new IOException("INTEGRITY_NOT_LOWERED");
 }
}
// `eff-guard.exe --low-integrity-host <game dir> <program> [args...]`, started by the controller instead of java.exe.
// It labels only the game directory writable for Low, drops itself to Low and runs MC inside a nested
// kill-on-close job, so terminating this helper (as the controller does on replacement) also ends MC.
public static class LowIntegrityHost {
 static string Argument(string a){
  if(a.Length>0&&a.IndexOfAny(new[]{' ','\t','\n','\v','"'})<0)return a;
  var b=new StringBuilder("\"");int slashes=0;
  foreach(char c in a){if(c=='\\'){slashes++;continue;}if(c=='"')b.Append('\\',slashes*2+1).Append('"');else b.Append('\\',slashes).Append(c);slashes=0;}
  return b.Append('\\',slashes*2).Append('"').ToString();
 }
 static Task Pump(Stream from,Stream to){return Task.Factory.StartNew(()=>{try{var buffer=new byte[8192];int n;while((n=from.Read(buffer,0,buffer.Length))>0){lock(to){to.Write(buffer,0,n);to.Flush();}}}catch{}},TaskCreationOptions.LongRunning);}
 public static int Run(string[] args){
  string game=Path.GetFullPath(args[1]);if(!Directory.Exists(game))throw new IOException("LOW_HOST_GAME_DIRECTORY");
  for(string p=game;p!=null;p=Path.GetDirectoryName(p))if((File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new IOException("REPARSE_POINT_REJECTED");
  IntegrityBoundary.OpenToLow(game);string temp=Path.Combine(game,"tmp");Directory.CreateDirectory(temp);
  IntegrityBoundary.LowerSelf();
  var rest=new List<string>();for(int i=3;i<args.Length;i++)rest.Add(Argument(args[i]));
  var start=new ProcessStartInfo(args[2],String.Join(" ",rest));start.UseShellExecute=false;start.CreateNoWindow=true;start.WorkingDirectory=game;
  start.RedirectStandardOutput=true;start.RedirectStandardError=true;start.EnvironmentVariables["TMP"]=temp;start.EnvironmentVariables["TEMP"]=temp;
  using(var job=new NativeJob())using(var child=Process.Start(start)){
   try{job.Add(child);}catch{child.Kill();child.WaitForExit();throw;}
   var pumps=new[]{Pump(child.StandardOutput.BaseStream,Console.OpenStandardOutput()),Pump(child.StandardError.BaseStream,Console.OpenStandardError())};
   child.WaitForExit();Task.WaitAll(pumps,5000); // a grandchild holding the pipe open must not keep the helper alive
   return child.ExitCode;
  }
 }
}
#endif
public static class Program {
 static JavaScriptSerializer Json=new JavaScriptSerializer {MaxJsonLength=2097152,RecursionLimit=96};
 static List<FileStream> locks=new List<FileStream>();static volatile bool stopping;
 static string Sha(Stream s){s.Position=0;using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
 static string LongPath(string path){return path.StartsWith(@"\\?\")?path:@"\\?\"+Path.GetFullPath(path);}
 static void NoReparse(string path){if(path.StartsWith(@"\\?\"))path=path.Substring(4);if(path.StartsWith(@"\\"))throw new IOException("CODE_NETWORK_PATH_REJECTED");for(string p=Path.GetFullPath(path);p!=null;p=Path.GetDirectoryName(p)){if((File.GetAttributes(LongPath(p))&FileAttributes.ReparsePoint)!=0)throw new IOException("REPARSE_POINT_REJECTED");}}
 static string Quote(string value){return "\""+value.Replace("\\","\\").Replace("\"","\\\"")+"\"";} // Fixed payload script has no embedded quotes/trailing slash.
 static void Event(string directory,string type,object detail){string line=Json.Serialize(new {time=DateTime.UtcNow.ToString("o"),type=type,detail=detail});File.AppendAllText(Path.Combine(directory,"guard-events.jsonl"),line+"\n",new UTF8Encoding(false));}
 static Dictionary<string,object> M(object o){return Ledger.Map(o);}
 static void CheckTrees(object trees){foreach(object item in (object[])trees){var tree=M(item);string root=(string)tree["root"];var want=new HashSet<string>(StringComparer.OrdinalIgnoreCase);foreach(object name in (object[])tree["entries"])want.Add((string)name);var actual=new HashSet<string>(StringComparer.OrdinalIgnoreCase);if(!Directory.Exists(root)){if(want.Count!=0)throw new IOException("CODE_TREE_MISSING");continue;}foreach(string f in Directory.GetFiles(LongPath(root),"*",SearchOption.AllDirectories)){NoReparse(f);actual.Add(f.Substring(LongPath(root).Length).TrimStart(Path.DirectorySeparatorChar));}if(!want.SetEquals(actual))throw new IOException("CODE_TREE_CHANGED");}}
 public static int Main(string[] args){string directory=null;try{
  if(args.Length==2&&args[0]=="--provision"){Ledger.Provision(args[1]);Console.WriteLine("LEDGER_PROVISIONED");return 0;}
#if EFF_LOW_INTEGRITY_EXPERIMENTAL
  if(args.Length>=3&&args[0]=="--low-integrity-host")return LowIntegrityHost.Run(args);
  if(args.Length==1&&args[0]=="--integrity"){Console.WriteLine(IntegrityBoundary.Current()==IntegrityBoundary.Low?"low":IntegrityBoundary.Current()>=IntegrityBoundary.Medium?"medium-or-higher":"other");return 0;}
#endif
  if(args.Length!=2)throw new IOException("EXPECTED_MANIFEST_AND_PIN");NoReparse(args[0]);
  var manifestLock=new FileStream(args[0],FileMode.Open,FileAccess.Read,FileShare.Read);locks.Add(manifestLock);if(!String.Equals(Sha(manifestLock),args[1],StringComparison.OrdinalIgnoreCase))throw new IOException("SEAL_MISMATCH");if(manifestLock.Length>2097152)throw new IOException("SEAL_BUDGET");manifestLock.Position=0;string text;using(var r=new StreamReader(manifestLock,Encoding.UTF8,true,4096,true))text=r.ReadToEnd();var seal=M(Json.DeserializeObject(text));if(Convert.ToInt32(seal["schema"])!=1)throw new IOException("SEAL_SCHEMA");
  foreach(object item in (object[])seal["files"]){var f=M(item);string path=(string)f["path"];NoReparse(path);var held=new FileStream(LongPath(path),FileMode.Open,FileAccess.Read,FileShare.Read);locks.Add(held);if(held.Length!=Convert.ToInt64(f["size"]))throw new IOException("CODE_SIZE_MISMATCH");if(!String.Equals(Sha(held),(string)f["sha256"],StringComparison.OrdinalIgnoreCase))throw new IOException("CODE_HASH_MISMATCH");}
  CheckTrees(seal["trees"]);var config=M(seal["config"]);directory=(string)config["directory"];NoReparse(directory);
#if EFF_LOW_INTEGRITY_EXPERIMENTAL
  IntegrityBoundary.SealAuthority(directory);
#endif
  Console.CancelKeyPress+=(s,e)=>{e.Cancel=true;stopping=true;};
  string ruleset=null;foreach(object item in (object[])seal["files"]){var f=M(item);if(String.Equals(Path.GetFullPath((string)f["path"]),Path.GetFullPath((string)config["workerJar"]),StringComparison.OrdinalIgnoreCase))ruleset=(string)f["sha256"];}if(ruleset==null)throw new IOException("WORKER_RULESET_NOT_SEALED");
  using(var ledger=new Ledger(directory,Json,ruleset)){
   Event(directory,"guard-ready",new {pid=Process.GetCurrentProcess().Id,files=locks.Count});
   var failures=new Queue<long>();var clock=Stopwatch.StartNew();int generation=0,restarts=0;
   while(!stopping){CheckTrees(seal["trees"]);generation++;using(var job=new NativeJob()){
    var start=new ProcessStartInfo((string)seal["node"],"--max-old-space-size=96 --disable-proto=throw --no-addons "+Quote((string)seal["child"]));start.UseShellExecute=false;start.CreateNoWindow=true;start.RedirectStandardInput=true;start.RedirectStandardOutput=true;start.RedirectStandardError=true;start.StandardOutputEncoding=Encoding.UTF8;start.StandardErrorEncoding=Encoding.UTF8;start.WorkingDirectory=(string)seal["payload"];
    foreach(string k in new List<string>(Keys(start.EnvironmentVariables)))if(k.StartsWith("NODE_",StringComparison.OrdinalIgnoreCase)||k.StartsWith("EFF_",StringComparison.OrdinalIgnoreCase)||k.Equals("JAVA_TOOL_OPTIONS",StringComparison.OrdinalIgnoreCase)||k.Equals("JDK_JAVA_OPTIONS",StringComparison.OrdinalIgnoreCase)||k.Equals("_JAVA_OPTIONS",StringComparison.OrdinalIgnoreCase))start.EnvironmentVariables.Remove(k);
    using(var child=Process.Start(start)){
     bool graceful=false;try{try{job.Add(child);}catch{child.Kill();child.WaitForExit();throw;}Event(directory,"controller-start",new {pid=child.Id,generation=generation});
      // The child cannot spawn any JVM until it receives this message after job assignment.
      Send(child,Json.Serialize(new {op="boot",generation=generation,config=config}));
      var errors=new StringBuilder();Task.Factory.StartNew(()=>{try{var buffer=new char[1024];int n;while((n=child.StandardError.Read(buffer,0,buffer.Length))>0)lock(errors){if(errors.Length<32768)errors.Append(buffer,0,Math.Min(n,32768-errors.Length));}}catch{}},TaskCreationOptions.LongRunning);
      Task<string> line=Task.Factory.StartNew(()=>ReadLine(child.StandardOutput));long last=clock.ElapsedMilliseconds,nextTree=last;bool ready=false;
      while(!stopping&&!child.HasExited){
       if(line.IsCompleted){string raw=line.Result;if(raw==null)break;if(raw.Length>262144)throw new IOException("GUARD_MESSAGE_BUDGET");var r=M(Json.DeserializeObject(raw));string op=Convert.ToString(r["op"]);object result=null;string error=null;
        if(op=="pulse"){last=clock.ElapsedMilliseconds;ready=true;}
        else if(op=="load")result=ledger.Current;
        else if(op=="commit"){try{result=ledger.Commit(Convert.ToInt64(r["previous"]),M(r["body"]));}catch(IOException e){if(!(e.Message.StartsWith("STALE_")||e.Message.StartsWith("STATE_")||e.Message.StartsWith("ENDING_")||e.Message.StartsWith("REVOCATION_")||e.Message.StartsWith("LEDGER_REVISION")||e.Message.StartsWith("ENGINE_LINEAGE_")||e.Message.StartsWith("DEFENSE_")))throw;error=e.Message;}}
        else if(op=="verify"){CheckTrees(seal["trees"]);result=new {verified=true};}
        else if(op=="stopped"){graceful=true;break;}
        else throw new IOException("GUARD_OP_NOT_ALLOWED");
        if(r.ContainsKey("id")){Send(child,Json.Serialize(new {id=r["id"],ok=error==null,result=result,error=error}));}
        line=Task.Factory.StartNew(()=>ReadLine(child.StandardOutput));
       }
       if(clock.ElapsedMilliseconds-last>(ready?15000:30000))throw new IOException("CONTROLLER_PROGRESS_TIMEOUT");
       if(clock.ElapsedMilliseconds>=nextTree){CheckTrees(seal["trees"]);nextTree=clock.ElapsedMilliseconds+1000;}
       Thread.Sleep(5);
      }
     }catch(IOException e){if(e.Message!="CONTROLLER_PROGRESS_TIMEOUT")throw;Event(directory,"controller-stalled",new {pid=child.Id});}finally{job.Drain();Event(directory,"job-drained",new {rootPid=child.Id,generation=generation,active=job.Active(),peakCommittedBytes=job.PeakMemoryBytes()});}
     if(stopping||graceful){Event(directory,"guard-stop",new {graceful=graceful});break;}
     // Do not revive persistent attacks indefinitely. Time decisions use Stopwatch, not wall time.
     long now=clock.ElapsedMilliseconds;while(failures.Count>0&&now-failures.Peek()>60000)failures.Dequeue();if(failures.Count>=3||++restarts>6)throw new IOException("CONTROLLER_RESTART_BUDGET");failures.Enqueue(now);Event(directory,"controller-recovery",new {generation=generation});Thread.Sleep(250*failures.Count);
    }
   }}
  }
  return 0;
 }catch(Exception e){Console.Error.WriteLine("EFF_GUARD_"+e.Message);if(directory!=null)try{Event(directory,"guard-failed",new {error=e.Message});}catch{}return 2;}
 finally{foreach(var f in locks)f.Dispose();}}
 static void Send(Process process,string text){byte[] b=Encoding.UTF8.GetBytes(text+Environment.NewLine);process.StandardInput.BaseStream.Write(b,0,b.Length);process.StandardInput.BaseStream.Flush();}
 static string ReadLine(TextReader input){var b=new StringBuilder();int ch;while((ch=input.Read())!=-1){if(ch==10)return b.ToString();if(b.Length>=262144)throw new IOException("GUARD_MESSAGE_BUDGET");if(ch!=13)b.Append((char)ch);}return b.Length==0?null:b.ToString();}
 static IEnumerable<string> Keys(System.Collections.Specialized.StringDictionary d){foreach(string key in d.Keys)yield return key;}
}
}
