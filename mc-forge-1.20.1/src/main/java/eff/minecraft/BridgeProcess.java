package eff.minecraft;

import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.*;
import net.minecraftforge.fml.loading.FMLPaths;

/**
 * Owned stdio child. The protocol transports data; it has no command or source-evaluation
 * operation.
 */
public final class BridgeProcess implements AutoCloseable {
  private final Process child;
  private final BufferedWriter writer;
  private final ConcurrentMap<Integer, CompletableFuture<JsonObject>> pending =
      new ConcurrentHashMap<>();
  private final AtomicInteger ids = new AtomicInteger();
  private volatile boolean closed;

  public BridgeProcess(Path saveDir) throws Exception {
    byte[] zip;
    try (InputStream in = BridgeProcess.class.getResourceAsStream("/eff-story-runtime.zip")) {
      if (in == null) throw new IOException("STORY_BUNDLE_MISSING");
      zip = in.readAllBytes();
    }
    String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(zip));
    String sealedRuntime = System.getenv("EFF_STORY_RUNTIME");
    Path runtime =
        sealedRuntime != null
            ? Path.of(sealedRuntime).toAbsolutePath().normalize()
            : FMLPaths.CONFIGDIR
                .get()
                .resolve("eff/runtime")
                .resolve(hash)
                .toAbsolutePath()
                .normalize();
    if (sealedRuntime == null) {
      Files.createDirectories(runtime);
      int total = 0;
      try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
        ZipEntry e;
        while ((e = in.getNextEntry()) != null) {
          if (e.isDirectory()) continue;
          Path target = runtime.resolve(e.getName()).normalize();
          if (!target.startsWith(runtime) || e.getName().contains("\\"))
            throw new IOException("INVALID_BUNDLE_PATH");
          byte[] data = in.readNBytes(4000001);
          total += data.length;
          if (data.length > 4000000 || total > 32000000) throw new IOException("BUNDLE_TOO_LARGE");
          Files.createDirectories(target.getParent());
          for (Path p = target; p != null && p.startsWith(runtime); p = p.getParent())
            if (Files.isSymbolicLink(p)) throw new IOException("BUNDLE_SYMLINK");
          Files.write(target, data);
        }
      }
    }
    if (!Files.isRegularFile(runtime.resolve("bridge/server.cjs")))
      throw new IOException("STORY_RUNTIME_MISSING");
    Files.createDirectories(saveDir);
    String node = System.getProperty("eff.node", "node");
    List<String> command = new ArrayList<>();
    command.add(node);
    if (Boolean.getBoolean("eff.lowMemory")) command.add("--max-old-space-size=96");
    command.add(runtime.resolve("bridge/server.cjs").toString());
    command.add(saveDir.toAbsolutePath().toString());
    ProcessBuilder builder =
        new ProcessBuilder(command)
            .directory(runtime.toFile())
            .redirectError(
                ProcessBuilder.Redirect.appendTo(saveDir.resolve("bridge.log").toFile()));
    builder
        .environment()
        .keySet()
        .removeIf(k -> k.toUpperCase(java.util.Locale.ROOT).startsWith("EFF_RUNTIME_"));
    child = builder.start();
    writer =
        new BufferedWriter(new OutputStreamWriter(child.getOutputStream(), StandardCharsets.UTF_8));
    Thread reader =
        new Thread(
            () -> {
              try (BufferedReader input =
                  new BufferedReader(
                      new InputStreamReader(child.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = input.readLine()) != null) {
                  if (line.length() > 400000) throw new IOException("BRIDGE_REPLY_BUDGET");
                  JsonObject reply = JsonParser.parseString(line).getAsJsonObject();
                  CompletableFuture<JsonObject> f = pending.remove(Jsons.i(reply, "id"));
                  if (f != null) {
                    if (Jsons.b(reply, "ok")) f.complete(Jsons.o(reply, "result"));
                    else f.completeExceptionally(new IOException(Jsons.s(reply, "error")));
                  }
                }
              } catch (Exception e) {
                fail(e);
              } finally {
                fail(new IOException("BRIDGE_STOPPED"));
              }
            },
            "EFF bridge reader");
    reader.setDaemon(true);
    reader.start();
  }

  public CompletableFuture<JsonObject> request(JsonObject req) {
    if (closed || !child.isAlive())
      return CompletableFuture.failedFuture(new IOException("BRIDGE_STOPPED"));
    if (pending.size() >= 4) return CompletableFuture.failedFuture(new IOException("BRIDGE_BUSY"));
    int id = ids.incrementAndGet();
    CompletableFuture<JsonObject> f = new CompletableFuture<>();
    pending.put(id, f);
    try {
      synchronized (writer) {
        writer.write(Jsons.obj("id", id, "request", req).toString());
        writer.newLine();
        writer.flush();
      }
    } catch (IOException e) {
      pending.remove(id);
      f.completeExceptionally(e);
    }
    return f.orTimeout(100, TimeUnit.SECONDS);
  }

  private void fail(Exception e) {
    pending.values().forEach(f -> f.completeExceptionally(e));
    pending.clear();
  }

  public void close() {
    if (closed) return;
    try {
      synchronized (writer) {
        writer.write(
            Jsons.obj("id", ids.incrementAndGet(), "request", Jsons.obj("op", "close")).toString());
        writer.newLine();
        writer.flush();
        writer.close();
      }
    } catch (IOException ignored) {
    }
    closed = true;
    CompletableFuture.runAsync(
        () -> {
          try {
            if (!child.waitFor(1500, TimeUnit.MILLISECONDS)) child.destroy();
          } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            child.destroy();
          }
        });
    fail(new IOException("SESSION_CLOSED"));
  }
}
