import { attachSheetWebTouch } from '../src/components/overlays/sheetWebTouch';

function emit(panel: EventTarget, type: string, ...points: [number, number][]) {
  const event = Object.assign(new Event(type, { cancelable: true }), {
    touches: points.map(([clientX, clientY]) => ({ clientX, clientY })),
  });
  panel.dispatchEvent(event);
  return event.defaultPrevented;
}

test('reserves a downward drag before the browser can cancel the panel pointer stream', () => {
  const panel = new EventTarget();
  const detach = attachSheetWebTouch(panel, () => false);
  emit(panel, 'touchstart', [20, 20]);
  expect(emit(panel, 'touchmove', [20, 20])).toBe(false);
  expect(emit(panel, 'touchmove', [20, 21])).toBe(true);
  expect(emit(panel, 'touchmove', [20, 70])).toBe(true);
  // The reader can reverse the same drag before releasing.
  expect(emit(panel, 'touchmove', [20, 10])).toBe(true);

  detach();
  emit(panel, 'touchstart', [20, 20]);
  expect(emit(panel, 'touchmove', [20, 60])).toBe(false);
});

test('preserves browser scrolling for an entire list gesture, horizontal swipes and multi-touch', () => {
  const panel = new EventTarget();
  let scrolled = true;
  const detach = attachSheetWebTouch(panel, () => scrolled);
  emit(panel, 'touchstart', [20, 20]);
  scrolled = false;
  expect(emit(panel, 'touchmove', [20, 60])).toBe(false);

  emit(panel, 'touchstart', [20, 20]);
  expect(emit(panel, 'touchmove', [20, 10])).toBe(false);
  expect(emit(panel, 'touchmove', [20, 60])).toBe(false);

  emit(panel, 'touchstart', [20, 20]);
  expect(emit(panel, 'touchmove', [55, 25])).toBe(false);

  emit(panel, 'touchstart', [20, 20], [40, 20]);
  expect(emit(panel, 'touchmove', [20, 60], [40, 60])).toBe(false);
  detach();
});
