Install bohselecta with Homebrew or the direct installer. This release removes npm/npx distribution packages and registry publishing.

```sh
brew install irvdotdev/tap/bohselecta
bohselecta native refresh claude
bohselecta setup claude
```

Answer yes, open a new terminal in your project folder, and type `claude`. Already using Homebrew? Run `brew update && brew upgrade bohselecta` first.

Setup is optional, backed up, and reversible: `bohselecta default claude off`, then open a new terminal. Commands with arguments keep using ordinary Claude.

Includes the source archive, direct installer, four prebuilt popup binaries, Homebrew formula, and SHA-256 checksums. No Rust needed. npm is still used internally to install application dependencies; there is no npm registry login or publication step.

Supports macOS 15+ and compatible glibc Linux on arm64/x64. Automatic continuation is validated on Claude Code 2.1.282–283; other versions show a manual command.

[Installation](https://github.com/irvdotdev/bohselecta#install) · [Documentation](https://github.com/irvdotdev/bohselecta/blob/main/docs/README.md) · [Website](https://irvdotdev.github.io/bohselecta/)
