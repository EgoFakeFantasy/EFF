package eff.minecraft.client;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

/** Two bounded trace segments; first loss survives rotation. Never touches game state. */
final class ManualTraceJournal {
  static final long SEGMENT_BYTES = 32L * 1024 * 1024;
  private final Path current, previous, firstLoss;
  private final long limit;
  private long bytes;

  ManualTraceJournal(Path directory) throws IOException { this(directory, SEGMENT_BYTES); }
  ManualTraceJournal(Path directory, long limit) throws IOException {
    if (limit < 1) throw new IllegalArgumentException("TRACE_SEGMENT_LIMIT");
    this.limit = limit;
    current = directory.resolve("manual-scene-trace.jsonl");
    previous = directory.resolve("manual-scene-trace.previous.jsonl");
    firstLoss = directory.resolve("manual-first-structural-loss.json");
    bytes = Files.exists(current) ? Files.size(current) : 0;
  }

  void append(String evidence, boolean firstFailure) throws IOException {
    // A full journal must never suppress the first loss. CREATE_NEW cannot overwrite it.
    if (firstFailure) Files.writeString(firstLoss, evidence, StandardOpenOption.CREATE_NEW);
    byte[] line = (evidence + "\n").getBytes(StandardCharsets.UTF_8);
    if (line.length > limit) throw new IOException("MANUAL_TRACE_RECORD_TOO_LARGE");
    if (bytes + line.length > limit) {
      // Same-directory atomic replacement: reader retries if rotation races its read.
      Files.move(current, previous, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
      bytes = 0;
    }
    Files.write(current, line, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    bytes += line.length;
  }
}
