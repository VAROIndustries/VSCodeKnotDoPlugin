// Pure helpers (no vscode import) so test.js can run them under plain node.
const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'];
const PRIORITY_ICON = { urgent: '$(flame)', high: '$(arrow-up)', medium: '', low: '$(arrow-down)', none: '' };
const DAY = 864e5;

// A linked list is stored as a name or an id; id wins so renames in KnotDo don't break the link.
function findList(lists, ref) {
  if (!ref) return undefined;
  return lists.find((l) => l.id === ref) || lists.find((l) => l.name.toLowerCase() === ref.trim().toLowerCase());
}

// dueDate is stored at noon UTC, so its UTC date is the intended day; "now" must use the local day.
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const localYmd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays = (day, n) => ymd(Date.parse(`${day}T12:00:00Z`) + n * DAY);

// "", "today", "tomorrow", "+3", "2026-10-20" -> YYYY-MM-DD | null (clear) | undefined (invalid).
function parseDue(input, now = Date.now()) {
  const s = (input || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'today') return localYmd(now);
  if (s === 'tomorrow') return addDays(localYmd(now), 1);
  if (/^\+\d+$/.test(s)) return addDays(localYmd(now), Number(s.slice(1)));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))) return s;
  return undefined;
}

// KnotDo stores date-only due dates at noon UTC, so the UTC date part is the intended day.
function dueLabel(dueDate, now = Date.now()) {
  if (!dueDate) return '';
  const days = Math.round((Date.parse(ymd(dueDate)) - Date.parse(localYmd(now))) / DAY);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days < 0) return `${-days}d overdue`;
  if (days < 7) return `in ${days}d`;
  return ymd(dueDate);
}

const isOverdue = (t, now = Date.now()) => t.status !== 'done' && !!t.dueDate && ymd(t.dueDate) < localYmd(now);

// Flat API rows -> sorted top-level tasks with .children. Open before done, pinned first, then KnotDo order.
function tree(rows, showCompleted) {
  const keep = rows.filter((t) => t.status !== 'archived' && (showCompleted || t.status !== 'done'));
  const ids = new Set(keep.map((t) => t.id));
  const sort = (a, b) => (a.status === 'done') - (b.status === 'done') || (b.isPinned === true) - (a.isPinned === true) || (a.position ?? 0) - (b.position ?? 0);
  const nodes = keep.map((t) => ({ ...t, children: [] }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots = [];
  for (const n of nodes) (n.parentId && ids.has(n.parentId) ? byId.get(n.parentId).children : roots).push(n);
  for (const n of nodes) n.children.sort(sort);
  return roots.sort(sort);
}

function describe(t, now = Date.now()) {
  return [PRIORITY_ICON[t.priority] || '', t.status === 'in_progress' ? 'in progress' : '', dueLabel(t.dueDate, now)].filter(Boolean).join(' ');
}

// Optional per-workspace title prefix ("MyProject — ") narrows a shared list to this project.
const startsWith = (title, prefix) => title.toLowerCase().startsWith(prefix.toLowerCase());
const hasPrefix = (t, prefix) => !prefix || startsWith(t.title, prefix);
const stripPrefix = (title, prefix) => (prefix && startsWith(title, prefix) ? title.slice(prefix.length) : title);
const addPrefix = (title, prefix) => (prefix && !startsWith(title, prefix) ? prefix + title : title);

const openCount = (rows) => rows.filter((t) => t.status === 'todo' || t.status === 'in_progress').length;

// Task from an editor selection: title = first line of the selection, notes = where it came from.
function fromSelection(text, relPath, line) {
  const first = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
  const title = first.replace(/^(\/\/+|#+|\/?\*+|<!--|--)\s*/, '').replace(/^(TODO|FIXME|HACK|XXX)\b:?\s*/i, '').slice(0, 200);
  return { title, notes: `${relPath}:${line}${text.includes('\n') ? `\n\n${text.trim()}` : ''}` };
}

module.exports = { PRIORITIES, hasPrefix, stripPrefix, addPrefix, findList, parseDue, dueLabel, isOverdue, tree, describe, openCount, fromSelection };
