# KnotDo for VS Code

Link a [KnotDo](https://knotdo.app) list to a workspace and work its tasks without leaving the editor.

- **Linked list per workspace:** the link is saved in `.vscode/settings.json` (`knotdo.list`), so every project opens with its own tasks. Commit it and teammates get the same link.
- **Tasks view:** a KnotDo icon in the activity bar. Tick a checkbox to complete a task, untick to reopen. Subtasks nest under their parent. Due dates (`today`, `3d overdue`), priority and in-progress state show inline, and notes show on hover. The badge counts open tasks.
- **Edit in place:** right-click a task to rename it, edit notes, set a due date (`2026-11-01`, `today`, `tomorrow`, `+3`), set priority, or delete it.
- **Capture from code:** select a line (or a `// TODO:` comment), right-click → **KnotDo: Add Task from Selection**. The task gets `path/to/file.js:42` in its notes, and clicking it in the view jumps back to that line.
- **Shared lists:** if several projects share one list and you title tasks `Project — thing`, set `knotdo.titlePrefix` to `Project — `. The view then shows only that project's tasks with the prefix hidden, and new tasks get it added.
- Refreshes when the window regains focus and every 5 minutes.

## Install

1. Download `knotdo-*.vsix` from [Releases](https://github.com/VAROIndustries/VSCodeKnotDoPlugin/releases).
2. `code --install-extension knotdo-0.1.0.vsix` (or Extensions view → `...` → *Install from VSIX...*).
3. Open the KnotDo view, click **Set API Key**, and paste a key from KnotDo → Workspace Settings → API Keys.
4. Click **Link a List**, pick a list (or create one), and optionally set a title prefix.

## Settings

| Setting | Scope | What it does |
|---|---|---|
| `knotdo.list` | workspace | Linked list id (or name). |
| `knotdo.titlePrefix` | workspace | Show only tasks starting with this, and add it to new ones. |
| `knotdo.showCompleted` | user | Show completed tasks too (eye icon in the view). |
| `knotdo.apiUrl` | user | KnotDo base URL, default `https://knotdo.app`. |

The API key is kept in VS Code's secret storage, never in settings files. It's only sent to the KnotDo API.

## Develop

Plain JavaScript, no dependencies, no build step. `node test.js` runs the self-check. `npx @vscode/vsce package` builds the `.vsix`.

## License

MIT
