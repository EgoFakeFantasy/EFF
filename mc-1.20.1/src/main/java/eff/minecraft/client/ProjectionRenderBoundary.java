package eff.minecraft.client;

import com.mojang.blaze3d.vertex.PoseStack;
import eff.minecraft.EffProjection;
import eff.minecraft.ProjectionProbe;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.world.entity.Entity;

/** Scoped normal LevelRenderer path, not an overlay or a retained-entity redraw.
 * Ordinary entities retain the installed dispatcher. Claimed projections use their
 * registered renderer, current storage, real health, vanilla frustum and coordinates. */
public final class ProjectionRenderBoundary {
  private static volatile EffProjectionRenderer renderer;
  private static final java.util.WeakHashMap<Entity, long[]> draws = new java.util.WeakHashMap<>();
  private static final java.util.WeakHashMap<Entity, long[]> renderEvents = new java.util.WeakHashMap<>();
  // Read-only per-original-object routing evidence. No cached entity is rendered from this map.
  private static final java.util.WeakHashMap<Entity, long[]> culls = new java.util.WeakHashMap<>();
  private static long candidateCalls, frustumCalls, dispatchCalls;
  public static long candidateCalls() { return candidateCalls; }
  public static long frustumCalls() { return frustumCalls; }
  public static long dispatchCalls() { return dispatchCalls; }

  static void registered(EffProjectionRenderer value) { renderer = value; }
  public static EffProjectionRenderer renderer() { return renderer; }

  public static boolean current(Entity entity) {
    if (!(entity instanceof EffProjection projection) || !projection.rejectLifetimeMutation()) return false;
    Float health = ProjectionProbe.storedHealth(projection);
    return ProjectionProbe.clientEntityById(entity.level(), entity.getId()) == entity
        && "null".equals(ProjectionProbe.rawRemovalReason(entity))
        && health != null && Float.isFinite(health) && health > 0 && projection.deathTime == 0
        && Boolean.FALSE.equals(ProjectionProbe.rawDead(projection));
  }

  public static Iterable<Entity> entities(ClientLevel level) {
    candidateCalls++;
    Iterable<Entity> ordinary = level.entitiesForRendering();
    var current = ProjectionProbe.currentClientProjections(level);
    if (current.isEmpty()) return ordinary;
    var merged = new java.util.ArrayList<Entity>();
    var seen = new java.util.IdentityHashMap<Entity, Boolean>();
    for (Entity entity : ordinary) if (seen.put(entity, Boolean.TRUE) == null) merged.add(entity);
    for (Entity entity : current) if (current(entity) && seen.put(entity, Boolean.TRUE) == null) merged.add(entity);
    return merged;
  }

  public static boolean shouldRender(EntityRenderDispatcher dispatcher, Entity entity, Frustum frustum,
      double x, double y, double z) {
    frustumCalls++;
    if (!(entity instanceof EffProjection projection) || !projection.rejectLifetimeMutation())
      return dispatcher.shouldRender(entity, frustum, x, y, z);
    EffProjectionRenderer owned = renderer;
    long[] receipt = culls.computeIfAbsent(entity, ignored -> new long[8]);
    receipt[0]++; receipt[1] = System.nanoTime();
    if (!current(entity)) { receipt[4]++; receipt[7] = 1; return false; }
    if (owned == null) { receipt[5]++; receipt[7] = 2; return false; }
    try {
      boolean result = owned.shouldRender(projection, frustum, x, y, z);
      receipt[result ? 2 : 3]++; receipt[7] = result ? 3 : 4;
      return result;
    } catch (RuntimeException | LinkageError error) {
      receipt[6]++; receipt[7] = 5; throw error;
    }
  }

  public static void render(EntityRenderDispatcher dispatcher, Entity entity, double x, double y, double z,
      float yaw, float partialTick, PoseStack pose, MultiBufferSource buffers, int light) {
    dispatchCalls++;
    if (!(entity instanceof EffProjection projection) || !projection.rejectLifetimeMutation()) {
      dispatcher.render(entity, x, y, z, yaw, partialTick, pose, buffers, light); return;
    }
    EffProjectionRenderer owned = renderer;
    if (!current(entity) || owned == null) return;
    var offset = owned.getRenderOffset(projection, partialTick);
    pose.pushPose();
    try {
      pose.translate(x + offset.x, y + offset.y, z + offset.z);
      // The same live object, animation state, light and normal world buffers. No
      // death-state reset, ghost snapshot, world insertion or second stage draw.
      owned.render(projection, yaw, partialTick, pose, buffers, light);
      long[] receipt = draws.computeIfAbsent(entity, ignored -> new long[2]);
      receipt[0]++; receipt[1] = System.nanoTime();
    } finally { pose.popPose(); }
  }

  public static long drawCount(Entity entity) { long[] value = draws.get(entity); return value == null ? 0 : value[0]; }
  public static long lastDrawNanos(Entity entity) { long[] value = draws.get(entity); return value == null ? 0 : value[1]; }
  public static com.google.gson.JsonObject cullingDiagnostic(Entity entity) {
    long[] value = culls.get(entity);
    if (value == null) return eff.minecraft.Jsons.obj("observed", false);
    String[] reasons = {"UNOBSERVED", "CURRENT_OBJECT_REJECTED", "RENDERER_ABSENT",
        "RENDERER_ACCEPTED", "RENDERER_REJECTED", "RENDERER_THREW"};
    return eff.minecraft.Jsons.obj("observed", true, "calls", value[0],
        "lastCallAgeMs", (System.nanoTime() - value[1]) / 1_000_000L,
        "accepted", value[2], "rejected", value[3], "currentRejected", value[4],
        "rendererAbsent", value[5], "exceptions", value[6], "lastDecision", reasons[(int)value[7]],
        "scope", "actual-routing-decisions-not-visible-pixel-proof");
  }
  public static void observedRenderEvent(Entity entity, boolean pose, boolean shader, boolean cancelled) {
    long[] value = renderEvents.computeIfAbsent(entity, ignored -> new long[4]);
    value[0]++; if (pose) value[1]++; if (shader) value[2]++; if (cancelled) value[3]++;
  }
  public static com.google.gson.JsonObject renderEventDiagnostic(Entity entity) {
    long[] value = renderEvents.get(entity);
    return eff.minecraft.Jsons.obj("callbacks", value == null ? 0 : value[0],
        "isolatedPoseChanges", value == null ? 0 : value[1],
        "isolatedShaderChanges", value == null ? 0 : value[2],
        "observerCancellationRequests", value == null ? 0 : value[3]);
  }
  private ProjectionRenderBoundary() {}
}
