# Changelog

## 0.3.0-alpha.7 — optional default Claude shortcut (2026-09-28)

- Add `bohselecta setup claude`: opt in once to open the popup when typing plain `claude` in an interactive zsh or bash terminal.
- Back up profiles, refuse conflicting shortcuts and edited blocks, preserve arguments and scripts, and support `bohselecta default claude on|off|status`.
- Offer setup after interactive direct installation; show the setup command in Homebrew and website instructions.

## 0.3.0-alpha.6 — easier installation (2026-09-28)

- The alpha.5 tag was an unpublished CI packaging attempt; install build dependencies before compiling npm output on clean runners.
- Add a Homebrew tap with Node and tmux dependencies, verified prebuilt popups, and automatic release updates.
- Package compiled JavaScript and four popup binaries for npm and npx, without install scripts or a Rust requirement.
- Test npm global installs, plugin imports, offline routing, popup rendering, and npx on every release platform.

## 0.3.0-alpha.4 — matching terminal and website colors (2026-09-28)

- Match the Ratatui popup to the GitHub page: dark green background, warm cream text, muted sage descriptions, and amber selection and controls.
- Keep the existing keyboard controls and model continuation behavior.

## 0.3.0-alpha.3 — first public alpha (2026-09-28)

- Publish the MIT-licensed service source and source installation instructions.
- Add a user-local installer with verified release checksums and prebuilt macOS/Linux popup binaries.
- Verify clean installation, failed-update preservation, and reinstall with retained task history.
- Test Node 22.18 and 24, and build native arm64/x64 popup binaries in CI.
- Close local installer-test connections explicitly so slow dependency installation cannot race a keep-alive timeout. The alpha.1 tag was a pre-publication build.

- Fix direct installer invocation through symlinks and macOS `/tmp` aliases. Use alpha.3 or later; alpha.2 could exit without installing when invoked through an aliased path.

### Claude popup and quieter integration

- Add `bohselecta popup claude`: a Ratatui chooser in a dedicated tmux session, with Enter to continue, Escape to keep the current model, and q to cancel.
- Automatically submit the selected direct skill command only after guarded readiness checks; bind continuation to the exact saved task and retain a manual fallback.
- Gate automatic popup continuation to the tested Claude Code 2.1.282 and 2.1.283 versions; retain task-bound manual continuation on other versions and preserve saved settings and tool permissions.
- Verify actual Sonnet execution, keep-current Opus execution, and cancellation in a live synthetic 2.1.282 session; additionally verify automatic Sonnet continuation on 2.1.283.
- Fit the chooser to a single writable attached client, down to 46 columns × 15 rows; explain popup failures and preserve manual continuation.
- Cancel an unanswered chooser after 45 seconds and rebuild a missing or outdated Rust binary on launch.
- Show popup mode, automatic or manual continuation, and reasons for keeping the current model in `boh: status`.

- Start the opt-in native preview on Sonnet by default; retain an explicit `--model` override.
- Replace picker → confirmation → continuation with `/boh:sonnet`, `/boh:opus`, or `/boh:haiku`: one command chooses an offered model and continues the saved task.
- Let suitable current-model work proceed quietly; add local `boh: keep` and `boh: cancel` controls.
- Remove the MCP server dependency. Route through a local command hook that stops on caught input, configuration, and storage errors.
- Keep saved requests scoped, expiring, and claimed once; record selection only when chosen, with no false execution verification.
- Preserve default permissions and saved model settings. Automatic Skill invocation remains disabled after live tests answered on the wrong model.
- Fix CLI version output to read package metadata.

## 0.2.2 — show uncertain model choices

- Present two options for uncertain new tasks when a cheaper model is a candidate, instead of silently keeping the expensive model. Follow-ups and long contexts retain their switching guard.
- Keep uncertainty visible rather than presenting a cheaper model as a confident recommendation.
- Record keeping the current model correctly when it is one of the two offered options.
- Add regression coverage for “todo app”, switching, resubmission, advisory mode, and unknown models.

## 0.2.1 — reliable Claude model detection

- Keep configured-model observations tied to the native session across working-directory changes.
- Add a local Claude status-line observer to recover when startup hooks omit the model. Preserve existing custom footer output and restore its configuration on uninstall.
- Reject older observations and reset stale model information on session startup. No API calls or transcript reads are added.
- Cover recovery, installation, and custom-footer preservation with regression tests.

## 0.2.0 — native terminal integration

- Install prompt and lifecycle hooks into Claude Code and Codex using `bohselecta install`.
- Analyse prompts locally before execution; suggest model-switch commands for clear savings or greater required capability.
- Recognise resubmitted tasks after a switch, or respect the user's choice to keep their current model.
- Add local in-conversation controls for status, pausing, and feedback.
- Track native sessions, recommendations, configured models, and finish events in local history without claiming observed execution identity.
- Cache model discovery off the prompt path. Missing or stale catalogs remain advisory.
- Merge existing client settings with private backups, provide dry-run/status/refresh commands, and uninstall only bohselecta's hooks.
- Continue normally on routing, storage, or malformed-input failures. Preserve native tool permissions and avoid double routing in the standalone prototype.

Verified against interactive Claude Code 2.1.282 and Codex CLI 0.155.0-alpha.9.2. Codex requires its normal one-time hook review. Cross-provider delegation and accurate monetary cost estimates are not included.

## 0.1.0 — first working prototype

- Standalone terminal routing for Codex and Claude, with local classification, model selection, history, and feedback.
- Remembered setup and project folder, resumable native conversations, and explicit model overrides.
- JSON recommendations, optional bounded API classification, and private local SQLite storage.
- Terminal and macOS double-click launchers, including support for `bash bohselecta`.
- Static terminal-style product website and local preview server.
