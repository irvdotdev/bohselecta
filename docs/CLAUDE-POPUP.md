# Ratatui popup for Claude

```sh
bohselecta popup claude
```

Write your task in the real Claude Code terminal. If the current model is suitable, work continues quietly. When bohselecta recommends a different model, a small chooser appears over the conversation:

```text
┌ bohselecta ──────────────────────────────────────┐
│ THE RIGHT MODEL. BACK TO WORK.                   │
│                                                  │
│ Plan a todo app                                  │
│ Scope is uncertain; compare two options.         │
│                                                  │
│ › Sonnet    tier 2  RECOMMENDED                   │
│   Opus      tier 3  MORE CAPACITY                 │
│                                                  │
│ ↑↓ choose  Enter continue  Esc keep  q cancel     │
└──────────────────────────────────────────────────┘
```

Use arrow keys and **Enter** to choose and continue. **Escape** keeps the current model and continues. **q** or **Ctrl-C** cancels the task. No choice within 45 seconds cancels it. The popup shows relative cost tiers, not monetary estimates.

## Setup

```sh
brew install irvdotdev/tap/bohselecta
bohselecta native refresh claude
bohselecta setup claude
```

Opt in, open a new terminal, then type `claude` in your project folder. The optional zsh/bash shortcut only routes plain interactive `claude` through the popup. Commands with arguments, such as `claude --resume`, use ordinary Claude. Skip setup and use `bohselecta popup claude` if you prefer.

Check with `bohselecta default claude status`. Undo with `bohselecta default claude off`, then open a new terminal. See [installation](INSTALL.md) for other methods.


Install the [public alpha](../README.md#install). It needs signed-in Claude Code, tmux, Node/npm, and the Ratatui binary included by the installer. Automatic continuation is validated on **2.1.282 and 2.1.283**; other versions still show the chooser and provide a task-bound command to enter after selecting a different model. The installer uses a prebuilt popup and needs no Rust. First launch from a source checkout uses Cargo to build the locked Rust dependencies if the binary is missing or older than the Rust source; Rust/Cargo must be installed for that build. The command checks the Claude version and disables automatic typing on unvalidated versions. It does not prevent the popup from opening.

The launcher starts on Sonnet, so most ordinary work needs no popup. To see a downgrade suggestion, start on Opus:

```sh
bohselecta popup claude --model opus
```

You can also set `--cwd /path/to/project` and `--home /path/to/local/data`. A fresh model catalog is required, as in the plain preview: run `bohselecta native refresh claude` if prompted.

This uses a dedicated tmux server and the actual Claude terminal interface. It does not edit your tmux configuration, saved model default, or Claude tool permissions. Existing bohselecta native hooks are bypassed only for this launch to avoid double routing. Exit Claude normally to return to your terminal. If you detach from tmux, the launcher prints the exact command to reattach; it does not kill the running task.

The simpler `bohselecta preview claude` remains available without tmux or Rust.

## How Enter continues the task

The local hook saves the task and opens Ratatui in a tmux popup. Selecting the current model allows the original prompt to continue. Selecting another model closes the popup and stops the original turn. A bounded helper then submits the corresponding direct skill command to the dedicated Claude pane.

On the validated Claude version, the helper waits for the hook to exit, checks the owning process and pane, and requires the matching task marker followed by an empty prompt on repeated screen checks. The command includes the exact task identifier. The hook checks that identifier inside the atomic claim, so a late popup cannot accidentally claim a newer request. Only Haiku, Sonnet, or Opus continuation commands can be submitted; task text is never typed through this bridge.

This is **version-specific terminal automation**, not a new Claude model-switch API. Do not type ahead while the popup hands back control. Screen checks reduce timing risks but cannot make UI automation equivalent to a transactional client API. If readiness is not established within 12 seconds, the helper sends nothing; your saved task remains available through the displayed `/boh:…` command.

Claude still displays its hook-stop notice and the submitted continuation command in the conversation. The popup removes manual command entry; it does not remove that client-owned notice. A skill model override lasts one turn; subsequent prompts are checked again. There is no API classifier call or MCP server in this path. Hooks can still fail open if disabled or killed by the host, so this is not a guaranteed budget-enforcement tool.

## Live verification

Tested in an isolated native Claude Code 2.1.282 session with tmux 3.7c, no MCP servers, and no additional tool grants:

| Action | Observed result |
| --- | --- |
| Enter on Sonnet | Popup closed; helper submitted the command; `POPUP_OK` answered on `claude-sonnet-5` |
| Final task-bound Enter path | `BOUND_POPUP_OK` answered on `claude-sonnet-5` |
| Escape / keep current | `KEEP_POPUP_OK` answered on the original `claude-opus-5-5` |
| q / cancel | Task stored as cancelled; no assistant answer for that request |

Only the synthetic test's own transcript was inspected for execution identity. Production hooks still record requested models and unavailable execution evidence, as described in the [plain preview guide](CLAUDE-PREVIEW.md).

Automated checks cover stale task IDs, repeated claims, occupied prompts, missing markers, malformed input, cancellation, model availability, and normal/small Ratatui layouts.

Build/test locally:

```sh
cargo test --locked --manifest-path prototypes/popup/Cargo.toml
npm run check
npm test
```

## When no popup appears

- Launch with `bohselecta popup claude`, or plain `claude` after opting in with `bohselecta setup claude` and opening a new terminal. Check `bohselecta default claude status` if the shortcut is missing. Commands with arguments and `bohselecta preview claude` do not open Ratatui.
- Type `boh: status` inside Claude to see popup mode, current model, and whether the last task kept its model. Prompts such as `an app` may continue quietly on Sonnet.
- To exercise a switch, launch `bohselecta popup claude --model opus` and submit `an app`.
- Focus the Claude pane in one writable tmux client. The chooser fits the terminal, down to 46 columns × 15 rows. When it cannot open, the hook gives a reason and preserves the saved-task commands.
- On an unvalidated Claude version, choosing another model shows the exact `/boh:… --task …` command to enter. Escape and cancellation still work in the popup.

The chooser waits at most 45 seconds, leaving time to return its decision before the client hook budget expires. Its parent waits at most 50 seconds. See [Claude hook timeouts](https://code.claude.com/docs/en/hooks#timeouts).

## Claude 2.1.283 handoff verification

An isolated interactive session on 2.1.283 was started on Opus with only the local bohselecta plugin, no MCP servers, and no built-in tools. Selecting Sonnet in the real Ratatui popup automatically submitted the task-bound `/boh:sonnet --task …` command and completed the saved diagnostic prompt. The synthetic session transcript reported `claude-sonnet-5` for `HANDOFF_283_OK`.

Automatic continuation is enabled for 2.1.282 and 2.1.283. Restart `bohselecta popup claude` after updating so the new launch mode takes effect. Sessions launched with the earlier manual fallback retain that mode until restarted.

The direct skill model override applies to the selected task. Claude's session header can continue to display the configured default model; that header is not proof of the model used for the overridden turn.
