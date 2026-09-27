// offsetrun.js：按共用处理预算步进，超限事件压账，收尾时不限预算清账
import { report, waterOf, laggingOf } from "./offsets.js";

const STALE_CODE = "E_STALE_OFFSET";
const BAD_OFFSET_CODE = "E_BAD_OFFSET";
const BAD_EVENT_CODE = "E_BAD_EVENT";

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function codesOf(spec) {
  return {
    stale: (spec && spec.stale_error_code) || STALE_CODE,
    offset: (spec && spec.value_error_code) || BAD_OFFSET_CODE,
    event: (spec && spec.event_error_code) || BAD_EVENT_CODE
  };
}

function isNonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function itemKey(item) {
  return item[0] + "\u0000" + item[1] + "\u0000" + item[2];
}

function cloneItem(row) {
  return [row[0], row[1], row[2]];
}

function cloneState(state) {
  state = state || {};
  return {
    offsets: (Array.isArray(state.offsets) ? state.offsets : []).map(function (row) {
      return [row[0], row[1]];
    }),
    water: 0,
    lagging: [],
    ledger: (Array.isArray(state.ledger) ? state.ledger : []).map(cloneItem),
    applied: (Array.isArray(state.applied) ? state.applied : []).map(cloneItem)
  };
}

function refresh(state) {
  state.water = waterOf(state.offsets);
  state.lagging = laggingOf(state.offsets);
}

// 结构先验，与预算无关；偏移值随后验。任何一条不过都抛错，且不改动跨轮状态。
function validateEvent(event, codes) {
  const badEvent = codedError(codes.event, "illegal event structure");
  if (event === null || typeof event !== "object" || Array.isArray(event)) throw badEvent;
  if (event.kind !== "report") throw badEvent;
  if (typeof event.replica !== "string" || event.replica.length === 0) throw badEvent;
  if (!isNonNegativeInteger(event.offset)) {
    throw codedError(codes.offset, "offset must be a non-negative integer");
  }
}

function applyItem(state, item, appliedSet, codes) {
  const kind = item[0];
  const replica = item[1];
  const offset = item[2];
  const row = state.offsets.find(function (entry) { return entry[0] === replica; });
  if (row !== undefined && !(offset > row[1])) {
    throw codedError(codes.stale,
      "replica " + replica + " offset must advance beyond " + row[1]);
  }
  report(state.offsets, replica, offset);
  appliedSet.add(itemKey(item));
  state.applied.push([kind, replica, offset]);
}

export function step(spec) {
  spec = spec || {};
  const codes = codesOf(spec);
  const events = Array.isArray(spec.events) ? spec.events : [];

  events.forEach(function (event) { validateEvent(event, codes); });

  const state = cloneState(spec.state);
  const appliedSet = new Set(state.applied.map(itemKey));
  let remaining = Number.isFinite(spec.budget) ? Math.trunc(spec.budget) : 0;
  if (remaining < 0) remaining = 0;

  // 旧账先入队（FIFO），新事件接在后面，保证"账带出下一轮"按序补齐。
  const queue = state.ledger.map(cloneItem);
  state.ledger = [];
  events.forEach(function (event) {
    queue.push([event.kind, event.replica, event.offset]);
  });

  let served = 0;
  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i];
    if (appliedSet.has(itemKey(item))) continue; // 重放不再处理，不占预算，不压账
    if (remaining <= 0) {
      state.ledger = queue.slice(i).map(cloneItem);
      break;
    }
    applyItem(state, item, appliedSet, codes); // 按当前偏移表判 E_STALE_OFFSET
    remaining -= 1;
    served += 1;
  }

  refresh(state);
  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(cloneItem),
    judged: served,
    judged_bound: events.length
  };
}

export function close(spec) {
  spec = spec || {};
  const codes = codesOf(spec);
  const state = cloneState(spec.state);
  const appliedSet = new Set(state.applied.map(itemKey));
  const queue = state.ledger;
  state.ledger = [];

  let catchup = 0;
  for (const item of queue) {
    if (appliedSet.has(itemKey(item))) continue;
    applyItem(state, item, appliedSet, codes);
    catchup += 1;
  }

  refresh(state);
  return { state: state, catchup: catchup };
}
