"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  inferResearch,
  validateObservation,
  fallback,
} = require("../bridge/research-agent.cjs");
const { Session } = require("../bridge/session.cjs");
const base = () => ({
  revision: 4,
  instance: "instance-1",
  generation: 1,
  counterRounds: 0,
  fields: {
    "entity.avatar.alive": false,
    "control.tether.active": true,
    "event.possess.active": true,
  },
  checkpoints: [
    {
      handle: "checkpoint.origin",
      owner: "intruder",
      avatar: true,
      tether: true,
      possess: true,
    },
  ],
  watches: [],
  journal: [
    {
      actor: "native-observer",
      program: "entity removed",
      after: { "entity.avatar.alive": false },
    },
  ],
});
function model(selection) {
  return {
    enabled: true,
    model: "local-test:4b",
    profile: "quick",
    closed: false,
    job: null,
    calls: [],
    cancel() {
      if (this.job) this.job.abort();
      this.job = null;
    },
    async request(endpoint, body, signal) {
      this.calls.push(body);
      signal.throwIfAborted();
      return { message: { content: JSON.stringify(selection) }, eval_count: 9 };
    },
  };
}
test("intruder receives actual native receipts and composes a program rather than a fixed candidate id", async () => {
  const s = base(),
    m = model({
      statements: [
        { op: "restore", target: "checkpoint.origin" },
        {
          op: "restore",
          target: "checkpoint.origin",
          watch_name: "returner",
          condition_field: "entity.avatar.alive",
          condition_value: false,
        },
      ],
      explanation: "从仍有效的来源恢复。",
    });
  const p = await inferResearch(m, s, "intruder");
  assert.equal(p.source, "local-model");
  assert.match(p.program, /watch returner/);
  const sent = JSON.parse(m.calls[0].messages[1].content);
  assert.deepEqual(sent.journal, s.journal);
  assert.equal(sent.fields["entity.avatar.alive"], false);
  assert.equal(sent.player_intent, undefined);
  assert.equal(p.revision, 4);
});
test("protective goal is included only in the helper context and remains a suggestion", async () => {
  const m = model({
    statements: [{ op: "disable", target: "control.tether" }],
    explanation: "先切断执行。",
  });
  const p = await inferResearch(m, base(), "repression", "PRIVATE_INTENT");
  assert.equal(
    JSON.parse(m.calls[0].messages[1].content).player_intent,
    "PRIVATE_INTENT",
  );
  assert.equal(p.actor, "repression");
  assert.equal(base().fields["control.tether.active"], true);
});
test("fallback follows native recovery availability, not an assumed immortal avatar", () => {
  const s = base();
  assert.equal(
    fallback(s, "intruder", "offline").program,
    "restore checkpoint.origin",
  );
  s.checkpoints = [];
  s.fields["event.possess.active"] = false;
  assert.equal(
    fallback(s, "intruder", "offline").program,
    "inspect instance.world",
  );
});
test("invalid model output is explicitly labelled fallback", async () => {
  const m = model({
    statements: [{ op: "exec", target: "process.shell" }],
    explanation: "bad",
  });
  const p = await inferResearch(m, base(), "intruder");
  assert.equal(p.source, "rule-template");
  assert.equal(p.reason, "MODEL_INVALID_RESEARCH_PROGRAM");
});
test("cancelled inference is never converted into a counterattack", async () => {
  const m = model({});
  m.request = async () => {
    m.job.abort();
    throw Error("MODEL_CANCELLED");
  };
  await assert.rejects(
    () => inferResearch(m, base(), "intruder"),
    /MODEL_CANCELLED/,
  );
});
test("research observations and free-form intent are bounded", async () => {
  assert.throws(
    () => validateObservation({ ...base(), revision: -1 }),
    /INVALID/,
  );
  await assert.rejects(
    () => inferResearch(model({}), base(), "intruder", "x".repeat(241)),
    /INVALID_RESEARCH_ACTOR/,
  );
});
test("research starts without canonical response buttons or the practice surrender timer", async () => {
  const s = new Session();
  try {
    let x = await s.handle({ op: "enter", mode: "research" });
    assert.equal(x.mode, "research");
    assert.equal(x.battle, null);
    for (let i = 0; i < 250; i++)
      x = await s.handle({ op: "tick", dt: 0.1, x: 5, z: 5 });
    assert.equal(x.battle, null);
    assert.equal(x.mode, "research");
    await assert.rejects(
      () => s.handle({ op: "story", input: { action: "advance" } }),
      /PRACTICE_HAS_NO_CANONICAL_ADVANCE/,
    );
  } finally {
    s.model.close();
  }
});

test("typed instruction output cannot turn natural-language explanations into executable programs", async () => {
  const m = model({ statements: ["恢复检查点"], explanation: "恢复。" });
  const p = await inferResearch(m, base(), "intruder");
  assert.equal(p.source, "rule-template");
  assert.equal(p.reason, "MODEL_INVALID_RESEARCH_PROGRAM");
});


test("runtime intervention proposals require real managed faults and unrevoked recovery", async () => {
  for (const [managed, faulted, authorized, expected] of [
    [false, false, true, false],
    [true, false, true, false],
    [true, true, false, false],
    [true, true, true, true],
  ]) {
    const s = base();
    s.fields["authority.recovery.active"] = authorized;
    if (managed) s.runtime = { events: faulted ? [{ type: "worker-replaced", reason: "WORKER_PROGRESS_TIMEOUT", role: "execution" }] : [] };
    const m = model({ statements: [{ op: "rebuild", target: "runtime.execution" }], explanation: "依据实际故障替换执行进程。" });
    const result = await inferResearch(m, s, "intruder");
    assert.equal(result.source === "local-model", expected);
    const observed = JSON.parse(m.calls[0].messages[1].content);
    assert.equal(observed.currently_valid_primitive_commands.includes("rebuild runtime.execution"), expected);
    if (managed) assert.deepEqual(observed.runtime, s.runtime);
  }
});
