import { formatCompactTime } from '../src/utils/date';

const now = new Date(2026, 9, 21, 12, 0, 0).getTime();
const seconds = (date: Date) => date.getTime() / 1000;

test('uses relative time within a day', () => {
  expect(formatCompactTime(seconds(new Date(2026, 9, 21, 9, 0)), now)).toBe(
    '3小时前',
  );
});

test('shows month and day earlier this year', () => {
  expect(formatCompactTime(seconds(new Date(2026, 9, 18, 23, 6)), now)).toBe(
    '10-18',
  );
});

test('shows the full date for earlier years', () => {
  expect(formatCompactTime(seconds(new Date(2025, 11, 30, 8, 0)), now)).toBe(
    '2025-12-30',
  );
});
