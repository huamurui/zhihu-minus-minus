// A non-passive listener can reserve a downward drag before the browser
// cancels RNGH's pointer stream. Leave other touches to the native scroller.
export function attachSheetWebTouch(
  panel: Pick<HTMLElement, 'addEventListener' | 'removeEventListener'>,
  scrollOwnsTouch: () => boolean,
) {
  let start: Touch | undefined;
  let dragging = false;

  const begin = (event: TouchEvent) => {
    start =
      event.touches.length === 1 && !scrollOwnsTouch()
        ? event.touches[0]
        : undefined;
    dragging = false;
  };
  const move = (event: TouchEvent) => {
    if (!start || event.touches.length !== 1) return;
    if (!dragging) {
      const touch = event.touches[0];
      const dx = Math.abs(touch.clientX - start.clientX);
      const dy = touch.clientY - start.clientY;
      if (dx === 0 && dy === 0) return;
      if (dy <= dx) {
        start = undefined;
        return;
      }
      dragging = true;
    }
    if (event.cancelable) event.preventDefault();
  };

  panel.addEventListener('touchstart', begin, { passive: true, capture: true });
  panel.addEventListener('touchmove', move, { passive: false, capture: true });
  return () => {
    panel.removeEventListener('touchstart', begin, { capture: true });
    panel.removeEventListener('touchmove', move, { capture: true });
  };
}
