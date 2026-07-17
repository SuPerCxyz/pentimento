# Pentimento

> Illuminate the history woven into your code.

Pentimento is a VSCode extension that reveals the additions introduced by Git
commits and patches directly inside normal source files. It preserves the
living code context, supports code navigation, handles historical patches,
and allows multiple patch layers to be explored **without opening a
traditional diff editor**.

Instead of separating history into a side-by-side diff view, Pentimento
highlights the **new lines** introduced by a Git patch — added lines, replaced
lines, and new files — directly inside the real, editable file, so that Go to
Definition, Find References, Peek, language services, debugging, and other
extensions such as GitLens keep working.

## Why the name "Pentimento"?

In painting, a pentimento is a trace of an earlier composition that becomes
visible after the artist has changed or painted over it.

Source code evolves in a similar way. Every commit leaves a layer of intent,
correction, and refinement. Pentimento brings those layers back into view by
highlighting the additions introduced by Git patches directly inside the
living codebase.

Rather than separating history into a traditional diff view, Pentimento lets
you explore previous changes in their full source context, while preserving
navigation, language services, and the rest of the editor experience.

## Highlights

- **Line-level Git hover** — hover any line to see its commit, author, time,
  and summary, with actions to highlight that commit.
- **Highlight patch additions in place** — only the *new* side of a patch is
  highlighted: added lines, replaced lines, new files. Deleted content is
  never shown.
- **Real editor, not a diff editor** — works on the ordinary `TextEditor` with
  real files. No `vscode.diff`, no side-by-side, no webview code viewer, no
  read-only virtual diff document. Source files are never modified.
- **Historical patches** — view patches that are not the current HEAD via
  *surviving lines* in the current revision, or open an *exact patch
  workspace* (a managed temporary Git worktree) for pixel-perfect accuracy.
  Old patch line numbers are never applied blindly to the current HEAD.
- **Multiple patch layers** — keep several patches highlighted at once, each
  with its own color, a primary patch, and a dedicated overlap style for lines
  touched by more than one patch.
- **Working tree & staged changes** — highlight uncommitted and staged
  additions.
- **Pure VSCode UI** — everything is done through hover, command palette,
  tree view, status bar, quick pick, input box, progress, and the settings UI.
  **You never need to open a terminal, type a Git command, hand-edit
  `settings.json`, or visit a remote web page.** Git runs only in the
  extension background.
- **Plays well with others** — coexists with GitLens, git gutters,
  diagnostics, search results, test coverage, breakpoints, and the debug
  current-line marker. It only ever manages its own decorations.

## Why not a traditional diff viewer?

A diff viewer extracts history into a separate, often read-only surface. That
breaks navigation, language services, and the surrounding context — you can no
longer Ctrl+Click into a definition or look up references the way you can in
your real file.

Pentimento takes the opposite approach: the patch is overlaid onto the living
code as a decoration. The file stays editable and fully functional; the patch
is simply *visible*.

## Usage

1. Hover a line of code to see its commit, then choose
   **Add this commit to highlight**.
2. Or run **Pentimento: Add Commit or Range** from the command palette and
   enter a revision, range, or ref (`HEAD`, `HEAD~1`, `origin/main`,
   `abc123..def456`, `refs/changes/43/93143/8`, …).
3. Use the **PENTIMENTO** view in the activity bar to manage patches, jump
   between added hunks, and open exact patch workspaces.
4. Click the status bar item for quick actions.

All of the above happens inside VSCode. No terminal, no manual Git commands.

## Historical patch modes

- **Exact (current HEAD)** — when the patch revision equals HEAD and the file
  is clean, additions map 1:1 to the current file.
- **Surviving lines** — highlight only the lines in the current revision that
  still reliably belong to the target patch (via `git blame`). Old line
  numbers are never reused.
- **Exact patch workspace** — open a managed temporary worktree at the patch
  revision in a new VSCode window for pixel-perfect accuracy. Your current
  workspace is never checked out or modified.

Accuracy is prioritized over coverage: when a line cannot be reliably
attributed, it is marked ambiguous rather than highlighted.

## Multiple patches

Several patches can be highlighted at once (default up to 6). Each gets a
color slot; lines touched by more than one patch use a dedicated overlap
style and the hover lists every related patch. One patch is the *primary*,
used for hunk navigation and the status bar.

## Coexisting with GitLens

Pentimento is a well-behaved hover provider. It does not replace, override,
or depend on GitLens, and it does not modify GitLens configuration or read
its cache. By default it uses no line-end virtual text, no CodeLens, no
inlay hints, and no gutter icon, so it never competes with GitLens current
line blame for the trailing-line space.

## Configuration

All options are available in the VSCode **Settings** UI under `Pentimento`.
Key options:

| Option | Default | Description |
|---|---|---|
| `pentimento.hover.enabled` | `true` | Enable line Git hover |
| `pentimento.hover.delay` | `300` | Hover debounce (ms) |
| `pentimento.hover.mode` | `compact` | `compact` / `full` / `disabled` |
| `pentimento.highlight.style` | `background-and-border` | Decoration style |
| `pentimento.highlight.gutterIcon` | `false` | Gutter icon (off by default) |
| `pentimento.multiPatch.enabled` | `true` | Multiple patch layers |
| `pentimento.multiPatch.maxActivePatches` | `6` | Max simultaneous patches |
| `pentimento.git.timeout` | `30000` | Git command timeout (ms) |
| `pentimento.logging.level` | `info` | Log level |

## Performance

All Git operations are asynchronous and never block the extension host. Hover
uses debounce and a file-level blame cache. Only visible editors are
decorated. Large patches are capped (`pentimento.largePatch.*`) and the tree
view is lazy-loaded.

## Security

Git is always invoked with an argument array (never a shell string). User
revisions are verified with `git rev-parse` before use. Exact-patch worktrees
are created only under the extension managed storage and are removed only
after triple validation (managed path prefix, registered worktree, matching
metadata). Unvalidated paths are never deleted.

## What Pentimento does NOT do

- It does not import or parse external `.patch` / `.diff` files. Only
  commits, ranges, refs, working-tree, and staged changes from the current
  Git repository are supported.
- It does not show deleted lines, side-by-side diffs, or inline diff blocks.
- It does not require you to open a terminal or run Git commands manually.
- It does not log in to Gerrit/GitHub/GitLab or modify remote reviews.

## Development & debugging

> These are developer workflows, not normal user flows.

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run compile      # esbuild bundle
npm run watch        # watch mode
npm run lint
npm run test:unit    # unit tests (mocha)
npm run test         # integration tests via @vscode/test-electron
```

Press <kbd>F5</kbd> in VSCode to launch an Extension Development Host with
Pentimento loaded. See `docs/TECHNICAL_DESIGN.md` for the architecture and
`docs/IMPLEMENTATION_STATUS.md` for progress.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). By contributing you agree to abide
by the [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[MIT](./LICENSE) © Pentimento Contributors
