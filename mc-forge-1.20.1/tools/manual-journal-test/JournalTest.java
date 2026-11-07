package eff.minecraft.client;
import java.nio.file.*;
public class JournalTest {
 public static void main(String[] args) throws Exception {
  Path dir=Path.of(args[0]);Files.createDirectories(dir);
  var journal=new ManualTraceJournal(dir,100);
  for(int i=0;i<200;i++)journal.append("{\"sequence\":"+i+",\"failed\":"+(i>=10)+"}",i==10);
  String loss=Files.readString(dir.resolve("manual-first-structural-loss.json"));
  if(!loss.contains("\"sequence\":10"))throw new AssertionError("First failure lost");
  if(Files.size(dir.resolve("manual-scene-trace.jsonl"))>100||Files.size(dir.resolve("manual-scene-trace.previous.jsonl"))>100)throw new AssertionError("Unbounded trace");
  if(!Files.readString(dir.resolve("manual-scene-trace.jsonl")).contains("199"))throw new AssertionError("Observation stopped at budget");
  try{journal.append("replacement",true);throw new AssertionError("First loss overwritten");}catch(FileAlreadyExistsException expected){}
  if(!Files.readString(dir.resolve("manual-first-structural-loss.json")).equals(loss))throw new AssertionError("First loss changed");
  // First failure persists even when the following trace record cannot fit.
  Path small=dir.resolve("oversized");Files.createDirectory(small);
  try{new ManualTraceJournal(small,1).append("failure",true);throw new AssertionError("Limit ignored");}catch(java.io.IOException expected){}
  if(!Files.readString(small.resolve("manual-first-structural-loss.json")).equals("failure"))throw new AssertionError("Failure suppressed by budget");
  System.out.println("PASS journal: 200 observations beyond budget, bounded segments, first failure survives rotation/oversize; no Minecraft execution");
 }
}
