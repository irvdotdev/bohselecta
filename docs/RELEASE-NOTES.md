First public alpha of bohselecta: local model advice inside Claude Code, with a Ratatui chooser, saved-task continuation, and existing native hooks for Claude and Codex.

- Source installation and a no-sudo installer with SHA-256 verification.
- Prebuilt popup binaries for macOS Apple Silicon/Intel and Linux arm64/x64.
- Claude 2.1.282 and 2.1.283 automatic continuation; other versions provide manual commands.
- Local history and feedback, quiet routing, and relative cost tiers.

Install instructions: https://github.com/irvdotdev/bohselecta#install
Documentation: https://irvdotdev.github.io/bohselecta/docs.html

Requires Node.js 22.18+ (22.x) or 24+, npm, signed-in Claude Code, and tmux for the popup. No Rust needed with the installer. Model overrides last one task; Claude's hook notice remains visible. Pricing in dollars and cross-provider handoff are future work. This is an alpha, not a guaranteed spending limit.
