# bohselecta

[![A blue furry DJ playing vinyl in a warmly lit hip-hop club.](https://irvdotdev.github.io/bohselecta/dj-session.png)](https://irvdotdev.github.io/bohselecta/)

A local model adviser inside Claude Code and Codex. It checks the task, weighs capability against relative cost, and suggests a suitable model before you spend the expensive one on a small job.

**Public alpha · v0.3.0-alpha.7.** The Claude popup is the main experience. Automatic continuation is verified on Claude Code 2.1.282 and 2.1.283; other versions offer a manual continuation command. Model overrides apply to one task. Cross-provider handoff and live monetary pricing are not included.

[Website](https://irvdotdev.github.io/bohselecta/) · [Documentation](https://irvdotdev.github.io/bohselecta/docs.html) · [Releases](https://github.com/irvdotdev/bohselecta/releases)

## Install

### Homebrew (recommended)

```sh
brew install irvdotdev/tap/bohselecta
```

Homebrew installs Node and tmux and includes the prebuilt popup. Sign in to Claude Code separately. Run `bohselecta setup claude` to optionally make plain `claude` open the chooser. Update with `brew update && brew upgrade bohselecta`.

### npm / npx

The GitHub release includes a tested npm package with compiled JavaScript and all four popup binaries. Until npm registry publication is available, install directly from the release:

```sh
npm install -g https://github.com/irvdotdev/bohselecta/releases/download/v0.3.0-alpha.7/bohselecta-0.3.0-alpha.7.tgz
```

Or try it without a global installation:

```sh
npx --yes --package=https://github.com/irvdotdev/bohselecta/releases/download/v0.3.0-alpha.7/bohselecta-0.3.0-alpha.7.tgz bohselecta popup claude
```

Requires Node.js 22.18+ (22.x) or 24+, npm, tmux, and signed-in Claude Code. No Rust or install scripts. The short commands `npm install -g bohselecta@alpha` and `npx bohselecta@alpha` are not available until registry publication is complete.

### Direct installer

```sh
curl -fL https://github.com/irvdotdev/bohselecta/releases/download/v0.3.0-alpha.7/install.mjs -o /tmp/bohselecta-install.mjs
node /tmp/bohselecta-install.mjs
```

Requires the same Node/npm setup as npm installation. The installer verifies SHA-256 checksums, installs to `~/.local/share/bohselecta-app`, and creates `~/.local/bin/bohselecta`. It prints a PATH hint when needed. Interactive installs offer the optional default setup; shell profiles change only after you opt in. Client settings are not changed. Use `--prefix /another/path` for another location.

Prebuilt binaries support macOS 15+ and compatible glibc Linux (Ubuntu 22.04+) on arm64/x64. Windows and Alpine/musl are not supported. No Rust, Git, sudo, or separate API key is required for these installation methods. Use one installation method at a time to avoid multiple commands on PATH.

## Make it the default

```sh
bohselecta native refresh claude
bohselecta setup claude
```

Answer **yes**, open a new terminal, then type `claude` from your project folder. Setup adds a backed-up, removable shortcut to your zsh or bash profile. It respects zsh's `ZDOTDIR` and configures bash interactive and login shells. Commands with arguments (including `claude --resume`, `--model`, and `-p`) and non-interactive calls use ordinary Claude without the popup. `command claude` bypasses the shortcut.

Check with `bohselecta default claude status`. Undo with `bohselecta default claude off`, then open a new terminal (or run `unset -f claude` in the current shell). Existing shortcuts, edited bohselecta blocks, and linked shell profiles are left untouched with an explanation. Homebrew and npm never edit your shell profile during installation; the direct installer offers setup only in an interactive terminal.

## Run inside Claude

From the folder you want to work in:

```sh
bohselecta native refresh claude
bohselecta popup claude
```

[![The real bohselecta terminal popup, with Sonnet and Opus choices in amber and cream on dark green.](https://irvdotdev.github.io/bohselecta/popup-poster.png)](https://irvdotdev.github.io/bohselecta/#how-it-works)

[Watch the 27-second install-and-use walkthrough ↗](https://irvdotdev.github.io/bohselecta/#how-it-works)

It starts on Sonnet. Suitable work proceeds quietly. A worthwhile change opens the chooser: arrows choose, Enter continues, Escape keeps the current model, and q cancels. Type `boh: status` inside Claude for status. To try a downgrade, launch `bohselecta popup claude --model opus`, then enter `todo app`.

No tmux? `bohselecta preview claude` offers continuation commands in the normal terminal instead. See the [popup guide](docs/CLAUDE-POPUP.md) and [command-only guide](docs/CLAUDE-PREVIEW.md).

For the older hook integration, run `bohselecta install claude` or `bohselecta install codex`, restart the client, and use it normally. Codex requires its hook review in `/hooks`. These hooks suggest manual changes with `/model` and require resubmitting your task. [Native hook guide](docs/NATIVE.md).

## Install from source

Requires Git, Node/npm, and Rust/Cargo for the popup build. tmux and signed-in Claude Code are needed to run it.

```sh
git clone https://github.com/irvdotdev/bohselecta.git
cd bohselecta
git checkout v0.3.0-alpha.7
npm ci
npm link
bohselecta native refresh claude
bohselecta popup claude
```

The first popup launch builds the locked Rust dependencies. If your npm global prefix needs administrator access, use `./bin/bohselecta` instead of `npm link`; do not run npm with sudo.

## Update or remove

For Homebrew, run `brew update && brew upgrade bohselecta`, or `brew uninstall bohselecta` to remove it. For npm, install the desired release tarball again, or run `npm uninstall -g bohselecta`. Task history is retained.

For installer installations, download the installer from the desired release and run it again, then restart your popup session. Previous release directories are retained; see [installation, updates, and removal](docs/INSTALL.md). Source installations should check out the desired tag, run `npm ci`, and restart.

The installer does not enable persistent hooks. If you installed those separately, run `bohselecta uninstall` before removing the program. Removing program files does not remove local task history.

## Data and limits

Routing for the popup and native hooks runs locally without a paid classifier call. Relative cost tiers are not live prices or measured savings. Task text, choices, and feedback are stored locally at `~/.local/share/bohselecta`, private to your OS user but not encrypted. Default retention is 90 days. Claude and Codex keep their own authentication, billing, and transcripts.

The popup still shows Claude’s hook-stop notice. Production completion hooks do not independently verify the execution model. This is model advice, not a guaranteed budget cap. See [privacy and native behavior](docs/NATIVE.md), [the original standalone interface](docs/STANDALONE.md), and [changelog](CHANGELOG.md).

## Develop

```sh
npm ci
npm run check
npm test
cargo test --locked --manifest-path prototypes/popup/Cargo.toml
npm run site
```

The site runs at http://127.0.0.1:4173. `npm run site:build` creates a static `dist/` directory, which GitHub Pages deploys separately from the service. Release tags trigger tests, four native popup builds, clean-install checks, checksums, and a GitHub prerelease. See [release instructions](docs/RELEASING.md).

Software is licensed under [MIT](LICENSE). The supplied [DJ artwork](website/ARTWORK.md) is excluded from that license.
