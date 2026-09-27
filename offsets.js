// offsets.js：偏移表与水位
function isValidOffset(offset) {
  return typeof offset === "number" && Number.isInteger(offset) && offset >= 0;
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function report(offsets, replica, offset) {
  if (!isValidOffset(offset)) {
    fail("E_BAD_OFFSET", "offset must be a non-negative integer");
  }
  const next = offsets.map(function (row) { return [row[0], row[1]]; });
  for (const row of next) {
    if (row[0] === replica) {
      if (offset <= row[1]) {
        fail("E_STALE_OFFSET", "offset must advance past " + row[1]);
      }
      row[1] = offset;
      return next;
    }
  }
  next.push([replica, offset]);
  return next;
}

export function waterOf(offsets) {
  if (!offsets.length) return 0;
  let water = Infinity;
  for (const row of offsets) {
    if (row[1] < water) water = row[1];
  }
  return water;
}

export function laggingOf(offsets) {
  if (!offsets.length) return [];
  let top = -Infinity;
  for (const row of offsets) {
    if (row[1] > top) top = row[1];
  }
  return offsets
    .filter(function (row) { return row[1] < top; })
    .map(function (row) { return row[0]; })
    .sort();
}
