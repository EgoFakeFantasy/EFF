"use strict";
const readline = require("node:readline"),
  path = require("node:path");
const { Session } = require("./session.cjs");
const saveDir = process.argv[2];
if (!saveDir || !path.isAbsolute(saveDir)) {
  process.stderr.write("EFF bridge requires an absolute save directory\n");
  process.exit(2);
}
const session = new Session({ saveDir });
let inFlight = 0,
  closed = false;
const line = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});
line.on("line", async (text) => {
  let id = 0;
  try {
    if (closed || text.length > 16384 || ++inFlight > 4)
      throw Error("REQUEST_BUDGET");
    const r = JSON.parse(text);
    if (!r || !Number.isSafeInteger(r.id) || r.id < 1 || !r.request)
      throw Error("INVALID_ENVELOPE");
    id = r.id;
    const result = await session.handle(r.request);
    process.stdout.write(JSON.stringify({ id, ok: true, result }) + "\n");
    if (r.request.op === "close") {
      closed = true;
      line.close();
    }
  } catch (e) {
    process.stdout.write(
      JSON.stringify({
        id,
        ok: false,
        error: /^[A-Z0-9_]+$/.test(e.message) ? e.message : "BRIDGE_FAILURE",
      }) + "\n",
    );
  } finally {
    inFlight = Math.max(0, inFlight - 1);
  }
});
line.on("close", () => {
  closed = true;
  session.model.close();
  try {
    session.save();
  } catch {}
});
process.on("uncaughtException", (e) => {
  process.stderr.write("EFF bridge stopped: " + e.name + "\n");
  session.model.close();
  process.exit(1);
});
