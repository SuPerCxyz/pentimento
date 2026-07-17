# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Pentimento, please report it
responsibly. **Do not open a public issue.**

Email: **security@example.com**

Include:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- Affected versions / configuration.

We will acknowledge receipt within a reasonable timeframe and coordinate a fix
and disclosure.

## Security Design Principles

Pentimento runs Git in the background on the user's behalf. The following
invariants are part of the design and must be preserved in every change (see
`docs/TECHNICAL_DESIGN.md` for details):

- **No shell string interpolation.** Git is always invoked with an argument
  array. User-supplied revisions and paths are never concatenated into a shell
  command.
- **Revision verification.** Any user-provided revision is verified with
  `git rev-parse --verify <input>^{commit}` and resolved to a full hash before
  use, preventing argument injection through revisions.
- **Output limits.** Git command output is capped (`pentimento.git.maxOutputBytes`)
  to avoid memory exhaustion.
- **Worktree confinement.** Exact-patch worktrees are created only under the
  extension's managed global storage. Removal requires triple validation
  (managed path prefix, registered worktree, matching repository id and patch
  revision). Unvalidated paths are never deleted with `fs.rm`.
- **No user file mutation.** Pentimento never modifies source files, never
  checks out / switches / stashes the user's workspace, and never inserts
  markers or reformats code.
- **No secret logging.** The output channel never logs credentials, SSH keys,
  tokens, sensitive environment variables, or full remote authentication URLs.
  Full diffs are not logged by default.
- **Trusted hover commands.** Hover command URIs only invoke `pentimento.*`
  commands on a whitelist, with URL-encoded arguments and re-validation of the
  repository, revision, and file existence at execution time.

## Supported Versions

Security fixes target the latest released version.
