# Contributing to bohselecta

The main experience is the Claude Code popup and optional default shell shortcut. Keep recommendations local and preserve the user's task, settings, permissions, and other shell customizations.

## Development

Use Node.js 22.18+ (22.x) or 24+, npm, and Rust/Cargo for popup changes. tmux and signed-in Claude Code are only needed for live integration checks.

```sh
npm ci
npm run check
npm test
cargo test --locked --manifest-path prototypes/popup/Cargo.toml
```

For website changes, run `npm run site` and check narrow and wide layouts. `npm run site:build` creates the GitHub Pages output. Keep the landing page short and the displayed popup faithful to the actual terminal UI.

Test shell-profile changes in a disposable home directory. Cover opt-in, decline, repeated setup, argument forwarding, backups, existing shortcuts, and undo. Do not use real tasks or personal transcripts for automated tests.

## Reporting a problem

[Open an issue](https://github.com/irvdotdev/bohselecta/issues/new). Include:

- OS/architecture and the output of `bohselecta --version`, `claude --version`, and `tmux -V` when relevant.
- The launch command, expected result, and what happened.
- For default launch: `bohselecta default claude status` and whether a new terminal was opened.
- For missing popups: `boh: status` inside Claude and a small non-sensitive reproduction prompt.

Remove private task text, credentials, and personal paths before sharing logs. Never treat a skill-loaded notice or session header as proof of which model served a turn.

## Releases

See the [release process](docs/RELEASING.md). Published tags and assets are immutable; fixes get a new version. Keep npm registry status, compatibility claims, and video provenance accurate. Software is MIT licensed; [supplied artwork](website/ARTWORK.md) has separate restrictions.
