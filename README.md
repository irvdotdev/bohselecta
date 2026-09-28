# bohselecta

A local model adviser inside Claude Code and Codex. It checks the task, weighs capability against relative cost, and suggests a suitable model before you spend the expensive one on a small job.

**Public alpha · v0.3.0-alpha.2.** The Claude popup is the main experience. Automatic continuation is verified on Claude Code 2.1.282 and 2.1.283; other versions offer a manual continuation command. Model overrides apply to one task. Cross-provider handoff and live monetary pricing are not included.

[Website](https://irvdotdev.github.io/bohselecta/) · [Documentation](https://irvdotdev.github.io/bohselecta/docs.html) · [Releases](https://github.com/irvdotdev/bohselecta/releases)

## Install

Requires Node.js 22.18+ on the 22.x line, or Node.js 24+, including npm. For the popup, install tmux and sign in to Claude Code first. The installer includes the popup binary: no Rust, Git, sudo, or separate API key is needed.

```sh
curl -fL https://github.com/irvdotdev/bohselecta/releases/download/v0.3.0-alpha.2/install.mjs -o /tmp/bohselecta-install.mjs
node /tmp/bohselecta-install.mjs
```

The installer verifies SHA-256 checksums, installs to `~/.local/share/bohselecta-app`, and creates `~/.local/bin/bohselecta`. If that directory is not on PATH, it prints the line to add to your shell profile. It does not change your shell profile or client settings itself. Existing unrelated commands are never overwritten. Use `node /tmp/bohselecta-install.mjs --prefix /another/path` for another location.

Prebuilt binaries: macOS Apple Silicon and Intel (macOS 15+), Linux x64 and arm64 (Ubuntu 22.04+ or compatible glibc system). Windows and Alpine/musl are not supported by this installer. A failed download or checksum check leaves the active installation intact.

## Run inside Claude

From the folder you want to work in:

```sh
bohselecta native refresh claude
bohselecta popup claude
```

It starts on Sonnet. Suitable work proceeds quietly. A worthwhile change opens the chooser: arrows choose, Enter continues, Escape keeps the current model, and q cancels. Type `boh: status` inside Claude for status. To try a downgrade, launch `bohselecta popup claude --model opus`, then enter `todo app`.

No tmux? `bohselecta preview claude` offers continuation commands in the normal terminal instead. See the [popup guide](docs/CLAUDE-POPUP.md) and [command-only guide](docs/CLAUDE-PREVIEW.md).

For the older hook integration, run `bohselecta install claude` or `bohselecta install codex`, restart the client, and use it normally. Codex requires its hook review in `/hooks`. These hooks suggest manual changes with `/model` and require resubmitting your task. [Native hook guide](docs/NATIVE.md).

## Install from source

Requires Git, Node/npm, and Rust/Cargo for the popup build. tmux and signed-in Claude Code are needed to run it.

```sh
git clone https://github.com/irvdotdev/bohselecta.git
cd bohselecta
git checkout v0.3.0-alpha.2
npm ci
npm link
bohselecta native refresh claude
bohselecta popup claude
```

The first popup launch builds the locked Rust dependencies. If your npm global prefix needs administrator access, use `./bin/bohselecta` instead of `npm link`; do not run npm with sudo.

## Update or remove

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
