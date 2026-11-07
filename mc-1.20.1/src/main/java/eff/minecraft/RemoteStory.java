package eff.minecraft;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** A data-only lease to the separately supervised Low narrative process. */
public final class RemoteStory {
  private final URI endpoint;
  private final String lease, slot;
  public static boolean enabled() { return System.getenv("EFF_STORY_ENDPOINT") != null; }
  public RemoteStory(Path save) throws Exception {
    endpoint = URI.create(System.getenv("EFF_STORY_ENDPOINT") + "/v1/story");
    lease = System.getenv("EFF_STORY_LEASE");
    if (!"http".equals(endpoint.getScheme()) || !"127.0.0.1".equals(endpoint.getHost())
        || endpoint.getPort() < 1 || endpoint.getUserInfo() != null
        || lease == null || !lease.matches("[a-f0-9]{64}")) throw new IOException("STORY_ENDPOINT");
    // An opaque namespace, never a host-selected filesystem path in the service.
    slot = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(
        save.toAbsolutePath().normalize().toString().getBytes(StandardCharsets.UTF_8)));
    call(Jsons.obj("op", "open"));
    BootstrapDiagnostics.note("external-story-connected", "low-loopback");
  }
  public JsonObject call(JsonObject request) throws IOException {
    String id = UUID.randomUUID().toString();
    String raw = Jsons.obj("id", id, "slot", slot, "request", request).toString();
    byte[] bytes = raw.getBytes(StandardCharsets.UTF_8);
    if (bytes.length > 16384) throw new IOException("STORY_REQUEST_BUDGET");
    HttpURLConnection connection = (HttpURLConnection) endpoint.toURL().openConnection(Proxy.NO_PROXY);
    try {
      connection.setConnectTimeout(2000); connection.setReadTimeout(90000);
      connection.setInstanceFollowRedirects(false); connection.setRequestMethod("POST");
      connection.setDoOutput(true); connection.setFixedLengthStreamingMode(bytes.length);
      connection.setRequestProperty("Content-Type", "application/json");
      connection.setRequestProperty("X-EFF-Auth", sign("request:" + raw));
      try (OutputStream out = connection.getOutputStream()) { out.write(bytes); }
      InputStream stream = connection.getResponseCode() == 200 ? connection.getInputStream() : connection.getErrorStream();
      if (stream == null) throw new IOException("STORY_UNAVAILABLE");
      byte[] replyBytes;
      try (stream) { replyBytes = stream.readNBytes(400001); }
      if (replyBytes.length > 400000) throw new IOException("STORY_REPLY_BUDGET");
      String rawReply = new String(replyBytes, StandardCharsets.UTF_8);
      String signature = connection.getHeaderField("X-EFF-Auth");
      if (signature == null || !MessageDigest.isEqual(sign("reply:" + rawReply).getBytes(StandardCharsets.UTF_8), signature.getBytes(StandardCharsets.UTF_8))) throw new IOException("STORY_REPLY_AUTH");
      JsonObject reply = JsonParser.parseString(rawReply).getAsJsonObject();
      if (!id.equals(Jsons.s(reply, "id"))) throw new IOException("STORY_REPLY_ID");
      if (!Jsons.b(reply, "ok")) throw new IOException(Jsons.s(reply, "error"));
      return Jsons.o(reply, "result");
    } finally { connection.disconnect(); }
  }
  private String sign(String value) throws IOException {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(lease.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    } catch (java.security.GeneralSecurityException e) { throw new IOException("STORY_HMAC", e); }
  }
}
