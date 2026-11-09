import Sortable from 'sortablejs';
import { dropSlot } from './drop-slot.js';

// A brief hold distinguishes picking up a painting from scrolling on a phone.
// The fallback implementation also lets mouse and touch use the same movement.
export function enableArtDragging(grid, { onDrop, onDragging }) {
  let disposed = false;
  const renumber = () => {
    [...grid.children].forEach((card, index) => {
      card.querySelector('.position').textContent = index + 1;
      card.querySelector('.art-image').setAttribute('aria-label', `הגדלה וניחוש ליצירה ${index + 1}`);
      card.querySelector('img').alt = `יצירה ${index + 1} על הציר`;
    });
  };
  const sortable = new Sortable(grid, {
    draggable: '.art-card',
    dataIdAttr: 'data-art',
    // Use row order for the wrapping RTL grid, including moves within a row.
    direction: 'vertical',
    animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160,
    delay: 200,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    // Touch events can cancel scrolling after a hold without disabling swipes.
    supportPointer: false,
    fallbackTolerance: 4,
    forceFallback: true,
    fallbackOnBody: true,
    ghostClass: 'art-drop-slot',
    chosenClass: 'art-picked-up',
    fallbackClass: 'art-drag-preview',
    scroll: true,
    forceAutoScrollFallback: true,
    scrollSensitivity: 80,
    scrollSpeed: 12,
    bubbleScroll: true,
    onStart() {
      document.body.classList.add('dragging-art');
      onDragging(true);
    },
    onChange: renumber,
    onEnd(event) {
      document.body.classList.remove('dragging-art');
      if (disposed) return;
      onDragging(false);
      // A fast release can arrive between Sortable's drag-over updates. Resolve
      // the release slot so animation cannot make the last position get skipped.
      const point = event.originalEvent?.changedTouches?.[0] || event.originalEvent;
      if (point && !String(event.originalEvent.type).includes('cancel')) {
        const style = getComputedStyle(grid), cards = [...grid.children];
        const index = dropSlot({ rect: grid.getBoundingClientRect(),
          columns: style.gridTemplateColumns.split(' ').map(parseFloat),
          rows: style.gridTemplateRows.split(' ').map(parseFloat),
          columnGap: parseFloat(style.columnGap) || 0, rowGap: parseFloat(style.rowGap) || 0,
          rtl: style.direction === 'rtl', count: cards.length }, point);
        if (index !== null && index !== cards.indexOf(event.item)) {
          const remaining = cards.filter(card => card !== event.item);
          grid.insertBefore(event.item, remaining[index] || null);
        }
      }
      renumber();
      if (event.oldDraggableIndex !== [...grid.children].indexOf(event.item)) {
        onDrop(sortable.toArray(), event.item.dataset.art);
      }
    },
  });
  return () => {
    disposed = true;
    sortable.destroy();
    document.body.classList.remove('dragging-art');
    onDragging(false);
  };
}
