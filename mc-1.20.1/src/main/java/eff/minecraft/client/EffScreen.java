package eff.minecraft.client;

import com.google.gson.*;
import com.mojang.blaze3d.platform.InputConstants;
import eff.minecraft.*;
import java.util.*;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.*;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

public final class EffScreen extends Screen {
  private String view, signature = "", goal = "body", readKey = "";
  private int offset = 0, page = 0;
  private MultiLineEditBox researchEditor;
  private static String researchDraft =
      "inspect entity.avatar;\n"
          + "inspect control.tether;\n"
          + "inspect event.possess;\n"
          + "inspect checkpoint.origin;";

  private boolean typing() {
    return researchEditor != null && researchEditor.isFocused()
        || fields.values().stream().anyMatch(EditBox::isFocused);
  }

  private List<FormattedCharSequence> lines = List.of();
  private int textTop = 65, textBottom = 160;
  private final Map<String, EditBox> fields = new HashMap<>();

  public EffScreen(String view) {
    super(Component.literal("无中归来者 · MC 表象融合"));
    this.view = view;
  }

  @Override
  public boolean isPauseScreen() {
    return false;
  }

  private void button(String label, int x, int y, int w, Runnable action, boolean enabled) {
    var b =
        Button.builder(
                Component.literal(font.plainSubstrByWidth(label, Math.max(20, w - 12))),
                b0 -> action.run())
            .bounds(x, y, w, 20)
            .build();
    b.active = enabled;
    b.setTooltip(Tooltip.create(Component.literal(label)));
    addRenderableWidget(b);
  }

  private void tab(String label, int x, String next) {
    button(
        label,
        x,
        36,
        68,
        () -> {
          view =
              next.equals("story") && Jsons.s(EffClient.state, "mode").equals("practice")
                  ? "menu"
                  : next;
          page = 0;
          offset = 0;
          signature = "";
          init();
        },
        true);
  }

  @Override
  protected void init() {
    clearWidgets();
    fields.clear();
    researchEditor = null;
    JsonObject state = EffClient.state,
        story = Jsons.o(state, "story"),
        battle = Jsons.o(state, "battle");
    int left = view.equals("battle") && width >= 380 ? width / 2 : 18,
        w = Math.max(100, width - left - 18);
    String nextReadKey =
        view
            + "|"
            + Jsons.s(story, "area")
            + "|"
            + Jsons.s(Jsons.o(story, "dialog"), "text")
            + "|"
            + Jsons.s(Jsons.o(story, "ending"), "text");
    if (!nextReadKey.equals(readKey)) {
      readKey = nextReadKey;
      offset = 0;
    }
    textTop = 65;
    textBottom = height - 80;
    tab("正文", 18, "story");
    tab("争夺", 90, "battle");
    tab("选择与操作", 162, "controls");
    tab("本地模型", 234, "models");
    tab("运行层", 306, "research");
    button("×", width - 38, 9, 20, this::onClose, true);
    if ((state.size() == 0) || view.equals("menu")) {
      lines =
          font.split(
              Component.literal(
                  "无中归来者与 Minecraft 的表象已经融合。\n"
                      + "进入正文：从镜像回廊开始，保留原脚本的全部篇章与选择。\n"
                      + "争夺练习：直接进入血色庭院，攻防改变实体控制、世界时间与出口规则。\n"
                      + "R 展开文本和选项，V 靠近调查。菜单中可随时返回原世界。"),
              w);
      button(
          "进入正文",
          left,
          height - 69,
          w / 2 - 4,
          () -> EffClient.send(Jsons.obj("op", "enter", "mode", "story")),
          true);
      button(
          "进入争夺练习",
          left + w / 2 + 4,
          height - 69,
          w / 2 - 4,
          () -> EffClient.send(Jsons.obj("op", "enter", "mode", "practice")),
          true);
      button(
          "进入运行层研究场",
          left,
          height - 94,
          w,
          () -> EffClient.send(Jsons.obj("op", "enter", "mode", "research")),
          true);
      textBottom = height - 101;
    } else if (view.equals("research")) {
      JsonObject r = Jsons.o(state, "research");
      if ((r.size() == 0)) {
        lines =
            font.split(
                Component.literal(
                    "运行层研究场：编写真实干预程序，或用原生伤害、命令与扩展移除标记投影。AI 根据实际回执反制。\n独立于正文存档，不开放提前回写过去。"),
                w);
        button(
            "进入运行层研究场",
            left,
            height - 55,
            w,
            () -> EffClient.send(Jsons.obj("op", "enter", "mode", "research")),
            true);
      } else {
        boolean busy = Jsons.b(state, "researchBusy");
        JsonObject f = Jsons.o(r, "fields"),
            counter = Jsons.o(r, "counter"),
            helper = Jsons.o(r, "advice");
        StringBuilder text =
            new StringBuilder("实际实体：" + (Jsons.b(f, "entity.avatar.alive") ? "存在" : "已移除"))
                .append(" · 牵引：")
                .append(Jsons.b(f, "control.tether.active"))
                .append(" · 事件：")
                .append(Jsons.b(f, "event.possess.active"))
                .append(" · 恢复：")
                .append(Jsons.b(f, "authority.recovery.active"))
                .append("\n第 ")
                .append(Jsons.i(r, "generation"))
                .append(" 代 / v")
                .append(Jsons.i(r, "revision"))
                .append(" / ")
                .append(Jsons.s(r, "outcome"))
                .append(busy ? " / AI 正在反制" : " / 每次最多 3 次干预")
                .append("\n外来者 [")
                .append(Jsons.s(counter, "source"))
                .append("] ")
                .append(Jsons.s(counter, "program"))
                .append("\n检查点：")
                .append(researchSources(r))
                .append("\n触发器：")
                .append(researchWatches(r))
                .append("\n执行回执：")
                .append(researchReceipts(r))
                .append("\n外来者 [")
                .append(Jsons.s(counter, "source"))
                .append("] ")
                .append(Jsons.s(counter, "explanation"))
                .append("\n")
                .append(Jsons.s(counter, "program"))
                .append("\n面向建议（未执行）[")
                .append(Jsons.s(helper, "source"))
                .append("] ")
                .append(Jsons.s(helper, "explanation"))
                .append("\n")
                .append(Jsons.s(helper, "program"))
                .append("\n提示：")
                .append(Jsons.a(r, "notes"))
                .append(
                    "\n语法：disable control.tether; disable event.possess; seal checkpoint.origin;")
                .append("\n恢复来源处理后：erase entity.avatar; refuse ending.owned;")
                .append("\n条件：assert control.tether.active == false")
                .append(
                    "\n触发器：watch guard when entity.avatar.alive == false -> disable event.possess");
        if (r.has("runtime")) {
          JsonObject rt = Jsons.o(r, "runtime");
          text.append("\n真实 JVM：MC #")
              .append(Jsons.i(rt, "hostPid"))
              .append(" / 判定 #")
              .append(Jsons.i(Jsons.o(rt, "policy"), "pid"))
              .append(" / 执行 #")
              .append(Jsons.i(Jsons.o(rt, "execution"), "pid"))
              .append(" / 已提交 ")
              .append(Jsons.i(rt, "commit"))
              .append(
                  "\n"
                      + "换代引擎：rebuild runtime.policy; rebuild runtime.execution；换宿主：rebuild"
                      + " runtime.host");
          for (String role : new String[] {"policy", "execution"}) {
            JsonObject engine = Jsons.o(Jsons.o(rt, role), "engine");
            if (engine.size() == 0) continue;
            JsonObject descriptor = Jsons.o(engine, "descriptor");
            String identity = Jsons.s(descriptor, "id"),
                bytecode = Jsons.s(engine, "bytecodeSHA256");
            text.append("\n")
                .append(role.equals("policy") ? "判定引擎 G" : "执行引擎 G")
                .append(Jsons.i(descriptor, "generation"))
                .append(" · ")
                .append(identity.substring(0, Math.min(12, identity.length())))
                .append(" · 字节码 ")
                .append(bytecode.substring(0, Math.min(12, bytecode.length())));
          }
        }
        lines = font.split(Component.literal(text.toString()), w);
        textBottom = height - 138;
        researchEditor =
            new MultiLineEditBox(
                font,
                left,
                height - 131,
                w,
                70,
                Component.literal("干预程序（每次最多 3 次修改）"),
                Component.literal("运行层程序")) {
              @Override
              protected void renderDecorations(GuiGraphics g) {
                // 1.20.1 always paints a character counter below the widget. Keep it out of action
                // buttons.
              }
            };
        researchEditor.setCharacterLimit(4096);
        // Parser enforces the 16-statement budget; 1.20.1 has no widget line-limit setter.
        researchEditor.setValue(researchDraft);
        researchEditor.setValueListener(value -> researchDraft = value);
        addRenderableWidget(researchEditor);
        int bw = (w - 8) / 3;
        button(
            "执行程序",
            left,
            height - 55,
            bw,
            () -> {
              researchEditor.setFocused(false);
              EffClient.send(
                  Jsons.obj(
                      "op",
                      "researchSubmit",
                      "source",
                      researchDraft,
                      "revision",
                      Jsons.i(r, "revision")));
            },
            !busy
                && Jsons.s(r, "outcome").equals("pending")
                && Jsons.b(Jsons.o(state, "native"), "ready"));
        button(
            busy ? "取消推理" : "面向分析",
            left + bw + 4,
            height - 55,
            bw,
            () -> {
              researchEditor.setFocused(false);
              if (busy) EffClient.send(Jsons.obj("op", "cancel"));
              else
                EffClient.send(
                    Jsons.obj("op", "researchAdvice", "goal", "夺回身体，保留已有遭遇，查找并切断占据的持续来源。"));
            },
            true);
        button(
            "载入建议",
            left + 2 * (bw + 4),
            height - 55,
            bw,
            () -> {
              researchDraft = Jsons.s(helper, "program");
              init();
            },
            (helper.size() != 0) && !busy);
      }
    } else if (view.equals("battle")) {
      boolean
          pending = EffClient.state.has("battle") && Jsons.s(battle, "outcome").equals("pending"),
          busy = Jsons.b(state, "pending"),
          ready = Jsons.b(battle, "ready") && Jsons.b(Jsons.o(state, "native"), "ready");
      if (!Jsons.s(battle, "target").isEmpty()) goal = Jsons.s(battle, "target");
      else if (Jsons.a(battle, "candidates").asList().stream()
          .noneMatch(e -> Jsons.s(e.getAsJsonObject(), "target").equals(goal))) {
        for (JsonElement e : Jsons.a(battle, "candidates")) {
          String t = Jsons.s(e.getAsJsonObject(), "target");
          if (Set.of("body", "attribution", "bad_owned").contains(t)) {
            goal = t;
            break;
          }
        }
      }
      String text =
          (battle.size() == 0)
              ? "到达血色庭院的反抗段落后，原文中的回应会接入 MC 运行规则。也可从菜单进入独立练习。"
              : "身体执行权："
                  + Jsons.s(battle, "bodyOwner")
                  + "\n强加的归责："
                  + Jsons.s(battle, "attribution")
                  + "\n结局提交："
                  + Jsons.s(battle, "endingLock")
                  + "\n第 "
                  + Jsons.i(battle, "round")
                  + " / 6 轮 · 压力 "
                  + Jsons.i(battle, "pressure")
                  + " / 6 · "
                  + Jsons.s(battle, "outcome")
                  + "\n"
                  + Jsons.s(state, "feedback");
      JsonObject plan = Jsons.o(state, "plan");
      if ((plan.size() != 0)) {
        text +=
            "\n\n面向的建议（尚未提交）："
                + Jsons.s(Jsons.o(plan, "player"), "explanation")
                + "\n外来者正在等待同一轮提交。";
      }
      lines = font.split(Component.literal(text), w);
      textBottom = height - 111;
      int bw = (w - 8) / 3;
      String[] ids = {"body", "attribution", "bad_owned"}, labels = {"身体控制", "拒绝归责", "拒绝结局"};
      for (int i = 0; i < 3; i++) {
        String id = ids[i];
        int index = i;
        boolean available =
            Jsons.a(battle, "candidates").asList().stream()
                .anyMatch(e -> Jsons.s(e.getAsJsonObject(), "target").equals(id));
        button(
            (goal.equals(id) ? "◆ " : "") + labels[i],
            left + i * (bw + 4),
            height - 105,
            bw,
            () -> {
              goal = ids[index];
              signature = "";
              init();
            },
            pending
                && available
                && (Jsons.s(battle, "target").isEmpty() || Jsons.s(battle, "target").equals(id))
                && !busy);
      }
      button(
          "亲自回应",
          left,
          height - 80,
          bw,
          () -> EffClient.send(Jsons.obj("op", "resolve", "goal", goal, "useAgent", false)),
          pending && ready && !busy);
      button(
          "让面向拟定",
          left + bw + 4,
          height - 80,
          bw,
          () -> EffClient.send(Jsons.obj("op", "plan", "goal", goal, "risk", "low")),
          pending && ready && !busy);
      button(
          "采用建议",
          left + 2 * (bw + 4),
          height - 80,
          bw,
          () -> EffClient.send(Jsons.obj("op", "resolve", "goal", goal, "useAgent", true)),
          pending && ready && !busy && (plan.size() != 0));
      button(
          busy ? "取消推理" : "原文继续",
          left,
          height - 55,
          w,
          () -> {
            if (busy) EffClient.send(Jsons.obj("op", "cancel"));
            else {
              EffClient.send(Jsons.obj("op", "story", "input", Jsons.obj("action", "advance")));
              view = "story";
              signature = "";
              init();
            }
          },
          busy || !Jsons.s(state, "mode").equals("practice"));
    } else if (view.equals("models")) {
      JsonObject config = Jsons.o(state, "modelConfig");
      String info =
          "小模型仅提出有限规则中的候选动作。两个代理分别读取同一版公开状态，外来者看不到你的意图或未提交草案。\n当前："
              + (Jsons.b(config, "enabled") ? Jsons.s(config, "model") : "规则后备")
              + " / "
              + Jsons.s(config, "profile")
              + "\n"
              + Jsons.s(state, "feedback");
      lines = font.split(Component.literal(info), w);
      textBottom = height - 106;
      var models = Jsons.a(state, "models");
      if (models.size() > 0) {
        int i = 0;
        for (JsonElement e : models) {
          if (i >= 2) break;
          String m = e.getAsString();
          button(
              "启用 " + m,
              left,
              height - 100 + 22 * i++,
              w,
              () ->
                  EffClient.send(
                      Jsons.obj(
                          "op",
                          "modelConfigure",
                          "enabled",
                          true,
                          "model",
                          m,
                          "profile",
                          "patient")),
              !Jsons.b(state, "pending"));
        }
      }
      button(
          "检测本机 Ollama",
          left,
          height - 54,
          w / 2 - 3,
          () -> EffClient.send(Jsons.obj("op", "modelStatus")),
          true);
      button(
          "使用规则后备",
          left + w / 2 + 3,
          height - 54,
          w / 2 - 3,
          () ->
              EffClient.send(
                  Jsons.obj(
                      "op",
                      "modelConfigure",
                      "enabled",
                      false,
                      "model",
                      "",
                      "profile",
                      "balanced")),
          true);
    } else if (view.equals("controls")) {
      List<JsonObject> choices = controls(story);
      int rows = Math.max(1, (height - 126) / 23);
      int start = page * rows;
      if (start >= choices.size()) {
        page = 0;
        start = 0;
      }
      int y = 65;
      for (int i = start; i < Math.min(start + rows, choices.size()); i++) {
        JsonObject c = choices.get(i);
        String id = Jsons.s(c, "id");
        button(
            Jsons.s(c, "label"),
            left,
            y,
            w,
            () -> {
              EffClient.send(
                  Jsons.obj(
                      "op",
                      "story",
                      "input",
                      Jsons.obj(
                          "action", "control", "id", id, "revision", Jsons.i(story, "revision"))));
            },
            !Jsons.b(c, "disabled") && !Jsons.b(state, "pending"));
        y += 23;
      }
      lines = List.of();
      if (choices.size() > rows) {
        button(
            "上页",
            left,
            height - 55,
            65,
            () -> {
              page = Math.max(0, page - 1);
              init();
            },
            page > 0);
        button(
            "下页",
            left + 69,
            height - 55,
            65,
            () -> {
              page++;
              init();
            },
            start + rows < choices.size());
      }
      int fieldY = height - 78;
      for (JsonElement e : Jsons.a(story, "fields")) {
        JsonObject f = e.getAsJsonObject();
        if (!Jsons.a(f, "options").isEmpty()) continue;
        String id = Jsons.s(f, "id");
        EditBox box =
            new EditBox(font, left, fieldY, Math.max(70, w - 75), 20, Component.literal(id));
        box.setMaxLength(80);
        box.setValue(Jsons.s(f, "value"));
        addRenderableWidget(box);
        fields.put(id, box);
        button(
            "写入",
            left + w - 70,
            fieldY,
            70,
            () ->
                EffClient.send(
                    Jsons.obj(
                        "op",
                        "story",
                        "input",
                        Jsons.obj("action", "field", "id", id, "value", box.getValue()))),
            true);
        break;
      }
    } else {
      JsonObject dialog = Jsons.o(story, "dialog"), ending = Jsons.o(story, "ending");
      String text =
          (ending.size() != 0)
              ? Jsons.s(ending, "name") + "\n" + Jsons.s(ending, "text")
              : Jsons.s(dialog, "text");
      StringBuilder aux = new StringBuilder();
      for (JsonElement e : Jsons.a(story, "auxiliary")) aux.append("\n").append(e.getAsString());
      lines = font.split(Component.literal(text + aux), w - 56);
      textTop = 66;
      String speaker = Jsons.s(dialog, "speaker");
      button(
          "继续 / 调查",
          left,
          height - 55,
          w / 2 - 4,
          () -> EffClient.send(Jsons.obj("op", "story", "input", Jsons.obj("action", "advance"))),
          !Jsons.b(state, "pending"));
      boolean runtime = Jsons.b(battle, "ready") && Jsons.s(battle, "outcome").equals("pending");
      button(
          runtime ? "回应现象" : "打开可用选择",
          left + w / 2 + 4,
          height - 55,
          w / 2 - 4,
          () -> {
            view = runtime ? "battle" : "controls";
            signature = "";
            offset = 0;
            init();
          },
          true);
      if (Jsons.b(
          Jsons.o(story, "rain"),
          "active")) {} // Rain controls remain the original host's individual live drops.
    }
    button(
        "回到世界",
        18,
        height - 28,
        Math.max(60, (width - 44) / 3),
        () -> minecraft.setScreen(null),
        true);
    button(
        EffClient.reducedMotion ? "恢复动效" : "减少动效",
        18 + (width - 44) / 3 + 4,
        height - 28,
        Math.max(60, (width - 44) / 3),
        () -> {
          EffClient.reducedMotion = !EffClient.reducedMotion;
          NativeTheatre.skip();
          init();
        },
        true);
    button(
        "返回原 MC 世界",
        18 + 2 * ((width - 44) / 3 + 4),
        height - 28,
        Math.max(60, (width - 44) / 3),
        () -> EffClient.send(Jsons.obj("op", "leave")),
        true);
    offset = Math.max(0, Math.min(offset, Math.max(0, lines.size() - 1)));
    signature = signature();
  }

  private String researchSources(JsonObject state) {
    StringBuilder out = new StringBuilder();
    for (JsonElement e : Jsons.a(state, "checkpoints")) {
      JsonObject c = e.getAsJsonObject();
      out.append("\n  ")
          .append(Jsons.s(c, "handle"))
          .append(" / ")
          .append(Jsons.s(c, "owner"))
          .append(Jsons.b(c, "usable") ? " / 可恢复" : " / 授权已撤销");
    }
    return out.length() == 0 ? "无" : out.toString();
  }

  private String researchWatches(JsonObject state) {
    StringBuilder out = new StringBuilder();
    for (JsonElement e : Jsons.a(state, "watches")) {
      JsonObject c = e.getAsJsonObject();
      out.append("\n  ")
          .append(Jsons.s(c, "name"))
          .append(Jsons.b(c, "fired") ? " / 已触发" : " / 等待条件");
    }
    return out.length() == 0 ? "无" : out.toString();
  }

  private String researchReceipts(JsonObject state) {
    StringBuilder out = new StringBuilder();
    for (JsonElement e : Jsons.a(state, "journal")) {
      JsonObject receipt = e.getAsJsonObject();
      out.append("\n[")
          .append(Jsons.s(receipt, "actor"))
          .append(" / v")
          .append(Jsons.i(receipt, "revision"))
          .append("]");
      if (Jsons.s(receipt, "actor").equals("native-observer")) out.append(" MC 检测到真实实体移除");
      for (JsonElement step : Jsons.a(receipt, "steps")) {
        JsonObject c = step.getAsJsonObject();
        out.append("\n  ")
            .append(Jsons.b(c, "accepted") ? "成立：" : "拒绝：")
            .append(Jsons.s(c, "statement"));
        if (!Jsons.b(c, "accepted")) out.append(" / ").append(Jsons.s(c, "reason"));
      }
    }
    return out.toString();
  }

  private List<JsonObject> controls(JsonObject story) {
    List<JsonObject> c = new ArrayList<>();
    for (JsonElement e : Jsons.a(story, "controls")) {
      JsonObject o = e.getAsJsonObject();
      String label = Jsons.s(o, "label");
      if (Set.of("音景：关", "音景：开", "自动", "快进已读", "区域地图", "显示全文").contains(label)) continue;
      c.add(o);
    }
    c.sort(Comparator.comparing(o -> Jsons.s(o, "group").equals("utility") ? 1 : 0));
    return c;
  }

  private String signature() {
    JsonObject s = EffClient.state;
    return view
        + "|"
        + Jsons.i(Jsons.o(s, "story"), "revision")
        + "|"
        + Jsons.o(s, "research")
        + "|"
        + Jsons.b(s, "researchBusy")
        + Jsons.o(s, "battle")
        + "|"
        + Jsons.b(s, "pending")
        + "|"
        + Jsons.o(s, "plan")
        + "|"
        + EffClient.error
        + "|"
        + Jsons.a(s, "models")
        + "|"
        + Jsons.o(s, "modelConfig");
  }

  public void refresh() {
    if (!signature.equals(signature()) && !typing()) init();
  }

  @Override
  public boolean mouseClicked(double mouseX, double mouseY, int button) {
    if (NativeTheatre.active()) {
      NativeTheatre.skip();
      return true;
    }
    return super.mouseClicked(mouseX, mouseY, button);
  }

  @Override
  public boolean mouseScrolled(double x, double y, double vertical) {
    if (researchEditor != null && researchEditor.isMouseOver(x, y))
      return super.mouseScrolled(x, y, vertical);
    offset =
        Math.max(
            0, Math.min(Math.max(0, lines.size() - 3), offset - (int) Math.signum(vertical) * 3));
    return true;
  }

  @Override
  public boolean keyPressed(int key, int scanCode, int modifiers) {
    if (typing()) return super.keyPressed(key, scanCode, modifiers);
    if (key == InputConstants.KEY_P && !typing()) {
      EffClient.manualPause = !EffClient.manualPause;
      return true;
    }
    if (key == InputConstants.KEY_PAGEDOWN) {
      offset = Math.min(Math.max(0, lines.size() - 3), offset + 5);
      return true;
    }
    if (key == InputConstants.KEY_PAGEUP) {
      offset = Math.max(0, offset - 5);
      return true;
    }
    if (key == InputConstants.KEY_ESCAPE && NativeTheatre.active()) {
      NativeTheatre.skip();
      return true;
    }
    if ((key == InputConstants.KEY_SPACE || key == InputConstants.KEY_V) && !typing()) {
      EffClient.send(Jsons.obj("op", "story", "input", Jsons.obj("action", "advance")));
      return true;
    }
    return super.keyPressed(key, scanCode, modifiers);
  }

  @Override
  public void render(GuiGraphics g, int mx, int my, float delta) {
    g.fill(8, 6, width - 8, 60, 0xd810101c);
    g.fill(
        view.equals("battle") && width >= 380 ? width / 2 - 10 : 8,
        60,
        width - 8,
        height - 6,
        0xc510101c);
    g.fill(8, 6, width - 8, 7, 0xffc2b17e);
    g.drawString(font, "无中归来者 / MC 表象融合", 18, 15, 0xffe3d8bc);
    if (!EffClient.error.isEmpty())
      g.drawString(
          font,
          font.plainSubstrByWidth("[EFF] " + EffClient.error, width - 48),
          18,
          26,
          0xffff9b9e);
    if (view.equals("battle")) {
      JsonObject s = EffClient.state, b = Jsons.o(s, "battle");
      double remaining =
          Jsons.s(s, "mode").equals("story")
              ? Jsons.d(Jsons.o(Jsons.o(s, "story"), "court"), "remaining") / 1000
              : Jsons.d(b, "remaining");
      String clock =
          Jsons.b(s, "paused")
              ? "已暂停 · P 继续"
              : Jsons.b(s, "pending")
                  ? "代理正在拟定 · 时限暂停"
                  : "回应剩余 " + (int) Math.ceil(remaining) + " 秒 · P 暂停";
      g.drawString(
          font, clock, width >= 380 ? width / 2 : 18, 58, remaining < 8 ? 0xffeb9c9e : 0xffa9c6c5);
    }
    boolean portrait = view.equals("story") && (EffClient.state.size() != 0);
    int x = view.equals("battle") && width >= 380 ? width / 2 : portrait ? 74 : 18, y = textTop;
    if (portrait) {
      portrait(
          g, 18, textTop, Jsons.s(Jsons.o(Jsons.o(EffClient.state, "story"), "dialog"), "speaker"));
      String speaker = Jsons.s(Jsons.o(Jsons.o(EffClient.state, "story"), "dialog"), "speaker");
      g.drawString(font, speaker.isEmpty() ? "旁白" : speaker, 18, textTop + 56, 0xffd8cba6);
    }
    g.enableScissor(x, textTop, width - 18, Math.max(textTop + 1, textBottom));
    for (int i = offset; i < lines.size() && y < textBottom; i++, y += 11)
      g.drawString(font, lines.get(i), x, y, 0xffe1dfe0);
    g.disableScissor();
    if (lines.size() * 11 > Math.max(0, textBottom - textTop))
      g.drawString(font, "滚轮 / PgUp PgDn 回看全文", width - 159, 58, 0xff9aabb4);
    super.render(g, mx, my, delta);
    NativeTheatre.draw(g);
  }

  private void portrait(GuiGraphics g, int x, int y, String who) {
    JsonArray rectangles =
        Jsons.a(Jsons.o(Jsons.o(EffClient.state, "story"), "dialog"), "portrait");
    if (rectangles.isEmpty()) {
      g.fill(x, y, x + 44, y + 52, 0xff171621);
      g.drawString(font, who.isEmpty() ? "…" : "?", x + 18, y + 21, 0xff9eafc4);
      return;
    }
    for (JsonElement e : rectangles) {
      JsonArray r = e.getAsJsonArray();
      int rx = (int) Math.floor(r.get(0).getAsDouble() * .65),
          ry = (int) Math.floor(r.get(1).getAsDouble() * .65),
          rw = Math.max(1, (int) Math.ceil(r.get(2).getAsDouble() * .65)),
          rh = Math.max(1, (int) Math.ceil(r.get(3).getAsDouble() * .65));
      int color = 0xff000000 | Integer.parseInt(r.get(4).getAsString().substring(1), 16);
      g.fill(x + rx, y + ry, x + rx + rw, y + ry + rh, color);
    }
  }
}
