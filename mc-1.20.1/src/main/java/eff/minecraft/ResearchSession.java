package eff.minecraft;

import com.google.gson.JsonObject;

/** Common native research surface; managed and single-JVM implementations expose the same UI. */
public interface ResearchSession extends AutoCloseable {
  JsonObject snapshot();

  JsonObject observation();

  JsonObject execute(String source, int revision, String actor);

  boolean needsCounter();

  int revision();

  boolean checkpointOnDisk(String handle);

  void requested();

  void retryCounter();

  void recordRejected(String source, String actor, String reason);

  void modelNote(JsonObject p);

  void advice(JsonObject p);

  boolean won();

  void project();

  void tick();

  JsonObject recentReceipt();

  void close();
}
