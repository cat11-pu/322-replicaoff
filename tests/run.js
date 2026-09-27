import assert from "node:assert";
import { report, waterOf, laggingOf } from "../offsets.js";
import { step, close } from "../offsetrun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { offsets: [], water: 0, lagging: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "report", replica: "a", offset: 5 }],
  stale_error_code: "E_STALE_OFFSET", value_error_code: "E_BAD_OFFSET",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("report returns offsets", () => {
  assert.ok(Array.isArray(report([], "z", 1)));
});

check("waterOf returns a number", () => {
  assert.strictEqual(typeof waterOf([["z", 3]]), "number");
});

check("laggingOf returns a list", () => {
  assert.ok(Array.isArray(laggingOf([["z", 3]])));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
