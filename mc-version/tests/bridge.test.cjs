"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
  Session,
  McModelClient,
  Runtime,
  Policies,
} = require("../bridge/session.cjs");
const { StoryHost } = require("../bridge/story-host.cjs");
const facts = {
  generation: 1,
  frozen: true,
  controller: "contested",
  exitOpen: false,
  attribution: "claimed",
  dimension: "eff:phenomenon",
};
const practice = async () => {
  const s = new Session();
  await s.handle({ op: "enter", mode: "practice" });
  return s;
};
test("original scripts and full finale remain the text authority", () => {
  const h = new StoryHost();
  assert.equal(h.snapshot().area, "mirror");
  assert.match(h.snapshot().dialog.text, /睁开眼睛/);
  const original = require("node:vm").runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../../pixel-version/finale-script.js"),
      "utf8",
    ) + ";JSON.stringify(FinaleScenes)",
  );
  assert.deepEqual(h.game.value("FinaleScenes"), JSON.parse(original));
  assert.equal(h.game.value("EFFLocal.enabled"), false);
});
test("three independent runtime claims resolve in MC practice", async () => {
  const s = await practice();
  for (const [i, goal] of ["body", "attribution", "bad_owned"].entries()) {
    const out = await s.handle({ op: "resolve", goal, useAgent: false });
    assert.equal(out.battle.revision, i + 1);
    if (i === 0) {
      assert.equal(out.battle.bodyOwner, "player");
      assert.equal(out.battle.attribution, "claimed");
      assert.equal(out.battle.endingLock, "pending");
    }
  }
  assert.equal(s.snapshot().battle.outcome, "won");
  assert.equal(s.snapshot().cinema.kind, "rebuild");
  assert.ok(
    s
      .snapshot()
      .receipts.every(
        (r) =>
          r.playerSource === "human" && r.intruderSource === "rule-template",
      ),
  );
});
test("two isolated plans use same revision and require human commit", async () => {
  const s = await practice();
  const p = await s.handle({ op: "plan", goal: "body", risk: "low" });
  assert.equal(p.battle.revision, 0);
  assert.equal(p.plan.player.proposal.observed_revision, 0);
  assert.equal(p.plan.intruder.proposal.observed_revision, 0);
  assert.equal(p.plan.player.source, "rule-template");
  await s.handle({ op: "resolve", goal: "body", useAgent: true });
  assert.equal(s.snapshot().battle.revision, 1);
  assert.equal(s.plan, null);
});
test("finite protocol refuses code, commands and extra fields", async () => {
  const s = new Session();
  await assert.rejects(
    s.handle({ op: "eval", source: "process.exit()" }),
    /OP_NOT_ALLOWED/,
  );
  await assert.rejects(
    s.handle({ op: "state", world_command: "op @a" }),
    /INVALID_REQUEST/,
  );
  await assert.rejects(
    s.handle({ op: "story", input: { action: "advance", source: "evil" } }),
    /INVALID_STORY_INPUT/,
  );
  await assert.rejects(
    s.handle({ op: "tick", dt: 0.2, x: 1, z: 1 }),
    /INVALID_TICK/,
  );
});
test("MC receipt is typed and kept out of player intent", async () => {
  const s = await practice();
  await s.handle({ op: "tick", dt: 0.05, x: 12, z: 8, world: facts });
  s.model.inferenceWorld = s.world;
  const o = s.model.observation(s.battle);
  assert.deepEqual(o.minecraft, facts);
  assert.equal(o.player_intent, undefined);
  assert.equal(o.seed, undefined);
  await assert.rejects(
    s.handle({
      op: "tick",
      dt: 0.05,
      x: 1,
      z: 1,
      world: { ...facts, command: "fill" },
    }),
    /INVALID_REQUEST/,
  );
  await assert.rejects(
    s.handle({
      op: "tick",
      dt: 0.05,
      x: 1,
      z: 1,
      world: { ...facts, dimension: "minecraft:overworld" },
    }),
    /INVALID_WORLD_RECEIPT/,
  );
});
test("pause stops practice deadline and resumed clock can lose", async () => {
  const s = await practice();
  await s.handle({ op: "pause", paused: true });
  for (let i = 0; i < 250; i++)
    await s.handle({ op: "tick", dt: 0.1, x: 12, z: 8 });
  assert.equal(s.snapshot().battle.remaining, 24);
  await s.handle({ op: "pause", paused: false });
  for (let i = 0; i < 245; i++)
    await s.handle({ op: "tick", dt: 0.1, x: 12, z: 8 });
  assert.equal(s.snapshot().battle.outcome, "lost");
  assert.equal(s.snapshot().battle.bodyOwner, "intruder");
});
test("stale or fabricated native control token is refused", () => {
  const h = new StoryHost();
  const first = h.snapshot();
  h.input({ action: "advance" });
  const second = h.snapshot();
  assert.ok(second.revision > first.revision);
  assert.throws(
    () =>
      h.input({
        action: "control",
        id: first.controls[0].id,
        revision: first.revision,
      }),
    /STALE/,
  );
  assert.throws(
    () =>
      h.input({
        action: "control",
        id: "control-bogus",
        revision: second.revision,
      }),
    /UNAVAILABLE/,
  );
});
test("original rain drops retain individual live click targets", () => {
  const h = new StoryHost();
  h.practice();
  h.game.evaluate("NarrativeTrials.startRain();");
  let s = h.snapshot();
  assert.equal(s.rain.mode, "intro");
  const begin = s.controls.find((c) => c.label.includes("开始接雨"));
  assert.ok(begin);
  h.input({ action: "control", id: begin.id, revision: s.revision });
  for (let i = 0; i < 60; i++) {
    h.step({ dt: 0.1 });
    s = h.snapshot();
    const key = s.controls.find(
      (c) => c.group === "rainDrops" && c.label !== "·",
    );
    if (key) {
      h.input({ action: "control", id: key.id, revision: s.revision });
      break;
    }
  }
  assert.ok(h.snapshot().rain.mask > 0);
});
test("canonical court requires original response order and preserves paragraphs", async () => {
  const s = new Session();
  s.story.practice();
  s.story.game.evaluate("playScript('refusal');");
  let state = s.snapshot();
  assert.ok(state.battle);
  assert.equal(state.story.ownership.target, 0);
  await assert.rejects(
    s.handle({ op: "resolve", goal: "attribution", useAgent: false }),
    /READ_CANONICAL_RESPONSE/,
  );
  const quote = state.story.dialog.text;
  await s.handle({ op: "resolve", goal: "body", useAgent: false });
  assert.equal(s.snapshot().story.dialog.text, quote);
  assert.equal(s.snapshot().story.ownership.claimed[0], true);
  await s.handle({ op: "story", input: { action: "advance" } });
  assert.match(s.snapshot().story.dialog.text, /撕扯/);
});
test("unconscious remains absent before original request", () => {
  const h = new StoryHost();
  h.game.evaluate(
    "closeDialog();G.area='meta';G.counters.finaleNode=0;Finale.enter();",
  );
  assert.equal(h.snapshot().finale.authorizedPast, false);
  const lines = h.game.value(
    "FinaleScenes.meta_state_3.text.map(v=>Finale.text(v))",
  );
  assert.ok(lines.findIndex((t) => t.includes("如果真的想帮上忙的话")) >= 0);
  assert.ok(lines.some((t) => t.includes("如你所愿")));
});
test("practice saves never overwrite canonical progress", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eff-mc-save-"));
  const s = new Session({ saveDir: dir });
  s.story.game.evaluate("closeDialog();F.mirror1=true;saveRun();");
  s.save();
  const before = fs.readFileSync(path.join(dir, "story.json"), "utf8");
  await s.handle({ op: "enter", mode: "practice" });
  await s.handle({ op: "close" });
  assert.equal(fs.readFileSync(path.join(dir, "story.json"), "utf8"), before);
  const resolved = fs.realpathSync(dir);
  assert.ok(
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith("eff-mc-save-"),
  );
  fs.rmSync(resolved, { recursive: true });
});
test("monotonic projection sequence rejects late UI regressions", async () => {
  const s = await practice();
  const a = s.snapshot(),
    b = s.snapshot();
  assert.ok(b.sequence > a.sequence);
});

test("original portrait raster carries blood and unknown identities into MC", () => {
  const h = new StoryHost();
  h.practice();
  h.game.evaluate("playScript('refusal');");
  let s = h.snapshot();
  assert.ok(s.dialog.portrait.length > 100);
  assert.ok(s.dialog.portrait.some((r) => r[4] === "#6d293f"));
  h.game.evaluate("playLines([{s:'？？？',t:'未知的话语'}]);");
  s = h.snapshot();
  assert.equal(s.dialog.speaker, "？？？");
  assert.ok(s.dialog.portrait.some((r) => r[4] === "#aabaca"));
});

test("moving rain drops retain live control identity", () => {
  const h = new StoryHost();
  h.practice();
  h.game.evaluate(
    'NarrativeTrials.startRain();NarrativeTrials.rain.mode="play";',
  );
  let s;
  for (let i = 0; i < 70; i++) {
    h.step({ dt: 0.1 });
    s = h.snapshot();
    if (s.controls.some((c) => c.group === "rainDrops" && c.label !== "·"))
      break;
  }
  const drop = s.controls.find(
    (c) => c.group === "rainDrops" && c.label !== "·",
  );
  assert.ok(drop);
  h.game.evaluate(
    "NarrativeTrials.rain.elapsed+=100;NarrativeTrials.paintDrops();",
  );
  const after = h.snapshot();
  assert.ok(after.controls.some((c) => c.id === drop.id));
  h.input({ action: "control", id: drop.id, revision: s.revision });
  assert.ok(h.snapshot().rain.mask > 0);
});

test("MC projection clock preserves original real-time rain deadline", () => {
  const h = new StoryHost();
  h.practice();
  h.game.evaluate(
    'NarrativeTrials.startRain();NarrativeTrials.rain.mode="play";',
  );
  for (let i = 0; i < 100; i++) h.step({ dt: 0.1 });
  const elapsed = h.game.value("NarrativeTrials.rain.elapsed");
  assert.ok(elapsed > 9900 && elapsed < 10100, `rain elapsed ${elapsed}`);
});
