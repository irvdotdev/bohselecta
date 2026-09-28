# bohselecta documentation

Start with the [quick setup](../README.md#install): install with Homebrew, run `bohselecta native refresh claude`, then `bohselecta setup claude`. Opt in, open a new terminal, and type `claude`.

| Guide | Covers |
| --- | --- |
| [Installation](INSTALL.md) | Requirements, installer locations, updates, and removal |
| [Default launch](../README.md#default-launch-and-undo) | Shell setup, bypassing the shortcut, status, and undo |
| [Claude popup](CLAUDE-POPUP.md) | Keyboard controls, model continuation, testing, and missing popups |
| [Claude without tmux](CLAUDE-PREVIEW.md) | Model advice with manual continuation commands |
| [Persistent Claude and Codex hooks](NATIVE.md) | Manual model switching, configuration, and local data |
| [Original standalone launcher](STANDALONE.md) | The separate, optional terminal prototype |
| [Changelog](../CHANGELOG.md) | Released changes |
| [Contributing](../CONTRIBUTING.md) | Development checks and useful bug reports |
| [Release process](RELEASING.md) | GitHub assets, Homebrew updates, and npm publishing |
| [Walkthrough recording](VIDEO.md) | What was recorded and which release it shows |

The current public release is an alpha. Automatic popup continuation is validated on Claude Code 2.1.282–283; other versions show a manual command. Model overrides apply to one task. Cost tiers are relative rankings, not live dollar prices or measured savings. npm/npx release downloads work; npm registry publication is still pending.
