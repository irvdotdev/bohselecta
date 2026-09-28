# bohselecta inside Claude Code and Codex

This guide covers the older persistent hook integration: manual model-switch suggestions inside Claude Code and Codex. For the recommended Claude chooser and optional plain-`claude` launch, use the [popup guide](CLAUDE-POPUP.md). These are separate integrations.

## Install once

Install the [current release](../README.md#install), sign in to the clients you want to use, then run:

```sh
bohselecta install
```

This adds bohselecta command hooks to `~/.claude/settings.json` and `~/.codex/hooks.json`. Existing settings and other hooks are preserved. For Claude, installation also adds a local status-line model observer; existing custom status-line commands keep their output and are restored on uninstall. Changed files receive a private, timestamped backup next to the original. Installation is idempotent; running it again updates only bohselecta's entries. It discovers the clients' model catalogs without submitting a task. You must have the clients installed and signed in for discovery to work.

Restart Claude Code and Codex after installation. In Codex, open **`/hooks`**, review the bohselecta entries, and trust them. Installation does not grant hook trust or change your permissions. If you have other untrusted hooks, review entries individually rather than trusting everything.

Install only one client with `bohselecta install claude` or `bohselecta install codex`. `--dry-run` previews changes, and `--offline` skips client discovery. Offline installation uses advisory suggestions until a catalog is refreshed.

## Everyday use

1. Open `command claude` or `codex` in your project. `command claude` bypasses the optional popup shortcut so you can use this manual hook flow.
2. Write a task as usual.
3. When the model is suitable, work continues. For a confident downgrade or a needed capability upgrade, bohselecta pauses with a recommendation. An uncertain new task with a cheaper candidate presents two options before execution.
4. In Claude Code, use the suggested command, such as `/model haiku`. In Codex, enter `/model`, select the suggested model, and choose the suggested effort.
5. Resubmit the original task. Bohselecta recognises the pending task and continues with your selection.

You can keep your current model by resubmitting the original task unchanged. A pending recommendation is recognised for up to 24 hours in the same session and working directory. Editing the task triggers a fresh analysis. Bohselecta does not type commands into your terminal or change the host model for you. Native `/model` commands may also save a default for future sessions, depending on the client and your configuration.

The first real-client checks used Claude Code 2.1.282 and Codex CLI 0.155.0-alpha.9.2. Older releases may not support these events; check your client’s documentation and update if needed.

## Controls in the conversation

Type these as ordinary messages in either client:

```text
bohselecta: status
bohselecta: off
bohselecta: on
bohselecta: feedback good
bohselecta: feedback stronger
bohselecta: feedback cheaper
bohselecta: feedback unsure
```

The prompt hook handles these messages locally and stops them reaching the model. The client's “blocked by hook” label is expected for a local control or a switch suggestion. `off` pauses suggestions and recording of new prompts for this session; `on` resumes them. Feedback applies to the last turn for which a finish event was received. It never reruns work. An occasional optional feedback reminder is shown after every five observed completed turns, where the client displays hook notices.

These are hook controls, not shell commands or native slash commands. If hooks are not enabled or trusted, the client will treat them as ordinary prompts.

## Shell commands

```sh
bohselecta native status
bohselecta native refresh
bohselecta history
bohselecta history --json
bohselecta feedback TASK_ID good
bohselecta uninstall
```

`native refresh` updates discovered models. The prompt path never launches a client or makes a network call. Catalogs are considered fresh for seven days; missing or stale catalogs produce non-blocking advice rather than claiming account availability. Even a recently discovered model can be rejected by a provider at execution time.

`uninstall` removes bohselecta's marked handlers and restores any status line it wrapped. It preserves replacement status lines and other settings changed since installation. It does not delete history. Restart the clients afterwards.

To use another settings directory, `CODEX_HOME` and `CLAUDE_CONFIG_DIR` are respected. For installation, removal, or status of one client, `--config-dir /path/to/config` overrides the directory. Discovery uses the clients' normal environment, so use the appropriate client environment variable when testing a different account/configuration. `--home` controls bohselecta's separate data directory and is embedded in the installed hook commands.

## Configuration

Run `bohselecta config init`, then edit the displayed `config.json` path. Existing fields remain supported. Add:

```json
"native": { "mode": "suggest" }
```

Modes:

- `suggest` (default): pause once for worthwhile model changes or two-option comparisons when a fresh catalog and current model are known.
- `advisory`: show suggestions, but keep the task running on the current model.
- `off`: skip routing and recording new prompts globally. Session controls remain available.

`feedbackEvery: 0` disables optional feedback reminders. `retentionDays` controls local history, with 90 days as the default. Model ratings and exclusions in `models` are reapplied to the cached catalog on every prompt.

## What it measures

Routing uses local task rules, relative cost tiers, and relevant task history. There is no extra classification API call on the native hook path, including when the optional classifier is configured for the standalone prototype. These tiers are not current dollar prices, subscription usage ratios, or measured savings. Real pricing, retry costs, and subscription-aware comparisons are later work.

Claude's interactive `SessionStart` and `PostModelSwitch` events provide the configured model. A local status-line observer also reads `model.id` from Claude's status-line input, allowing recovery when startup events omit it. Model observations follow the native session across working-directory changes; task context stays scoped to its directory. The observer runs on Claude's status updates and, by default, every five seconds. Only the session/model observation is saved, not the status-line payload. It makes no model or network calls. Codex includes it in hook inputs. The tested Claude non-interactive `-p` mode omitted the startup model; bohselecta leaves the task alone when model identity is unknown. It does not infer the current model from an old assistant response.

These hooks observe configured models and turn completion, not the actual serving model, test results, or correctness. A finish event alone does not teach a successful choice: learning from success requires your explicit `good` feedback. Native fallback or mid-turn model changes can make execution identity unavailable. No token or monetary telemetry is invented.

Short follow-ups use up to 6,000 characters of local routing context. Clear downgrades require confidence and a short known context; this is only a conservative guard against switching costs, not a full cache-cost estimator. Uncertain new tasks with a cheaper candidate present two options for you to compare; follow-ups and long contexts keep the current model. Underpowered models can receive two stronger alternatives.

## Privacy and failure behavior

Prompts, bounded context, recommendations, model choices, finish events, and feedback are stored in a local SQLite database under `~/.local/share/bohselecta`. Files are private to your OS user, not encrypted. The hook never reads native transcript files. Other providers do not receive your task through this integration; the active client sends it through its usual service when it continues.

Invalid input, oversized prompts, unavailable storage, and broken configuration cause the hook to continue normally. A short diagnostic points to `bohselecta native status`; it does not echo prompt contents. The client’s normal tool approvals remain in force. The hooks do not execute tasks or delegate to the other provider.

Use `bohselecta history delete TASK_ID` or `bohselecta history clear --yes` to remove local history. This also clears relevant pending routing context. Native Claude/Codex transcripts are managed separately. The `BOHSELECTA_BYPASS=1` environment variable skips these hooks for a single process; bohselecta's standalone wrapper and model-discovery commands set it for their children to prevent double routing.

## Troubleshooting

- **Nothing happens:** check `bohselecta native status`, restart the client, and review `/hooks` in Codex. Client settings or organization policy can disable hooks. A suitable current model intentionally produces no interruption.
- **Claude's current model is unknown:** update the installed integration with `bohselecta install claude --offline`, then restart Claude once. The footer should show `bohselecta · <model>` (or your existing custom footer), and `bohselecta: status` should report the model after the first footer refresh. Claude may omit model information from startup hooks; the status-line observer provides a second local source. If a project or organization overrides/disables the status line, check that configuration. Non-interactive mode has no status line, so suggestions remain inactive when no reliable model is supplied.
- **Advice doesn't pause:** check `native.mode` and run `bohselecta native refresh`; stale catalogs are advisory. Some clients display informational hook messages differently.
- **Want fewer suggestions:** type `bohselecta: off` for this session, or set advisory mode globally.
- **Moved this checkout or upgraded Node:** rerun `bohselecta install` to update the absolute executable/script paths. Codex may ask you to review changed hooks again.
- **Native session in `bohselecta sessions`:** resume it with the original client's resume command; the standalone wrapper will not take ownership of it.
- **Other Codex surfaces:** user-level hooks may load in other clients sharing the same configuration. Terminal behavior is what has been tested in this release.

## References

- [Codex hooks and trust](https://learn.chatgpt.com/docs/hooks)
- [Codex model commands](https://learn.chatgpt.com/docs/developer-commands)
- [Claude hook events](https://code.claude.com/docs/en/hooks)
- [Claude model configuration](https://code.claude.com/docs/en/model-config)

- [Claude status-line input and refresh behavior](https://code.claude.com/docs/en/statusline)
