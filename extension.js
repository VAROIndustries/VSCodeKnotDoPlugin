const vscode = require('vscode');
const T = require('./tasks');

const REFRESH_MS = 5 * 60 * 1000;
const cfg = () => vscode.workspace.getConfiguration('knotdo');
const prefix = () => cfg().get('titlePrefix');
const base = () => cfg().get('apiUrl').replace(/\/+$/, '');

let ctx, view, list, rows = [];
const changed = new vscode.EventEmitter();

async function api(method, route, body) {
  const key = await ctx.secrets.get('knotdo.apiKey');
  if (!key) throw new Error('No API key set');
  const res = await fetch(`${base()}/api/v1${route}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

const setCtx = (k, v) => vscode.commands.executeCommand('setContext', `knotdo.${k}`, v);
const fail = (e) => vscode.window.showErrorMessage(`KnotDo: ${e.message}`);

// KnotDo's "API-accessible lists" setting hides unticked lists from GET /lists. Explain it once per list.
let warned;
function notVisible(what) {
  if (warned === what) return;
  warned = what;
  vscode.window.showWarningMessage(
    `KnotDo: ${what} isn't visible to your API key. In KnotDo → Workspace Settings → API Keys → "API-accessible lists", tick it (or untick every list to expose them all), then Refresh.`,
    'Open KnotDo Settings', 'Link a Different List',
  ).then((p) => (p === 'Open KnotDo Settings' ? vscode.env.openExternal(vscode.Uri.parse(`${base()}/settings`)) : p && linkList()));
}

async function refresh() {
  try {
    const hasKey = !!(await ctx.secrets.get('knotdo.apiKey'));
    await setCtx('hasKey', hasKey);
    const ref = cfg().get('list');
    list = hasKey && ref ? T.findList((await api('GET', '/lists')).lists, ref) : undefined;
    if (hasKey && ref && !list) notVisible(`the list "${cfg().get('listName') || ref}"`);
    await setCtx('linked', !!list);
    // Fetch per status: done tasks pile up and would crowd open ones out of the 500-row cap.
    // ponytail: done view shows an arbitrary 500 when a list has more; the API has no paging or sort.
    const statuses = ['todo', 'in_progress', ...(cfg().get('showCompleted') ? ['done'] : [])];
    rows = list ? (await Promise.all(statuses.map((s) => api('GET', `/tasks?listId=${encodeURIComponent(list.id)}&status=${s}&limit=500`)))).flatMap((r) => r.tasks) : [];
    const mine = new Set(rows.filter((t) => T.hasPrefix(t, prefix())).map((t) => t.id));
    rows = rows.filter((t) => mine.has(t.id) || mine.has(t.parentId)); // subtasks follow their parent
    view.description = [list?.name, prefix()].filter(Boolean).join(' · ');
    const n = T.openCount(rows), late = rows.filter((t) => T.isOverdue(t)).length;
    view.badge = n ? { value: n, tooltip: `${n} open${late ? `, ${late} overdue` : ''}` } : undefined;
  } catch (e) {
    view.description = `⚠ ${e.message}`;
  }
  changed.fire();
}

// Run a mutation then refresh; errors surface as a toast.
const mutate = (fn) => async (...a) => { try { await fn(...a); } catch (e) { fail(e); } await refresh(); };

const provider = {
  onDidChangeTreeData: changed.event,
  getChildren: (node) => (node ? node.children : T.tree(rows, cfg().get('showCompleted'))),
  getTreeItem(t) {
    const item = new vscode.TreeItem(T.stripPrefix(t.title, prefix()), t.children.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    item.id = t.id;
    item.contextValue = 'task';
    item.description = T.describe(t);
    item.checkboxState = t.status === 'done' ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
    const md = new vscode.MarkdownString(`**${t.title}**\n\n`);
    md.appendText([t.priority !== 'none' && `Priority: ${t.priority}`, t.dueDate && `Due: ${t.dueDate.slice(0, 10)} (${T.dueLabel(t.dueDate)})`].filter(Boolean).join('\n'));
    if (t.notes) md.appendText(`\n\n${t.notes}`);
    item.tooltip = md;
    const loc = codeLocation(t.notes);
    if (loc) item.command = { command: 'vscode.open', title: 'Open', arguments: [loc.uri, { selection: new vscode.Range(loc.line, 0, loc.line, 0) }] };
    return item;
  },
};

// Notes starting with "relative/path.ext:12" (what Add Task from Selection writes) make the task click-to-open.
function codeLocation(notes) {
  const m = /^([\w./-]+\.\w+):(\d+)\b/.exec(notes || '');
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  return m && root ? { uri: vscode.Uri.joinPath(root, m[1]), line: Number(m[2]) - 1 } : undefined;
}

async function setApiKey() {
  const key = await vscode.window.showInputBox({ prompt: 'KnotDo API key (KnotDo → Workspace Settings → API Keys)', password: true, ignoreFocusOut: true, validateInput: (v) => (v.startsWith('kd_') ? null : 'Keys start with kd_') });
  if (!key) return;
  await ctx.secrets.store('knotdo.apiKey', key.trim());
  await refresh();
  if (!list) linkList();
}

async function linkList() {
  if (!vscode.workspace.workspaceFolders) return vscode.window.showWarningMessage('KnotDo: open a folder first — the link is saved in its workspace settings.');
  try {
    const { lists } = await api('GET', '/lists');
    const NEW = '$(add) Create new list…';
    const pick = await vscode.window.showQuickPick([...lists.map((l) => ({ label: l.name, list: l })), { label: NEW }], { placeHolder: 'KnotDo list to link to this workspace (missing one? check API-accessible lists in KnotDo Workspace Settings)' });
    if (!pick) return;
    let chosen = pick.list;
    if (!chosen) {
      const name = await vscode.window.showInputBox({ prompt: 'New list name', value: vscode.workspace.name });
      if (!name) return;
      chosen = (await api('POST', '/lists', { name })).list;
      if (!(await api('GET', '/lists')).lists.some((l) => l.id === chosen.id)) notVisible(`the list "${chosen.name}"`);
    }
    await cfg().update('list', chosen.id, vscode.ConfigurationTarget.Workspace);
    // Informational only; throws when a hot-swapped update hasn't registered the setting yet.
    await cfg().update('listName', chosen.name, vscode.ConfigurationTarget.Workspace).then(undefined, () => {});
    const pre = await vscode.window.showInputBox({ prompt: 'Optional: only show tasks whose title starts with… (for lists shared by several projects). Esc or empty = whole list.', value: cfg().get('titlePrefix') || `${vscode.workspace.name} — ` });
    if (pre !== undefined) await cfg().update('titlePrefix', pre, vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage(`KnotDo: linked "${chosen.name}" to this workspace.`);
  } catch (e) { fail(e); }
}

const create = mutate(async (title, notes) => {
  if (title) await api('POST', '/tasks', { listId: list.id, title: T.addPrefix(title, prefix()), ...(notes && { notes }) });
});

async function add() {
  create(await vscode.window.showInputBox({ prompt: `New task in ${list.name}` }));
}

async function addFromSelection() {
  const ed = vscode.window.activeTextEditor;
  if (!ed) return;
  const sel = ed.selection.isEmpty ? ed.document.lineAt(ed.selection.active.line).range : ed.selection;
  const s = T.fromSelection(ed.document.getText(sel), vscode.workspace.asRelativePath(ed.document.uri, false).replace(/\\/g, '/'), sel.start.line + 1);
  create(await vscode.window.showInputBox({ prompt: `New task in ${list.name}`, value: s.title }), s.notes);
}

const patch = (t, fields) => api('PATCH', '/tasks', { id: t.id, ...fields });

const edit = mutate(async (t) => {
  const title = await vscode.window.showInputBox({ prompt: 'Task title', value: T.stripPrefix(t.title, prefix()) });
  if (title && T.addPrefix(title, prefix()) !== t.title) await patch(t, { title: T.addPrefix(title, prefix()) });
});

const editNotes = mutate(async (t) => {
  const notes = await vscode.window.showInputBox({ prompt: 'Notes (empty clears)', value: t.notes || '' });
  if (notes !== undefined) await patch(t, { notes });
});

const setDue = mutate(async (t) => {
  const v = await vscode.window.showInputBox({
    prompt: 'Due date: YYYY-MM-DD, today, tomorrow, +N days — empty clears',
    value: t.dueDate ? t.dueDate.slice(0, 10) : '',
    validateInput: (s) => (T.parseDue(s) === undefined ? 'Not a date' : null),
  });
  if (v !== undefined) await patch(t, { dueDate: T.parseDue(v) });
});

const setPriority = mutate(async (t) => {
  const p = await vscode.window.showQuickPick(T.PRIORITIES, { placeHolder: `Priority (now: ${t.priority})` });
  if (p) await patch(t, { priority: p });
});

const del = mutate(async (t) => {
  const ok = await vscode.window.showWarningMessage(`Delete "${t.title}"${t.children.length ? ' and its subtasks' : ''}?`, { modal: true }, 'Delete');
  if (ok) await api('DELETE', '/tasks', { id: t.id });
});

function activate(context) {
  ctx = context;
  view = vscode.window.createTreeView('knotdo.tasks', { treeDataProvider: provider });
  const timer = setInterval(refresh, REFRESH_MS);
  const cmd = (id, fn) => vscode.commands.registerCommand(`knotdo.${id}`, fn);
  ctx.subscriptions.push(
    view,
    { dispose: () => clearInterval(timer) },
    view.onDidChangeCheckboxState(mutate(async (e) => {
      for (const [t, s] of e.items) await patch(t, { status: s === vscode.TreeItemCheckboxState.Checked ? 'done' : 'todo' });
    })),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('knotdo') && refresh()),
    vscode.window.onDidChangeWindowState((s) => s.focused && refresh()),
    ctx.secrets.onDidChange(refresh),
    cmd('setApiKey', setApiKey),
    cmd('linkList', linkList),
    cmd('refresh', refresh),
    cmd('add', add),
    cmd('addFromSelection', addFromSelection),
    cmd('toggleCompleted', () => cfg().update('showCompleted', !cfg().get('showCompleted'), vscode.ConfigurationTarget.Global)),
    cmd('edit', edit),
    cmd('editNotes', editNotes),
    cmd('setDue', setDue),
    cmd('setPriority', setPriority),
    cmd('delete', del),
  );
  refresh();
}

module.exports = { activate, deactivate() {} };
