// offsetrun.js：按处理预算处理并留账
import { report, waterOf, laggingOf } from "./offsets.js";

function codes(spec) {
  return {
    stale: spec.stale_error_code || "E_STALE_OFFSET",
    value: spec.value_error_code || "E_BAD_OFFSET",
    event: spec.event_error_code || "E_BAD_EVENT"
  };
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isValidOffset(offset) {
  return typeof offset === "number" && Number.isInteger(offset) && offset >= 0;
}

function validateEvent(event, spec) {
  const named = codes(spec);
  if (!event || typeof event !== "object" || Array.isArray(event)
      || event.kind !== "report" || typeof event.replica !== "string"
      || !("offset" in event)) {
    fail(named.event, "bad event");
  }
  if (!isValidOffset(event.offset)) {
    fail(named.value, "bad offset");
  }
}

function keyOf(event) {
  return "id" in event
    ? "id:" + String(event.id)
    : "row:" + JSON.stringify([event.kind, event.replica, event.offset]);
}

function snapshot(offsets, ledger, applied) {
  return {
    offsets: offsets,
    water: waterOf(offsets),
    lagging: laggingOf(offsets),
    ledger: ledger,
    applied: applied
  };
}

function applyEvent(event, offsets, spec) {
  const named = codes(spec);
  const current = offsets.find(function (row) { return row[0] === event.replica; });
  if (current && event.offset <= current[1]) {
    fail(named.stale, "stale offset");
  }
  return report(offsets, event.replica, event.offset);
}

function cloneOffsets(offsets) {
  return offsets.map(function (row) { return [row[0], row[1]]; });
}

function seenOf(applied) {
  const seen = {};
  for (const key of applied) seen[key] = true;
  return seen;
}

export function step(spec) {
  const state = spec.state || { offsets: [], water: 0, lagging: [], ledger: [], applied: [] };
  const events = spec.events || [];
  for (const event of events) validateEvent(event, spec);

  let offsets = cloneOffsets(state.offsets);
  const applied = state.applied.slice();
  const seen = seenOf(applied);
  const pending = state.ledger.concat(events);
  const ledger = [];

  let budget = spec.budget || 0;
  let served = 0;
  let judged = 0;
  for (const event of pending) {
    judged += 1;
    const key = keyOf(event);
    if (seen[key]) continue;
    if (budget <= 0) {
      ledger.push(event);
      continue;
    }
    offsets = applyEvent(event, offsets, spec);
    applied.push(key);
    seen[key] = true;
    budget -= 1;
    served += 1;
  }

  return {
    state: snapshot(offsets, ledger, applied),
    served: served,
    ledger_before: ledger.length,
    ledger: ledger.map(function (event) { return [event.kind, event.replica, event.offset]; }),
    judged: judged,
    judged_bound: pending.length
  };
}

export function close(spec) {
  const state = spec.state || { offsets: [], water: 0, lagging: [], ledger: [], applied: [] };
  let offsets = cloneOffsets(state.offsets);
  const applied = state.applied.slice();
  const seen = seenOf(applied);

  let catchup = 0;
  for (const event of state.ledger) {
    const key = keyOf(event);
    if (seen[key]) continue;
    offsets = applyEvent(event, offsets, spec);
    applied.push(key);
    seen[key] = true;
    catchup += 1;
  }

  return { state: snapshot(offsets, [], applied), catchup: catchup };
}
