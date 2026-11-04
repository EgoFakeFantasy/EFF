"use strict";
// Admission control for the MC host channel. It runs only inside the controller, never in MC:
// code that a mod, mixin or agent loads into the MC JVM can read the host lease and sign requests,
// so a valid signature proves "came from the MC process", not "came from the player".
// Everything here is decided from controller-side state the MC process cannot reach.
const LIMITS = Object.freeze({
  // Requests per rolling minute. Human typing and the story bridge's counter cadence stay far below these.
  player: 12, intruder: 8, "native-observer": 4, snapshot: 240, heartbeat: 150,
});
const FIELDS = Object.freeze({
  heartbeat: ["op", "session", "epoch", "requestId", "sequence", "clientTick", "serverTick", "paused", "active", "projection"],
  goodbye: ["op", "session", "epoch", "requestId"],
  snapshot: ["op", "session", "epoch", "requestId"],
  execute: ["op", "session", "epoch", "requestId", "source", "revision", "actor"],
});
// Control characters, bidi overrides and zero-width marks let a command read differently in logs and UI
// than what the kernel executes. Programs are plain text: reject them outright instead of normalizing.
const DISGUISE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ￹-￻]/u;
const STRIKE_WINDOW = 60000, STRIKE_LIMIT = 3, GOODBYE_EXIT = 30000;

class HostFirewall {
  constructor(clock) { this.clock = clock; this.reset(); }
  // A new host epoch starts with a clean slate; quarantine of the old host already fenced its lease.
  reset() { this.windows = new Map(); this.strikes = []; this.goodbye = null; this.quarantined = null; }
  strike(reason) {
    const now = this.clock();
    this.strikes = this.strikes.filter(t => now - t < STRIKE_WINDOW);
    this.strikes.push(now);
    if (this.strikes.length >= STRIKE_LIMIT && !this.quarantined) this.quarantined = reason;
    return Object.assign(Error(reason), { intrusion: true });
  }
  rate(key) {
    const now = this.clock(), limit = LIMITS[key];
    const list = (this.windows.get(key) || []).filter(t => now - t < 60000);
    this.windows.set(key, list);
    if (list.length >= limit) return false;
    list.push(now); return true;
  }
  // Throws on refusal. Errors flagged `intrusion` count toward quarantine of the whole host.
  admit(r) {
    if (this.quarantined) throw Object.assign(Error("HOST_QUARANTINED"), { intrusion: false });
    if (!r || typeof r !== "object" || Array.isArray(r) || !Object.hasOwn(FIELDS, r.op)) throw this.strike("CONTROLLER_OP_NOT_ALLOWED");
    const allowed = FIELDS[r.op];
    for (const key of Object.keys(r)) if (!allowed.includes(key)) throw this.strike("HOST_UNEXPECTED_FIELD");
    // After goodbye nothing may change state. Reads during a real shutdown are refused quietly;
    // commands are refused and counted, since a quitting client has no player left to issue them.
    if (this.goodbye && r.op !== "heartbeat") {
      if (r.op === "execute") throw this.strike("HOST_ACTIVE_AFTER_GOODBYE");
      throw Object.assign(Error("HOST_STOPPING"), { intrusion: false });
    }
    if (r.op === "execute") {
      if (typeof r.source !== "string" || DISGUISE.test(r.source)) throw this.strike("PROGRAM_DISGUISED_TEXT");
      if (!Object.hasOwn(LIMITS, r.actor) || ["snapshot", "heartbeat"].includes(r.actor)) throw this.strike("INVALID_PROGRAM_ACTOR");
      if (!this.rate(r.actor)) throw this.strike("HOST_COMMAND_FLOOD");
    } else if (!["goodbye"].includes(r.op) && !this.rate(r.op)) throw this.strike("HOST_COMMAND_FLOOD");
  }
  // A real goodbye comes from MC's shutdown hook: client ticks stop and the process exits.
  // Ticking on, or more commands, means something inside MC is pretending the player quit.
  // The baseline is the first heartbeat after goodbye, not the last one before it: MC may tick between the two.
  noteGoodbye() { if (!this.goodbye) this.goodbye = { at: this.clock(), clientTick: null }; }
  checkHeartbeat(clientTick) {
    if (!this.goodbye) return;
    if (this.goodbye.clientTick === null) { this.goodbye.clientTick = clientTick; return; }
    if (clientTick > this.goodbye.clientTick) throw this.strike("HOST_ACTIVE_AFTER_GOODBYE");
  }
  goodbyeExpired() { return !!this.goodbye && this.clock() - this.goodbye.at > GOODBYE_EXIT; }
}

// JVM switches that load code into a process before its main class. The sealer refuses them when it
// builds the launch manifest; the controller refuses them again at every spawn in case a manifest was not
// produced by the sealer (development launches) or was edited after sealing.
const INJECTION = /^(@|-javaagent:|-agentlib:|-agentpath:|-Xbootclasspath|--patch-module|-XX:(OnError|OnOutOfMemoryError)=|-XX:-DisableAttachMechanism)/i;
function assertNoInjection(args) {
  for (const a of args) if (INJECTION.test(String(a))) throw Error("HOST_JVM_INJECTION_REFUSED");
}

module.exports = { HostFirewall, assertNoInjection, LIMITS, DISGUISE, STRIKE_LIMIT, GOODBYE_EXIT };
