// offsets.js：偏移表与水位（基线：一律原样返回）
export function report(offsets, replica, offset) {
  return offsets;
}

export function waterOf(offsets) {
  return 0;
}

export function laggingOf(offsets) {
  return [];
}
