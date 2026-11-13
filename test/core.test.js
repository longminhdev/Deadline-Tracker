import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyItem, dueDateToIso, parseICS } from '../src/core.js';

test('parseICS handles folded lines, escaped text, UTC dates and trusted event links', () => {
  const calendar = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:assignment-42@example',
    'SUMMARY:Đồ án\\, phần 1',
    'CATEGORIES:Lập trình hướng',
    ' đối tượng',
    'DTEND:20261114T165900Z',
    'URL:https://elearning.citd.edu.vn/mod/assign/view.php?id=42',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  assert.deepEqual(parseICS(calendar), [{
    id: 'citd_assignment-42@example',
    source: 'CITD',
    group: 'Lập trình hướngđối tượng',
    title: 'Đồ án, phần 1',
    due_at: '2026-11-14T16:59:00.000Z',
    submitted_at: null,
    url: 'https://elearning.citd.edu.vn/mod/assign/view.php?id=42',
  }]);
});

test('date-only event end uses the previous local calendar day end', () => {
  const calendar = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:date-only@example',
    'SUMMARY:Assignment',
    'DTEND;VALUE=DATE:20261115',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');

  assert.equal(parseICS(calendar)[0].due_at, '2026-11-14T16:59:59.000Z');
});

test('parseICS adds the mapped course name and instructor for a known class code', () => {
  const calendar = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:course-42@example',
    'SUMMARY:Assignment',
    'CATEGORIES:IT003.G12.LT.CNTT',
    'DTEND:20261114T165900Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');

  const [item] = parseICS(calendar);
  assert.equal(item.group, 'IT003.G12.LT.CNTT');
  assert.equal(item.course_name, 'Cấu trúc dữ liệu và giải thuật');
  assert.equal(item.instructor, 'Phạm Thế Sơn');
});

test('classifies on-time and late submissions and validates Jira due dates', () => {
  const item = { due_at: '2026-11-14T16:59:59.000Z', submitted_at: '2026-11-14T16:59:59.000Z' };
  assert.equal(classifyItem(item), 'SUBMITTED_ON_TIME');
  assert.equal(classifyItem({ ...item, submitted_at: '2026-11-14T17:00:00.000Z' }), 'SUBMITTED_LATE');
  assert.equal(classifyItem({ ...item, submitted_at: null }), 'UNSUBMITTED');
  assert.equal(dueDateToIso('2026-11-14'), '2026-11-14T16:59:59.000Z');
  assert.throws(() => dueDateToIso('tomorrow'), /không hợp lệ/);
});
