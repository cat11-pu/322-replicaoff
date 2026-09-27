// offsets.js：副本偏移表的登记/推进、水位与落后副本
export function report(offsets, replica, offset) {
  const row = offsets.find((entry) => entry[0] === replica);
  if (row === undefined) {
    offsets.push([replica, offset]);
  } else {
    if (!(offset > row[1])) {
      const error = new Error("replica " + replica + " offset must advance beyond " + row[1]);
      error.code = "E_STALE_OFFSET";
      throw error;
    }
    row[1] = offset;
  }
  return offsets;
}

export function waterOf(offsets) {
  if (!Array.isArray(offsets) || offsets.length === 0) return 0;
  return offsets.reduce(function (min, row) { return Math.min(min, row[1]); }, Infinity);
}

export function laggingOf(offsets) {
  if (!Array.isArray(offsets) || offsets.length === 0) return [];
  let max = -Infinity;
  offsets.forEach(function (row) { if (row[1] > max) max = row[1]; });
  return offsets
    .filter(function (row) { return row[1] < max; })
    .map(function (row) { return row[0]; })
    .sort();
}
