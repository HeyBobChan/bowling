// Resolve the grid slot, not an animated card passing underneath the pointer.
export function dropSlot({ rect, columns, rows, columnGap, rowGap, rtl, count }, point) {
  if (!point || point.clientX < rect.left || point.clientX > rect.right
    || point.clientY < rect.top || point.clientY > rect.bottom) return null;
  const track = (sizes, gap, offset) => {
    let edge = 0;
    for (let i = 0; i < sizes.length; i++) {
      edge += sizes[i];
      if (offset <= edge + gap / 2) return i;
      edge += gap;
    }
    return sizes.length - 1;
  };
  const x = rtl ? rect.right - point.clientX : point.clientX - rect.left;
  const column = track(rtl ? [...columns].reverse() : columns, columnGap, x);
  const row = track(rows, rowGap, point.clientY - rect.top);
  return Math.min(count - 1, row * columns.length + column);
}
