"use strict";
const crypto = require("node:crypto");
const { createStoryEngine, HostEvent } = require("./headless-story.cjs");
class StoryHost {
  constructor(storage = {}) {
    this.game = createStoryEngine(storage);
    this.controls = new Map();
    this.elementIds = new WeakMap();
    this.nextElementId = 0;
    this.revision = 0;
    this.lastKey = "";
    this.externalPause = false;
    this.game.ids.get("startButton").click();
  }
  visible(e) {
    if (!this.game.document.body.contains(e)) return false;
    for (let p = e; p?.nodeType === 1; p = p.parentNode)
      if (
        p.hidden ||
        (p.tagName === "DIALOG" && !p.open) ||
        p.style.display === "none"
      )
        return false;
    return true;
  }
  snapshot() {
    const h = this.game;
    const state = h.value(`(()=>{
   const m=MAPS[G.area];
   return {area:G.area,name:m.name,grid:m.grid,pose:{x:G.px/16,z:G.py/16,dir:G.dir},spawn:m.spawn,
    shard:m.shard?{x:m.shard.x,z:m.shard.y,name:m.shard.name,collected:META.shards.includes(m.shard.name)}:null,
    points:(m.interact||[]).map(p=>({id:p.id,x:p.x,z:p.y,label:p.label})),exits:m.exits||[],
    npcs:(m.npcs||[]).filter(n=>(!n.cond||F[n.cond])&&!StoryStaging.npc(n).hidden).map(n=>({id:n.id,x:StoryStaging.npc(n).x,z:StoryStaging.npc(n).y,name:n.label||n.id,kind:n.kind,pose:StoryStaging.npc(n).pose})),
    dialog:{active:dialogActive,speaker:ui.dialogSpeaker.textContent,text:dialogActive?currentFullText():'',index:dialogIndex,count:dialogLines.length},
    ending:ui.ending.hidden?null:{code:ui.endingCode.textContent,name:ui.endingName.textContent,text:ui.endingText.textContent},
    gate:G.area==='blood'&&currentDialogScript===SCRIPTS.accuse&&!!dialogChoices,
    ownership:{active:PhenomenonBattle.phase==='ownership',pending:PhenomenonBattle.pending,target:PhenomenonBattle.cue?.target??-1,claimed:[...PhenomenonBattle.claimed]},
    finale:{active:Finale.active(),node:Finale.node(),step:Finale.step(),authorizedPast:Finale.intervening(),rewritten:!!F.finaleRewritten},
    storm:{stage:StormFlight.stage,scroll:StormFlight.scroll,pose:StormFlight.pose,approach:StormFlight.approach},
    stage:{scene:StoryStaging.scene,focus:StoryStaging.focus,tower:StoryStaging.tower,pose:StoryStaging.pose,family:StoryStaging.family,coffin:StoryStaging.coffin,heartReleased:StoryStaging.heartReleased},
    court:NarrativeTrials.court?{mode:NarrativeTrials.court.mode,remaining:NarrativeTrials.court.remaining}:null,
    agency:{active:NarrativeAgency.active(),kind:NarrativeAgency.pending?.kind||''},
    rain:NarrativeTrials.rain?{mode:NarrativeTrials.rain.mode,mask:NarrativeTrials.rain.mask,elapsed:NarrativeTrials.rain.elapsed,drops:NarrativeTrials.rain.drops}:null,
    flags:{parents:!!F.parents,sister:!!F.sister},memories:G.memories,paused:Expedition.paused()};
  })()`);
    const controls = [],
      fields = [];
    this.controls.clear();
    const visit = (e, key) => {
      if (e.nodeType !== 1 || !this.visible(e)) return;
      if (
        (e.listeners?.has("click") ||
          (e.tagName === "BUTTON" &&
            e.type === "submit" &&
            e.closest("form")?.listeners?.has("submit"))) &&
        (e.tagName === "BUTTON" || e.getAttribute("role") === "button")
      ) {
        let id = this.elementIds.get(e);
        if (!id) {
          id =
            "control-" +
            crypto
              .createHash("sha256")
              .update(String(++this.nextElementId))
              .digest("hex")
              .slice(0, 12);
          this.elementIds.set(e, id);
        }
        const label = e.textContent.trim().replace(/\s+/g, " ");
        if (label) {
          this.controls.set(id, e);
          let group = "utility";
          for (let p = e; p?.nodeType === 1; p = p.parentNode)
            if (
              [
                "dialogChoices",
                "agencyCards",
                "agencyActions",
                "rainDrops",
                "rainTrial",
                "historyAnchors",
                "endingOverlay",
                "dialogText",
              ].includes(p.id)
            ) {
              group = p.id;
              break;
            }
          controls.push({
            id,
            label,
            group,
            left: e.style.left || "",
            top: e.style.top || "",
            disabled: !!e.disabled,
          });
        }
      }
      if (
        ["INPUT", "SELECT"].includes(e.tagName) &&
        e.id &&
        !["range", "checkbox", "file"].includes(e.type)
      ) {
        fields.push({
          id: e.id,
          value: e.value || "",
          options:
            e.tagName === "SELECT"
              ? e.children.map((c) => ({
                  value: c.value,
                  label: c.textContent.trim(),
                }))
              : [],
        });
      }
      e.children?.forEach((c, i) => visit(c, key + "/" + i));
    };
    visit(h.document.body, "body");
    state.controls = controls.slice(0, 80);
    state.fields = fields.slice(0, 12);
    state.dialog.portrait = h.value(
      `(()=>{const p=PixelArt.profile(dialogLines[dialogIndex]);if(!p||PixelArt.frame.hidden)return [];const rect=[];const c={fillStyle:'#000000',clearRect(){},fillRect(x,y,w,h){rect.push([x,y,w,h,this.fillStyle]);}};PixelArt.portrait(c,p);return rect;})()`,
    );
    state.auxiliary = [
      "agencyHeading",
      "agencyQuote",
      "agencyStatus",
      "trialHeading",
      "trialStatus",
      "rainClock",
      "rainKeys",
      "rainFeedback",
      "renameStatus",
      "journalContent",
      "codexMemories",
      "codexShards",
      "codexEndings",
      "objectiveText",
      "statusMessage",
    ]
      .map((id) => h.ids.get(id))
      .filter((e) => e && this.visible(e))
      .map((e) => e.textContent.trim())
      .filter(Boolean);
    const key = JSON.stringify({
      area: state.area,
      dialog: state.dialog,
      ending: state.ending,
      controls: state.controls.map(({ left, top, ...c }) => c),
      fields: state.fields,
      auxiliary: state.auxiliary,
      finale: state.finale,
    });
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.revision++;
    }
    state.revision = this.revision;
    return state;
  }
  practice() {
    this.game.evaluate(
      "closeDialog();G.area='blood';G.px=MAPS.blood.spawn.x*16+3;G.py=MAPS.blood.spawn.y*16+2;F.sister=true;F.parents=true;buildTileCache();Expedition.onAreaChange();Expedition.chapterTime=0;Expedition.dom.chapterCard.classList.remove('visible');",
    );
  }
  input(input) {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      typeof input.action !== "string"
    )
      throw Error("INVALID_STORY_INPUT");
    const allowed = {
      advance: ["action"],
      interact: ["action"],
      control: ["action", "revision", "id"],
      field: ["action", "id", "value"],
      pause: ["action", "paused"],
    };
    if (
      !allowed[input.action] ||
      Object.keys(input).some((k) => !allowed[input.action].includes(k))
    )
      throw Error("INVALID_STORY_INPUT");
    const h = this.game;
    if (input.action === "advance") {
      h.evaluate(
        "if(NarrativeAgency.active()){}else if(NarrativeTrials.rainActive())NarrativeTrials.interact();else if(dialogActive){if(!typeDone)advanceDialog();advanceDialog();}else tryInteract();",
      );
    } else if (input.action === "interact")
      h.evaluate("if(!NarrativeAgency.active())tryInteract();");
    else if (input.action === "control") {
      const e = this.controls.get(input.id);
      if (
        !Number.isSafeInteger(input.revision) ||
        input.revision < 1 ||
        input.revision > this.revision ||
        (input.revision !== this.revision && !e?.closest("#rainDrops"))
      )
        throw Error("STALE_STORY_CONTROL");
      if (!e || e.disabled || !this.visible(e))
        throw Error("CONTROL_UNAVAILABLE");
      e.click();
      if (e.type === "submit")
        e.closest("form")?.dispatchEvent(
          new HostEvent("submit", { bubbles: true }),
        );
    } else if (input.action === "field") {
      const current = this.snapshot().fields.find((f) => f.id === input.id);
      if (
        !current ||
        typeof input.value !== "string" ||
        input.value.length > 80 ||
        (current.options.length &&
          !current.options.some((o) => o.value === input.value))
      )
        throw Error("INVALID_FIELD");
      h.ids.get(input.id).value = input.value;
      h.ids
        .get(input.id)
        .dispatchEvent(new HostEvent("input", { bubbles: true }));
      h.ids
        .get(input.id)
        .dispatchEvent(new HostEvent("change", { bubbles: true }));
    } else if (input.action === "pause") {
      if (typeof input.paused !== "boolean") throw Error("INVALID_PAUSE");
      this.externalPause = input.paused;
      h.document.hidden = input.paused;
    } else throw Error("STORY_ACTION_NOT_ALLOWED");
    h.tick(0);
    return this.snapshot();
  }
  step({ dt = 0.05, x, z } = {}) {
    if (!Number.isFinite(dt) || dt < 0 || dt > 0.1)
      throw Error("INVALID_STORY_STEP");
    const h = this.game;
    if (Number.isFinite(x) && Number.isFinite(z)) {
      const area = h.value(
        "({area:G.area,active:dialogActive||transitionLock,rows:MAPS[G.area].grid.length,cols:MAPS[G.area].grid[0].length})",
      );
      if (!area.active && x >= 0 && z >= 0 && x < area.cols && z < area.rows) {
        h.context.mcPose = { x: x * 16, z: z * 16 };
        h.evaluate("G.px=mcPose.x;G.py=mcPose.z;");
      }
    }
    if (!this.externalPause) {
      // The original engine clamps each frame to 50 ms. Substep the 10 Hz MC projection to preserve its real-time deadlines.
      const frames = Math.max(1, Math.ceil(dt / 0.04));
      for (let i = 0; i < frames; i++) {
        h.tick((dt * 1000) / frames);
        h.frame(0);
      }
    }
    return this.snapshot();
  }
  storage() {
    this.game.evaluate("saveRun(true);saveMeta();");
    return this.game.snapshot();
  }
}
module.exports = { StoryHost };
