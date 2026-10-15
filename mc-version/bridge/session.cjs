"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const { StoryHost } = require("./story-host.cjs");
const base = fs.existsSync(
  path.join(__dirname, "../local-version/phenomenon-runtime.js"),
)
  ? path.join(__dirname, "..")
  : path.join(__dirname, "../..");
const Runtime = require(path.join(base, "local-version/phenomenon-runtime.js"));
const Policies = require(path.join(base, "local-version/agent-policies.js"));
const { ModelClient } = require(path.join(base, "desktop/model-client.cjs"));
const TARGETS = ["body", "attribution", "bad_owned"];
const record = (v) => v && typeof v === "object" && !Array.isArray(v);
function shape(v, keys) {
  if (!record(v) || Object.keys(v).some((k) => !keys.includes(k)))
    throw Error("INVALID_REQUEST");
}
class McModelClient extends ModelClient {
  observation(state) {
    return {
      ...super.observation(state),
      minecraft: this.inferenceWorld || null,
    };
  }
}
class Session {
  constructor({ model = new McModelClient(), saveDir = null } = {}) {
    this.model = model;
    this.saveDir = saveDir;
    this.story = new StoryHost(this.load());
    this.mode = "story";
    this.battle = null;
    this.plan = null;
    this.pending = false;
    this.paused = false;
    this.serial = 0;
    this.token = 0;
    this.elapsed = 0;
    this.feedback = "";
    this.receipts = [];
    this.world = null;
    this.catalog = [];
    this.cinema = { serial: 0, kind: "none", quote: "" };
    this.lastFinale = "";
    this.sequence = 0;
  }
  load() {
    try {
      const x = JSON.parse(
        fs.readFileSync(path.join(this.saveDir, "story.json"), "utf8"),
      );
      if (!record(x) || JSON.stringify(x).length > 1500000) return {};
      return x;
    } catch {
      return {};
    }
  }
  save() {
    if (!this.saveDir || this.mode !== "story") return;
    fs.mkdirSync(this.saveDir, { recursive: true });
    if (this.battle) {
      const battleFile = path.join(this.saveDir, "battle.json");
      fs.writeFileSync(
        battleFile + ".tmp",
        JSON.stringify(Runtime.checkpoint(this.battle)),
      );
      fs.renameSync(battleFile + ".tmp", battleFile);
    }
    const file = path.join(this.saveDir, "story.json");
    fs.writeFileSync(file + ".tmp", JSON.stringify(this.story.storage()));
    fs.renameSync(file + ".tmp", file);
  }
  cue(kind, quote = "") {
    this.cinema = {
      serial: ++this.serial,
      kind,
      quote: String(quote).slice(0, 700),
    };
  }
  battleStart() {
    this.battle = Runtime.initial({
      battleId: "court-mc-" + ++this.token,
      seed: 271828,
    });
    if (this.mode === "story") {
      const claimed = this.story.snapshot().ownership.claimed;
      try {
        const saved = Runtime.replay(
          JSON.parse(
            fs.readFileSync(path.join(this.saveDir, "battle.json"), "utf8"),
          ),
        );
        if (
          [
            saved.bodyOwner === "player",
            saved.attribution === "rejected",
            saved.endingLock === "uncommitted",
          ].every((v, i) => v === claimed[i])
        )
          this.battle = saved;
      } catch {}
      for (let i = 0; i < 3; i++)
        if (claimed[i] && Runtime.pending(this.battle, TARGETS[i]))
          this.battle = Runtime.resolveRound(
            this.battle,
            Policies.make(this.battle, TARGETS[i]),
            Policies.intruder(this.battle),
          );
    }
    this.elapsed = 0;
    this.plan = null;
    this.feedback =
      "实体的控制者、强加的归责与尚未提交的结局，分别对应 MC 的三条运行规则。";
    this.cue("claim", "这些身体与这段现实，已经被外来的意志牵引。");
  }
  observeStory() {
    const s = this.story.snapshot();
    if (this.mode === "story" && s.area === "mirror" && this.battle) {
      this.battle = null;
      this.plan = null;
      this.lastFinale = "";
    }
    if (
      this.mode === "story" &&
      this.battle?.outcome === "pending" &&
      s.court?.mode === "lost"
    ) {
      const p = {
        ...Policies.preserve(this.battle),
        action: "CONCEDE_OR_RETRY",
        target: "battle",
        reason_code: "CONCEDE",
      };
      this.battle = Runtime.resolveRound(
        this.battle,
        p,
        Policies.intruder(this.battle),
      );
      this.cue("lost", s.dialog.text);
    }
    if (this.mode === "story" && s.ownership.active && !this.battle)
      this.battleStart();
    const key =
      s.finale.node + "|" + s.finale.authorizedPast + "|" + s.finale.rewritten;
    if (s.finale.active && key !== this.lastFinale) {
      this.lastFinale = key;
      this.cue(
        s.finale.rewritten
          ? "past"
          : s.finale.authorizedPast
            ? "intervention"
            : "history",
        s.dialog.text,
      );
    }
    return s;
  }
  snapshot() {
    const story = this.observeStory();
    return {
      protocol: 1,
      sequence: ++this.sequence,
      mode: this.mode,
      story,
      battle: this.battle
        ? {
            ...Runtime.summary(this.battle),
            battleId: this.battle.battleId,
            target:
              this.mode === "story"
                ? TARGETS[story.ownership.target] || ""
                : null,
            ready: this.mode === "practice" || story.ownership.pending,
            candidates: Policies.candidates(this.battle, "repression").map(
              (c) => ({ id: c.id, label: c.label, target: c.proposal.target }),
            ),
            events: this.battle.events.slice(0, 3),
            history: this.battle.history.slice(-6),
            remaining: Math.max(0, 24 - this.elapsed),
          }
        : null,
      plan: this.plan,
      pending: this.pending,
      paused: this.paused,
      feedback: this.feedback,
      models: this.catalog,
      modelConfig: this.model.config(),
      cinema: this.cinema,
      world: this.world,
      receipts: this.receipts.slice(-12),
    };
  }
  async handle(req) {
    const shapes = {
      state: ["op"],
      enter: ["op", "mode"],
      tick: ["op", "dt", "x", "z", "world"],
      story: ["op", "input"],
      plan: ["op", "goal", "risk"],
      resolve: ["op", "goal", "useAgent"],
      modelStatus: ["op"],
      modelConfigure: ["op", "enabled", "model", "profile"],
      pause: ["op", "paused"],
      cancel: ["op"],
      checkpoint: ["op"],
      close: ["op"],
    };
    if (!record(req) || !shapes[req.op]) throw Error("OP_NOT_ALLOWED");
    shape(req, shapes[req.op]);
    switch (req.op) {
      case "state":
        break;
      case "enter": {
        if (!["story", "practice"].includes(req.mode))
          throw Error("INVALID_MODE");
        this.save();
        this.model.cancel();
        this.pending = false;
        this.plan = null;
        this.battle = null;
        this.mode = req.mode;
        this.elapsed = 0;
        this.paused = false;
        this.story.input({ action: "pause", paused: false });
        if (req.mode === "practice") {
          this.story = new StoryHost();
          this.story.practice();
          this.battleStart();
        } else {
          this.story = new StoryHost(this.load());
          this.cue("arrive", "……睁开眼睛的时候，首先看到的是自己的手。");
        }
        break;
      }
      case "tick": {
        if (
          !Number.isFinite(req.dt) ||
          req.dt < 0 ||
          req.dt > 0.1 ||
          !Number.isFinite(req.x) ||
          !Number.isFinite(req.z) ||
          Math.abs(req.x) > 1000 ||
          Math.abs(req.z) > 1000
        )
          throw Error("INVALID_TICK");
        if (req.world !== undefined) {
          shape(req.world, [
            "generation",
            "frozen",
            "controller",
            "exitOpen",
            "attribution",
            "dimension",
          ]);
          if (
            !Number.isSafeInteger(req.world.generation) ||
            req.world.generation < 1 ||
            req.world.generation > 10000 ||
            typeof req.world.frozen !== "boolean" ||
            typeof req.world.exitOpen !== "boolean" ||
            !["player", "contested", "intruder"].includes(
              req.world.controller,
            ) ||
            !["claimed", "rejected"].includes(req.world.attribution) ||
            req.world.dimension !== "eff:phenomenon"
          )
            throw Error("INVALID_WORLD_RECEIPT");
          this.world = { ...req.world };
        }
        if (!this.paused && !this.pending) {
          this.story.step({ dt: req.dt, x: req.x, z: req.z });
          if (this.mode === "practice" && this.battle?.outcome === "pending") {
            this.elapsed += req.dt;
            if (this.elapsed >= 24) {
              const p = {
                ...Policies.preserve(this.battle),
                action: "CONCEDE_OR_RETRY",
                target: "battle",
                reason_code: "CONCEDE",
              };
              this.battle = Runtime.resolveRound(
                this.battle,
                p,
                Policies.intruder(this.battle),
              );
              this.cue("lost", "迟迟没有写入的回应，被外来的决定覆盖。");
            }
          }
        }
        break;
      }
      case "story": {
        if (this.pending) throw Error("MODEL_BUSY");
        if (this.mode === "practice")
          throw Error("PRACTICE_HAS_NO_CANONICAL_ADVANCE");
        if (
          this.battle?.outcome === "pending" &&
          this.story.snapshot().ownership.pending
        ) {
          const i = req.input;
          if (
            i?.action === "advance" ||
            (i?.action === "control" &&
              this.story.controls.get(i.id)?.parentNode ===
                this.story.game.ids.get("battleTargets"))
          )
            throw Error("USE_RUNTIME_RESPONSE");
        }
        this.story.input(req.input);
        break;
      }
      case "plan": {
        this.requireBattle(req.goal);
        if (this.pending) throw Error("MODEL_BUSY");
        this.pending = true;
        this.model.inferenceWorld = this.world ? { ...this.world } : null;
        const revision = this.battle.revision,
          battleId = this.battle.battleId;
        try {
          const result = await this.model.plan({
            snapshot: Runtime.checkpoint(this.battle),
            goal: req.goal,
            risk: req.risk || "low",
            includePlayer: true,
          });
          if (
            !this.battle ||
            this.battle.revision !== revision ||
            this.battle.battleId !== battleId
          )
            throw Error("STALE_REVISION");
          this.plan = result;
          this.feedback =
            "面向来源：" +
            result.player.source +
            "（" +
            (result.player.reason || result.player.model || "") +
            "）；外来者来源：" +
            result.intruder.source +
            "（" +
            (result.intruder.reason || result.intruder.model || "") +
            "）。建议尚未改变世界；由你决定是否采用。";
        } finally {
          this.pending = false;
        }
        break;
      }
      case "resolve": {
        this.requireBattle(req.goal);
        if (typeof req.useAgent !== "boolean") throw Error("INVALID_REQUEST");
        if (this.pending) throw Error("MODEL_BUSY");
        this.pending = true;
        this.model.inferenceWorld = this.world ? { ...this.world } : null;
        const state = this.battle,
          id = state.battleId,
          revision = state.revision;
        try {
          let plan = this.plan;
          if (
            !plan ||
            plan.battleId !== id ||
            plan.revision !== revision ||
            (req.useAgent && !plan.player)
          )
            plan = await this.model.plan({
              snapshot: Runtime.checkpoint(state),
              goal: req.goal,
              includePlayer: req.useAgent,
            });
          if (this.battle !== state) throw Error("STALE_REVISION");
          const player = req.useAgent
            ? plan.player.proposal
            : Policies.make(state, req.goal);
          const s = this.story.snapshot();
          if (
            this.mode === "story" &&
            TARGETS[s.ownership.target] !== player.target
          )
            throw Error("CANONICAL_RESPONSE_ORDER");
          const next = Runtime.resolveRound(
            state,
            player,
            plan.intruder.proposal,
          );
          if (
            (this.mode === "story" && next.bodyOwner !== state.bodyOwner) ||
            (this.mode === "story" && next.attribution !== state.attribution) ||
            (this.mode === "story" && next.endingLock !== state.endingLock)
          ) {
            this.story.game.evaluate("if(!typeDone)advanceDialog();");
            if (
              !this.story.game.evaluate(
                "PhenomenonBattle.commit(" +
                  TARGETS.indexOf(player.target) +
                  ")",
              )
            )
              throw Error("CANONICAL_COMMIT_REJECTED");
          }
          this.battle = next;
          this.elapsed = 0;
          this.plan = null;
          this.save();
          this.receipts.push({
            revision: next.revision,
            player: player.target,
            intruder: plan.intruder.proposal.target,
            playerSource: req.useAgent ? plan.player.source : "human",
            intruderSource: plan.intruder.source,
            after: Runtime.summary(next),
          });
          this.feedback =
            (req.useAgent ? "采用面向建议。" : "你亲自作出了回应。") +
            " 外来者：" +
            plan.intruder.explanation +
            (plan.intruder.source === "rule-template"
              ? "（规则后备：" + plan.intruder.reason + "）"
              : "（本地模型）");
          this.cue(
            next.outcome === "won"
              ? "rebuild"
              : next.outcome === "lost"
                ? "lost"
                : player.target === "body"
                  ? "entity"
                  : player.target === "attribution"
                    ? "attribution"
                    : "ending",
            s.dialog.text,
          );
          if (next.outcome === "lost" && this.mode === "story")
            this.story.game.evaluate("NarrativeTrials.loseCourt();");
        } finally {
          this.pending = false;
        }
        break;
      }
      case "modelStatus": {
        const s = await this.model.status();
        this.catalog = s.models.map((m) => m.name);
        break;
      }
      case "modelConfigure":
        await this.model.configure({
          enabled: req.enabled,
          model: req.model,
          profile: req.profile,
        });
        this.plan = null;
        break;
      case "pause":
        if (typeof req.paused !== "boolean") throw Error("INVALID_PAUSE");
        this.paused = req.paused;
        this.story.input({ action: "pause", paused: req.paused });
        break;
      case "cancel":
        this.model.cancel();
        this.plan = null;
        break;
      case "checkpoint":
        this.save();
        break;
      case "close":
        this.model.close();
        this.save();
        break;
    }
    return this.snapshot();
  }
  requireBattle(goal) {
    if (!this.battle || this.battle.outcome !== "pending")
      throw Error("BATTLE_FINISHED");
    if (
      !Object.hasOwn(Policies.goals, goal) ||
      !Runtime.pending(this.battle, goal)
    )
      throw Error("INVALID_GOAL");
    const s = this.story.snapshot();
    if (
      this.mode === "story" &&
      (!s.ownership.pending || TARGETS[s.ownership.target] !== goal)
    )
      throw Error("READ_CANONICAL_RESPONSE_FIRST");
  }
}
module.exports = { Session, McModelClient, Runtime, Policies };
