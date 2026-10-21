process.env.TZ = 'America/New_York'; // pin the zone: the evening test below depends on it
const assert = require('assert');
const T = require('./tasks');
const now = Date.parse('2026-10-17T15:00:00Z');

// list link: id beats name, name match is case-insensitive
const lists = [{ id: 'a', name: 'Apps' }, { id: 'b', name: 'apps-old' }];
assert.strictEqual(T.findList(lists, 'b').name, 'apps-old');
assert.strictEqual(T.findList(lists, ' apps ').id, 'a');
assert.strictEqual(T.findList(lists, 'nope'), undefined);
assert.strictEqual(T.findList(lists, ''), undefined);

// due input
assert.strictEqual(T.parseDue('', now), null);
assert.strictEqual(T.parseDue('today', now), '2026-10-17');
assert.strictEqual(T.parseDue('Tomorrow', now), '2026-10-18');
assert.strictEqual(T.parseDue('+14', now), '2026-10-31');
assert.strictEqual(T.parseDue('2026-12-01', now), '2026-12-01');
assert.strictEqual(T.parseDue('next week', now), undefined);
assert.strictEqual(T.parseDue('2026-13-45', now), undefined);

// due labels use KnotDo's noon-UTC date-only storage
assert.strictEqual(T.dueLabel('2026-10-17T12:00:00.000Z', now), 'today');
assert.strictEqual(T.dueLabel('2026-10-18T12:00:00.000Z', now), 'tomorrow');
assert.strictEqual(T.dueLabel('2026-10-14T12:00:00.000Z', now), '3d overdue');
assert.strictEqual(T.dueLabel('2026-10-20T12:00:00.000Z', now), 'in 3d');
assert.strictEqual(T.dueLabel('2026-11-30T12:00:00.000Z', now), '2026-11-30');
assert.strictEqual(T.dueLabel(null, now), '');
assert.ok(T.isOverdue({ status: 'todo', dueDate: '2026-10-16T12:00:00.000Z' }, now));
assert.ok(!T.isOverdue({ status: 'done', dueDate: '2026-10-16T12:00:00.000Z' }, now));

// tree: archived dropped, done hidden unless asked, pinned first, subtasks nested, orphans promoted
const rows = [
  { id: '1', title: 'one', status: 'todo', position: 2000 },
  { id: '2', title: 'two', status: 'todo', position: 1000 },
  { id: '3', title: 'pinned', status: 'todo', position: 3000, isPinned: true },
  { id: '4', title: 'done', status: 'done', position: 0 },
  { id: '5', title: 'gone', status: 'archived', position: 0 },
  { id: '6', title: 'sub', status: 'in_progress', parentId: '1', position: 0 },
  { id: '7', title: 'orphan', status: 'todo', parentId: '4', position: 4000 },
];
let t = T.tree(rows, false);
assert.deepStrictEqual(t.map((n) => n.id), ['3', '2', '1', '7']);
assert.deepStrictEqual(t[2].children.map((n) => n.id), ['6']);
t = T.tree(rows, true);
assert.deepStrictEqual(t.map((n) => n.id), ['3', '2', '1', '4']);
assert.deepStrictEqual(t[3].children.map((n) => n.id), ['7']);
assert.strictEqual(T.openCount(rows), 5);

assert.strictEqual(T.describe({ priority: 'urgent', status: 'in_progress', dueDate: '2026-10-17T12:00:00.000Z' }, now), 'urgent in progress today');
assert.strictEqual(T.describe({ priority: 'none', status: 'todo' }, now), '');

// selection -> task
assert.deepStrictEqual(T.fromSelection('  // TODO: fix the race\n', 'src/a.js', 12), { title: 'fix the race', notes: 'src/a.js:12\n\n// TODO: fix the race' });
assert.deepStrictEqual(T.fromSelection('# FIXME handle empty', 'x.py', 3), { title: 'handle empty', notes: 'x.py:3' });
assert.strictEqual(T.fromSelection('\n\n  plain words\nmore', 'b.md', 1).title, 'plain words');

// title prefix narrows a shared list
const P = 'KnotDo — ';
assert.ok(T.hasPrefix({ title: 'knotdo — ship it' }, P));
assert.ok(!T.hasPrefix({ title: 'NoteSmith — x' }, P));
assert.ok(T.hasPrefix({ title: 'anything' }, ''));
assert.strictEqual(T.stripPrefix('KnotDo — ship it', P), 'ship it');
assert.strictEqual(T.addPrefix('ship it', P), 'KnotDo — ship it');
assert.strictEqual(T.addPrefix('KnotDo — ship it', P), 'KnotDo — ship it');
assert.strictEqual(T.addPrefix('ship it', ''), 'ship it');

// evening in New York: UTC is already tomorrow, but "today" is the local day
{
  const eve = Date.parse('2026-10-18T01:00:00Z');
  assert.strictEqual(T.parseDue('today', eve), '2026-10-17');
  assert.strictEqual(T.parseDue('tomorrow', eve), '2026-10-18');
  assert.strictEqual(T.parseDue('+14', eve), '2026-10-31');
  assert.strictEqual(T.dueLabel('2026-10-17T12:00:00.000Z', eve), 'today');
  assert.ok(!T.isOverdue({ status: 'todo', dueDate: '2026-10-17T12:00:00.000Z' }, eve));
}

console.log('ok');
