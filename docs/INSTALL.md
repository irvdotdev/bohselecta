# Installing bohselecta

Follow the current [README](../README.md#install) for the pinned public-alpha installer and the source-checkout alternative.

## Before installing

- Node.js 22.18+ on 22.x, or 24+, with npm. Node 23 is not supported.
- Signed-in Claude Code for Claude features, or signed-in Codex for Codex hooks.
- tmux for the popup. It is tested with tmux 3.7c; the command-only preview does not use tmux.
- macOS 15+ (Apple Silicon or Intel), or Ubuntu 22.04+ / compatible glibc Linux (x64 or arm64) for prebuilt popup binaries.

The installer downloads versioned release assets over HTTPS and checks the source archive and platform binary against the release's SHA256SUMS. It runs `npm ci --omit=dev --ignore-scripts`, checks the CLI version, and renders a popup self-test without a model call before activating the installation. Rust is only needed for source builds.

## Where it installs

Default prefix: `~/.local`. Override with `node /tmp/bohselecta-install.mjs --prefix /path`.

- Command: `PREFIX/bin/bohselecta`
- Active release link: `PREFIX/share/bohselecta-app/current`
- Versioned software: `PREFIX/share/bohselecta-app/releases/`
- Task history and configuration: `~/.local/share/bohselecta` (separate; the installer does not modify it)

The installer never edits shell profiles, client settings, or unrelated commands. It prints a PATH instruction when needed. For the default prefix, add this to `~/.zshrc` or your shell's profile and open a new terminal:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

`command -v bohselecta` shows which installation your shell will use. If an older npm-linked installation wins, put `~/.local/bin` first in PATH or run `~/.local/bin/bohselecta` directly.

## Updates

Exit active popup sessions. Download and run the desired release's installer with the same prefix. A download, checksum, dependency-install, or self-test failure does not switch the active release. Successful updates retain prior release directories. Reinstalling a version is supported and uses a fresh directory.

Restart the popup to load the new version and version-specific continuation mode. Refresh Claude's catalog if it is older than seven days. Persistent native hooks installed from an older release should be refreshed by rerunning `bohselecta install claude` or `bohselecta install codex` after updating.

## Removal

If you enabled persistent native hooks, first run `bohselecta uninstall`. Exit running bohselecta sessions. For an installation using the default prefix, remove only these program paths:

```sh
rm "$HOME/.local/bin/bohselecta"
rm -r "$HOME/.local/share/bohselecta-app"
```

Adapt these paths if you used `--prefix`. Task history remains in its separate data directory. Use `bohselecta history clear --yes` before uninstalling if you also want to clear recorded tasks. These commands do not remove provider transcripts.
