Make plain `claude` open the bohselecta chooser with an optional, reversible setup step.

### Install and enable

```sh
brew install irvdotdev/tap/bohselecta
bohselecta native refresh claude
bohselecta setup claude
```

Answer yes, open a new terminal in your project folder, and type `claude`. Already installed through Homebrew? Run `brew update && brew upgrade bohselecta` first.

Setup supports zsh and bash, backs up shell profiles, and preserves existing shortcuts and edited blocks. Commands with arguments such as `claude --resume` keep using ordinary Claude without the popup. Use `command claude` to bypass the shortcut.

Check: `bohselecta default claude status`. Undo: `bohselecta default claude off`, then open a new terminal.

### Other installation methods

The assets include a direct installer, source archive, npm-compatible tarball, four native popup binaries, Homebrew formula, and SHA-256 checksums. [npm/npx and direct installer commands](https://github.com/irvdotdev/bohselecta#npm--npx) are documented in the README. npm registry publication remains pending; the release tarball works now.

Homebrew and npm require running setup explicitly. The direct installer offers setup when run interactively. Profile changes require opting in. No Rust is needed with release packages.

### Compatibility and validation

macOS 15+ and compatible glibc Linux on arm64/x64. Requires signed-in Claude Code; Homebrew installs Node and tmux. Automatic continuation is validated on Claude Code 2.1.282–283; other versions show a manual command. Model overrides apply to one task. Pricing uses relative tiers, not live dollar estimates.

Validated with 79 automated tests, real zsh/bash opt-in and undo checks, four-platform release installation checks, and Homebrew tests on macOS and Linux.

[Documentation](https://github.com/irvdotdev/bohselecta/blob/main/docs/README.md) · [Changelog](https://github.com/irvdotdev/bohselecta/blob/main/CHANGELOG.md) · [Website](https://irvdotdev.github.io/bohselecta/)
