package eff.minecraft;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Rotations;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.*;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.*;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.item.*;
import net.minecraft.world.level.*;
import net.minecraft.world.level.block.*;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.phys.Vec3;

/** All block edits and teleports are confined to this mod's dimension and generation. */
public final class EffArena {
  public static final ResourceKey<Level> DIM =
      ResourceKey.create(
          Registries.DIMENSION, Identifier.fromNamespaceAndPath("eff", "phenomenon"));
  public final ServerPlayer player;
  public final MinecraftServer server;
  public final ServerLevel world;
  private final ServerLevel returnWorld;
  private final Vec3 returnPos;
  private final float returnYaw, returnPitch;
  private final GameType returnMode;
  private final net.minecraft.world.entity.player.Abilities.Packed returnAbilities;
  private final boolean previousFrozen, previousGravity;
  private final Path ticket;
  private final List<Entity> actors = new ArrayList<>();
  private final Map<String, ArmorStand> npcActors = new HashMap<>();
  private ArmorStand shardActor;
  private final int previousFood;
  private final float previousSaturation;
  private final List<ArmorStand> accusation = new ArrayList<>();
  private final ArrayDeque<Placement> construction = new ArrayDeque<>();
  private String area = "", stage = "", lastPose = "";
  private float stageYaw, stagePitch;
  private double flightY;
  private boolean pastApplied;
  private int appliedPastStep;
  private final List<Placement> historyAnchor = new ArrayList<>();
  private int generation = 0, origin = 0, cinemaSeen = -1, ticks = 0, cols, rows;
  private boolean entered = false,
      closed = false,
      exitOpen = false,
      attributionRejected = false,
      bodyFree = false;
  private Vec3 bound = Vec3.ZERO;
  private JsonObject state = new JsonObject();
  private ArmorStand body;

  private record Placement(BlockPos pos, BlockState block) {}

  public EffArena(ServerPlayer p, Path save) throws Exception {
    player = p;
    server = p.level().getServer();
    world = server.getLevel(DIM);
    if (world == null)
      throw new IllegalStateException(
          "EFF_DIMENSION_MISSING: create or reopen the world with the mod enabled");
    if (server.isDedicatedServer() || server.getPlayerList().getPlayerCount() != 1)
      throw new IllegalStateException("EFF_SINGLEPLAYER_ONLY");
    returnWorld = p.level();
    returnPos = p.position();
    returnYaw = p.getYRot();
    returnPitch = p.getXRot();
    returnMode = p.gameMode();
    returnAbilities = p.getAbilities().pack();
    previousFood = p.getFoodData().getFoodLevel();
    previousSaturation = p.getFoodData().getSaturationLevel();
    previousFrozen = server.tickRateManager().isFrozen();
    previousGravity = p.isNoGravity();
    Files.createDirectories(save);
    ticket = save.resolve("return-ticket.json");
    Files.writeString(
        ticket,
        Jsons.obj(
                "dimension",
                returnWorld.dimension().identifier().toString(),
                "x",
                returnPos.x,
                "y",
                returnPos.y,
                "z",
                returnPos.z,
                "yaw",
                returnYaw,
                "pitch",
                returnPitch,
                "mode",
                returnMode.getName(),
                "invulnerable",
                p.getAbilities().invulnerable,
                "flying",
                p.getAbilities().flying,
                "mayfly",
                p.getAbilities().mayfly,
                "instabuild",
                p.getAbilities().instabuild,
                "mayBuild",
                p.getAbilities().mayBuild,
                "flySpeed",
                p.getAbilities().getFlyingSpeed(),
                "walkSpeed",
                p.getAbilities().getWalkingSpeed(),
                "noGravity",
                previousGravity,
                "frozen",
                previousFrozen,
                "food",
                previousFood,
                "saturation",
                previousSaturation)
            .toString());
  }

  public void apply(JsonObject update) {
    if (closed) return;
    state = update;
    JsonObject story = Jsons.o(state, "story"),
        cue = Jsons.o(state, "cinema"),
        visual = Jsons.o(story, "stage");
    String next = Jsons.s(story, "area"), special = Jsons.s(visual, "scene");
    boolean rebuild =
        Jsons.i(cue, "serial") != cinemaSeen && Jsons.s(cue, "kind").equals("rebuild");
    cinemaSeen = Jsons.i(cue, "serial");
    if (!next.equals(area) || !special.equals(stage) || rebuild) {
      area = next;
      stage = special;
      build(story);
    }
    JsonObject battle = Jsons.o(state, "battle");
    boolean hasBattle = state.has("battle") && !state.get("battle").isJsonNull();
    boolean oldBodyFree = bodyFree;
    bodyFree = !hasBattle || Jsons.s(battle, "bodyOwner").equals("player");
    boolean newExit = hasBattle && Jsons.s(battle, "endingLock").equals("uncommitted");
    boolean newAttribution = hasBattle && Jsons.s(battle, "attribution").equals("rejected");
    if (newExit != exitOpen || newAttribution != attributionRejected || bodyFree != oldBodyFree) {
      exitOpen = newExit;
      attributionRejected = newAttribution;
      writeClaims();
    }
    boolean possessed = Jsons.s(Jsons.o(state, "battle"), "bodyOwner").equals("intruder");
    if (possessed) {
      double x = origin + cols + Math.sin(ticks * .018) * 5;
      player.teleportTo(x, 65, Math.min(rows * 2 - 5, 17));
      player.setDeltaMovement(Vec3.ZERO);
      return;
    }
    boolean dialogue = Jsons.b(Jsons.o(story, "dialog"), "active"),
        pause = Jsons.b(state, "paused") || Jsons.b(state, "pending");
    server.tickRateManager().setFrozen(previousFrozen || hasBattle && !bodyFree || pause);
    if (entered && construction.isEmpty() && dialogue) {
      JsonObject pose = Jsons.o(story, "pose");
      String key = Jsons.d(pose, "x") + ":" + Jsons.d(pose, "z");
      if (!key.equals(lastPose)) {
        lastPose = key;
        bound = position(Jsons.d(pose, "x"), Jsons.d(pose, "z"));
        teleport(bound);
      }
    }
    if (ready()) syncNPCs(story);
    if (body != null) {
      String pose = Jsons.s(visual, "pose");
      body.setBodyPose(
          new Rotations(pose.equals("bound") ? 28 : 0, 0, pose.equals("kneel") ? 15 : 0));
      body.setRightArmPose(new Rotations(pose.equals("bound") ? -80 : 10, 0, -10));
    }
  }

  private void add(int x, int y, int z, Block block) {
    construction.add(new Placement(new BlockPos(x, y, z), block.defaultBlockState()));
  }

  private Block floor(int x, int z) {
    if (area.equals("blood"))
      return (x * 7 + z * 13) % 17 < 4
          ? Blocks.RED_NETHER_BRICKS
          : Blocks.POLISHED_BLACKSTONE_BRICKS;
    if (area.startsWith("house"))
      return (x + z) % 4 == 0 ? Blocks.STRIPPED_DARK_OAK_WOOD : Blocks.SPRUCE_PLANKS;
    if (area.equals("garden")) return (x + z) % 9 == 0 ? Blocks.MOSS_BLOCK : Blocks.GRASS_BLOCK;
    if (area.equals("rain")) return Blocks.DARK_PRISMARINE;
    return (x + z) % 5 == 0 ? Blocks.CHISELED_DEEPSLATE : Blocks.DEEPSLATE_TILES;
  }

  private Vec3 position(double x, double z) {
    return new Vec3(origin + x * 2, 65, z * 2);
  }

  private void teleport(Vec3 pos) {
    player.teleport(
        new TeleportTransition(
            world,
            pos,
            Vec3.ZERO,
            player.getYRot(),
            player.getXRot(),
            TeleportTransition.DO_NOTHING));
  }

  private void build(JsonObject story) {
    generation++;
    origin = 256 * generation;
    pastApplied = false;
    appliedPastStep = 0;
    historyAnchor.clear();
    flightY = 73;
    construction.clear();
    actors.forEach(Entity::discard);
    actors.clear();
    npcActors.clear();
    shardActor = null;
    accusation.clear();
    body = null;
    JsonArray grid = Jsons.a(story, "grid");
    rows = grid.size();
    cols = rows == 0 ? 0 : grid.get(0).getAsString().length();
    if (rows > 80 || cols > 80 || rows < 1 || cols < 1)
      throw new IllegalStateException("INVALID_MAP_GEOMETRY");
    for (int z = 0; z < rows * 2; z++)
      for (int x = 0; x < cols * 2; x++) {
        char tile = grid.get(z / 2).getAsString().charAt(x / 2);
        add(origin + x, 64, z, floor(x, z));
        if (tile == '#')
          for (int y = 65; y < 69; y++)
            add(
                origin + x,
                y,
                z,
                (x + z) % 7 == 0 ? Blocks.CRACKED_DEEPSLATE_BRICKS : Blocks.DEEPSLATE_BRICKS);
        if (tile == 'b' && area.equals("blood")) add(origin + x, 65, z, Blocks.CARPET.red());
        if (tile == 'x' && x % 2 == 0 && z % 2 == 0) add(origin + x, 65, z, Blocks.BLACKSTONE_SLAB);
        if (x % 2 == 0 && z % 2 == 0 && area.startsWith("house")) {
          Block prop =
              switch (tile) {
                case 'f' -> Blocks.BOOKSHELF;
                case 'F' -> Blocks.SPRUCE_SLAB;
                case 'M' -> Blocks.TINTED_GLASS;
                case 'L' -> Blocks.LANTERN;
                case 'W' -> Blocks.WATER_CAULDRON;
                case 'B' -> Blocks.SPRUCE_SLAB;
                default -> null;
              };
          if (prop != null) add(origin + x, 65, z, prop);
        }
        if (tile == '~') add(origin + x, 64, z, Blocks.STAINED_GLASS.lightBlue());
        if ((x + z) % 13 == 0) add(origin + x, 63, z, Blocks.SEA_LANTERN);
        if (tile == '.' && (x * 17 + z * 11) % 137 == 0 && area.equals("blood"))
          add(origin + x, 65, z, Blocks.CARPET.red());
        if (tile == '*' && x % 2 == 0 && z % 2 == 0) add(origin + x, 65, z, Blocks.POPPY);
      }
    for (JsonElement e : Jsons.a(story, "points")) {
      JsonObject p = e.getAsJsonObject();
      int x = origin + (int) (Jsons.d(p, "x") * 2), z = (int) (Jsons.d(p, "z") * 2);
      String id = Jsons.s(p, "id");
      if (id.startsWith("c") || Jsons.s(p, "label").contains("棺")) {
        add(x, 65, z, Blocks.BLACKSTONE_SLAB);
        add(x, 65, z + 1, Blocks.BLACKSTONE_SLAB);
        add(x - 1, 65, z, Blocks.IRON_TRAPDOOR);
      } else if (id.startsWith("m")) {
        add(x, 65, z, Blocks.TINTED_GLASS);
        add(x, 66, z, Blocks.TINTED_GLASS);
        add(x - 1, 65, z, Blocks.POLISHED_BASALT);
      } else if (!area.equals("storm") && !area.equals("meta")) {
        add(x, 64, z, Blocks.LODESTONE);
      }
    }
    if (area.equals("blood") || area.equals("storm")) {
      int cx = origin + cols, cz = 3;
      for (int x = -6; x <= 6; x++)
        for (int y = -6; y <= 6; y++)
          if (x * x + y * y < 36)
            add(
                cx + x,
                (area.equals("storm") || stage.equals("tower") ? 112 : 77) + y,
                cz,
                (x * x + y * y > 25) ? Blocks.STAINED_GLASS.red() : Blocks.REDSTONE_BLOCK);
    }
    if (stage.equals("curtain")) {
      for (int x = 2; x < cols * 2 - 2; x++)
        for (int y = 66; y < 75; y++)
          add(origin + x, y, 2, (x % 4 == 0) ? Blocks.CONCRETE.purple() : Blocks.CONCRETE.black());
    }
    if (stage.equals("tower") || area.equals("storm")) {
      for (int y = 66; y < 115; y++)
        for (int x = -8; x <= 8; x++)
          if (Math.abs(x) >= 7) add(origin + cols + x, y, rows, Blocks.DEEPSLATE_TILES);
    }
    JsonObject pose = Jsons.o(story, "pose");
    bound = position(Jsons.d(pose, "x"), Jsons.d(pose, "z"));
    stageYaw =
        (area.equals("storm") || stage.equals("tower"))
            ? 180
            : area.equals("blood")
                ? 205
                : switch (Jsons.i(pose, "dir")) {
                  case 1 -> 90;
                  case 2 -> -90;
                  case 3 -> 180;
                  default -> 0;
                };
    stagePitch =
        (area.equals("storm") || stage.equals("tower")) ? -40 : area.equals("blood") ? -12 : 0;
    lastPose = "";
    exitOpen = false;
    attributionRejected = false;
  }

  private ArmorStand stand(Vec3 p, String label, boolean visible) {
    ArmorStand a = new ArmorStand(world, p.x, p.y, p.z);
    a.setNoGravity(true);
    a.setPermanentlyInvulnerable(true);
    a.setInvisible(!visible);
    a.setCustomName(Component.literal(label));
    a.setCustomNameVisible(true);
    a.addTag("eff_owned");
    world.addFreshEntity(a);
    actors.add(a);
    return a;
  }

  private void populate() {
    JsonObject story = Jsons.o(state, "story");
    for (JsonElement e : Jsons.a(story, "points")) {
      JsonObject p = e.getAsJsonObject();
      stand(
          position(Jsons.d(p, "x") + .4, Jsons.d(p, "z") + .4).add(0, -.7, 0),
          Jsons.s(p, "label"),
          false);
    }
    syncNPCs(story);

    if (area.equals("blood")) {
      body = stand(position(12.5, 5.5), "身体的表象 · 血迹未消", true);
      body.setShowArms(true);
      body.setNoBasePlate(true);
      body.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.PLAYER_HEAD));
      body.setItemSlot(EquipmentSlot.CHEST, new ItemStack(Items.NETHERITE_CHESTPLATE));
      body.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.DYE.red()));
      for (int i = 0; i < 3; i++)
        accusation.add(
            stand(
                position(8 + i * 4, 6),
                new String[] {"执行权：他者牵引", "归责：被强行指认", "结局：尚未提交"}[i],
                false));
    }
    writeClaims();
  }

  private void syncNPCs(JsonObject story) {
    Set<String> seen = new HashSet<>();
    for (JsonElement e : Jsons.a(story, "npcs")) {
      JsonObject n = e.getAsJsonObject();
      String id = Jsons.s(n, "id");
      seen.add(id);
      ArmorStand a = npcActors.get(id);
      if (a == null) {
        a = stand(position(Jsons.d(n, "x") + .4, Jsons.d(n, "z") + .4), Jsons.s(n, "name"), true);
        a.setShowArms(true);
        a.setNoBasePlate(true);
        a.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.PLAYER_HEAD));
        a.setItemSlot(EquipmentSlot.CHEST, new ItemStack(Items.LEATHER_CHESTPLATE));
        npcActors.put(id, a);
      }
      a.setPos(position(Jsons.d(n, "x") + .4, Jsons.d(n, "z") + .4));
      String pose = Jsons.s(n, "pose");
      a.setRightArmPose(new Rotations(pose.equals("carry") || pose.equals("eat") ? -80 : 0, 0, 0));
      a.setItemSlot(
          EquipmentSlot.MAINHAND,
          new ItemStack(pose.equals("carry") || pose.equals("eat") ? Items.BOWL : Items.AIR));
    }
    for (String id : List.copyOf(npcActors.keySet()))
      if (!seen.contains(id)) {
        ArmorStand a = npcActors.remove(id);
        a.discard();
        actors.remove(a);
      }
    JsonObject shard = Jsons.o(story, "shard");
    if (!shard.isEmpty() && !Jsons.b(shard, "collected") && shardActor == null) {
      shardActor =
          stand(
              position(Jsons.d(shard, "x") + .5, Jsons.d(shard, "z") + .5),
              "◆ 记忆碎片 · " + Jsons.s(shard, "name"),
              false);
      shardActor.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.AMETHYST_SHARD));
    }
    if (shardActor != null && Jsons.b(shard, "collected")) {
      shardActor.discard();
      actors.remove(shardActor);
      shardActor = null;
    }
  }

  private void writeClaims() {
    if (!area.equals("blood") || generation < 1) return;
    for (int y = 65; y < 69; y++)
      for (int x = 0; x < 3; x++)
        world.setBlock(
            new BlockPos(origin + cols + x, y, rows * 2 - 3),
            (exitOpen ? Blocks.AIR : Blocks.STAINED_GLASS.red()).defaultBlockState(),
            2,
            512);
    if (accusation.size() == 3) {
      accusation.get(0).setCustomName(Component.literal(bodyFree ? "执行权：周防" : "执行权：他者牵引"));
      accusation
          .get(1)
          .setCustomName(Component.literal(attributionRejected ? "归责：拒绝指认；遭遇仍在" : "归责：被强行指认"));
      accusation
          .get(2)
          .setCustomName(Component.literal(exitOpen ? "结局：提交被拒绝 / 出口已开" : "结局：尚未提交 / 出口封锁"));
    }
  }

  public void tick() {
    if (closed) return;
    ticks++;
    int budget = 700;
    while (budget-- > 0 && !construction.isEmpty()) {
      Placement p = construction.removeFirst();
      world.setBlock(p.pos, p.block, 2, 512);
    }
    if (!construction.isEmpty()) return;
    if (!entered || !actors.stream().anyMatch(a -> !a.isRemoved())) {
      player.setGameMode(GameType.ADVENTURE);
      player.getAbilities().invulnerable = true;
      player.getAbilities().mayfly = false;
      player.getAbilities().flying = false;
      player.onUpdateAbilities();
      player.setYRot(stageYaw);
      player.setXRot(stagePitch);
      teleport(bound);
      entered = true;
      populate();
    }
    if (player.level() != world) return;
    if ((area.equals("storm") || area.equals("rain") || stage.equals("tower")) && ticks % 3 == 0)
      world.sendParticles(
          net.minecraft.core.particles.ParticleTypes.RAIN,
          player.getX(),
          player.getY() + 9,
          player.getZ(),
          38,
          9,
          4,
          9,
          .4);
    if (area.equals("storm") || stage.equals("tower")) {
      player.setNoGravity(true);
      flightY = Math.min(85, flightY + .035);
      Vec3 rise = new Vec3(origin + cols, flightY, rows + 3);
      player.teleportTo(rise.x, rise.y, rise.z);
      player.setDeltaMovement(Vec3.ZERO);
      if (body == null) {
        body = stand(rise.add(0, 1, -4), "周防 · 向红月逆落", true);
        body.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.PLAYER_HEAD));
        body.setItemSlot(EquipmentSlot.CHEST, new ItemStack(Items.LEATHER_CHESTPLATE));
        body.setBodyPose(new Rotations(180, 0, 0));
        body.setHeadPose(new Rotations(180, 0, 0));
        body.setLeftArmPose(new Rotations(180, 0, -20));
        body.setRightArmPose(new Rotations(180, 0, 20));
        body.setLeftLegPose(new Rotations(180, 0, 0));
        body.setRightLegPose(new Rotations(180, 0, 0));
        body.setShowArms(true);
      }
      body.setPos(rise.add(0, 1, -4));
      return;
    } else player.setNoGravity(previousGravity);
    boolean possessed = Jsons.s(Jsons.o(state, "battle"), "bodyOwner").equals("intruder");
    if (possessed) {
      double x = origin + cols + Math.sin(ticks * .018) * 5;
      player.teleportTo(x, 65, Math.min(rows * 2 - 5, 17));
      player.setDeltaMovement(Vec3.ZERO);
      return;
    }
    boolean dialogue = Jsons.b(Jsons.o(Jsons.o(state, "story"), "dialog"), "active");
    if (!bodyFree || dialogue) {
      if (player.position().distanceToSqr(bound) > .02)
        player.teleportTo(bound.x, bound.y, bound.z);
      player.setDeltaMovement(Vec3.ZERO);
    } else {
      bound = player.position();
    }
    if (player.getY() < 60
        || player.getX() < origin
        || player.getX() > origin + cols * 2
        || player.getZ() < 0
        || player.getZ() > rows * 2)
      teleport(
          position(
              Jsons.d(Jsons.o(Jsons.o(state, "story"), "pose"), "x"),
              Jsons.d(Jsons.o(Jsons.o(state, "story"), "pose"), "z")));
    if (exitOpen
        && Jsons.s(state, "mode").equals("practice")
        && player.getZ() > rows * 2 - 4
        && Math.abs(player.getX() - (origin + cols + 1)) < 2) {
      EffServer.leave(player);
      return;
    }
    JsonObject finale = Jsons.o(Jsons.o(state, "story"), "finale");
    if (Jsons.b(finale, "active") && historyAnchor.isEmpty()) {
      for (int x = 3; x < cols * 2 - 3; x++) {
        BlockPos pos = new BlockPos(origin + x, 64, rows);
        historyAnchor.add(new Placement(pos, world.getBlockState(pos)));
      }
    }
    if (Jsons.b(finale, "active") && !Jsons.b(finale, "authorizedPast") && ticks % 20 == 0) {
      world.setBlock(
          new BlockPos(origin + 3 + (ticks / 20) % Math.max(1, cols * 2 - 6), 64, rows),
          Blocks.STAINED_GLASS.red().defaultBlockState(),
          2,
          512);
    }
    if (Jsons.b(finale, "authorizedPast") && Jsons.i(finale, "step") > appliedPastStep) {
      appliedPastStep = Jsons.i(finale, "step");
      int boundSize = historyAnchor.size() * appliedPastStep / 3;
      for (int i = 0; i < Math.min(boundSize, historyAnchor.size()); i++) {
        Placement p = historyAnchor.get(i);
        world.setBlock(p.pos, p.block, 2, 512);
      }
    }
    if (Jsons.b(finale, "rewritten") && Jsons.b(finale, "authorizedPast") && !pastApplied) {
      for (Placement p : historyAnchor) world.setBlock(p.pos, p.block, 2, 512);
      pastApplied = true;
    }
    if (Jsons.b(finale, "rewritten") && Jsons.b(finale, "authorizedPast") && ticks % 20 == 0) {
      int x = origin + cols - 8 + (ticks / 20) % 16;
      world.setBlock(new BlockPos(x, 65, rows), Blocks.SEA_LANTERN.defaultBlockState(), 2, 512);
    }
  }

  public JsonObject facts() {
    return Jsons.obj(
        "generation",
        Math.max(1, generation),
        "frozen",
        server.tickRateManager().isFrozen(),
        "controller",
        bodyFree ? "player" : Jsons.s(Jsons.o(state, "battle"), "bodyOwner"),
        "exitOpen",
        exitOpen && world.getBlockState(new BlockPos(origin + cols, 65, rows * 2 - 3)).isAir(),
        "attribution",
        attributionRejected ? "rejected" : "claimed",
        "dimension",
        "eff:phenomenon");
  }

  public JsonObject step() {
    return Jsons.obj(
        "op",
        "tick",
        "dt",
        .1,
        "x",
        Math.max(0, (player.getX() - origin) / 2),
        "z",
        Math.max(0, player.getZ() / 2),
        "world",
        facts());
  }

  public boolean ready() {
    return entered && construction.isEmpty();
  }

  public int generation() {
    return generation;
  }

  public static void recover(ServerPlayer p, Path save) {
    Path ticket = save.resolve("return-ticket.json");
    if (!Files.isRegularFile(ticket)) return;
    try {
      JsonObject t =
          com.google.gson.JsonParser.parseString(Files.readString(ticket)).getAsJsonObject();
      if (p.level().dimension().equals(DIM)) {
        String id = Jsons.s(t, "dimension");
        if (id.equals("eff:phenomenon")) return;
        ServerLevel back =
            p.level()
                .getServer()
                .getLevel(ResourceKey.create(Registries.DIMENSION, Identifier.parse(id)));
        double x = Jsons.d(t, "x"), y = Jsons.d(t, "y"), z = Jsons.d(t, "z");
        if (back == null
            || !Double.isFinite(x)
            || !Double.isFinite(y)
            || !Double.isFinite(z)
            || Math.abs(x) > 30000000
            || Math.abs(z) > 30000000) return;
        p.teleport(
            new TeleportTransition(
                back,
                new Vec3(x, y, z),
                Vec3.ZERO,
                (float) Jsons.d(t, "yaw"),
                (float) Jsons.d(t, "pitch"),
                TeleportTransition.DO_NOTHING));
        p.setGameMode(GameType.byName(Jsons.s(t, "mode")));
        var a = p.getAbilities();
        a.invulnerable = Jsons.b(t, "invulnerable");
        a.flying = Jsons.b(t, "flying");
        a.mayfly = Jsons.b(t, "mayfly");
        a.instabuild = Jsons.b(t, "instabuild");
        a.mayBuild = Jsons.b(t, "mayBuild");
        a.setFlyingSpeed((float) Jsons.d(t, "flySpeed"));
        a.setWalkingSpeed((float) Jsons.d(t, "walkSpeed"));
        p.setNoGravity(Jsons.b(t, "noGravity"));
        p.getFoodData().setFoodLevel(Jsons.i(t, "food"));
        p.getFoodData().setSaturation((float) Jsons.d(t, "saturation"));
        p.onUpdateAbilities();
        p.level().getServer().tickRateManager().setFrozen(Jsons.b(t, "frozen"));
      }
      Files.deleteIfExists(ticket);
    } catch (Exception e) {
      p.sendSystemMessage(Component.literal("[EFF] 自动恢复未完成，请保留 eff-runtime 中的返回记录。"));
    }
  }

  public void close() {
    if (closed) return;
    closed = true;
    construction.clear();
    server.tickRateManager().setFrozen(previousFrozen);
    actors.forEach(Entity::discard);
    if (player.connection != null) {
      player.teleport(
          new TeleportTransition(
              returnWorld,
              returnPos,
              Vec3.ZERO,
              returnYaw,
              returnPitch,
              TeleportTransition.DO_NOTHING));
      player.setGameMode(returnMode);
      player.getAbilities().apply(returnAbilities);
      player.setNoGravity(previousGravity);
      player.getFoodData().setFoodLevel(previousFood);
      player.getFoodData().setSaturation(previousSaturation);
      player.onUpdateAbilities();
    }
    try {
      Files.deleteIfExists(ticket);
    } catch (Exception ignored) {
    }
  }
}
