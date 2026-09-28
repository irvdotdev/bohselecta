# Claude: write naturally, choose once

For the optional Ratatui chooser with automatic command submission, see the [popup preview](CLAUDE-POPUP.md). The command-based flow below remains available.

```sh
bohselecta preview claude
```

This opens the real Claude Code terminal UI on Sonnet, using your normal login, settings, and tool permissions. Suitable tasks run quietly. When a different model is worth considering, bohselecta saves the task and shows one or two short commands. Choose a command and the original task continues. There is no picker, confirmation step, MCP server, or task repasting.

For an uncertain task while on Opus, the advice looks like:

```text
bohselecta · Sonnet recommended.
/boh:sonnet — recommended · cost tier 2
/boh:opus — more capacity · cost tier 3
Saved task · relative cost tiers · boh: keep / boh: cancel
```

Type `/boh:sonnet` to choose Sonnet and start the saved task in one step. A clear recommendation shows just one model command. If you already use the recommended model, the task starts normally with no interruption.

## Starting and stopping

From the project folder you want Claude to work in, refresh the model catalog if needed:

```sh
bohselecta native refresh claude
bohselecta preview claude
```

To choose a different starting model or folder:

```sh
bohselecta preview claude --cwd /path/to/project --model opus
```

`--model` overrides the Sonnet starting default for this launch; it does not disable suggestions. The launcher loads the `boh` plugin only for this process, suspending only bohselecta's older Claude router to avoid duplicate advice. It does not install a permanent plugin, change tool permissions, or edit your saved model default. Exit and open `claude` normally to return to the existing integration. Restart an older preview session to get the new plugin name and commands.

## Controls

| Type inside Claude | Result |
| --- | --- |
| `/boh:sonnet`, `/boh:opus`, `/boh:haiku` | Choose an offered model and continue the saved task |
| `boh: keep` | Continue the saved task on the current configured model |
| `boh: cancel` | Discard the saved task without running it |
| `boh: status` | Show configured model and routing status |
| `boh: off` / `boh: on` | Pause or resume local advice |
| `boh: feedback good` / `stronger` / `cheaper` / `unsure` | Rate the latest completed task; use `boh: feedback` before each value |

The older `bohselecta:` control prefix also works. Model commands take no additional arguments. Submit a new prompt to change the request; it supersedes any pending task. Pending tasks are scoped to the Claude session and folder, expire after 24 hours, and can be claimed once. An interrupted claimed task is never replayed automatically.

## What is and is not automatic

Classification, recommendations, saving, and continuation context are local and automatic. A suitable current model proceeds quietly. Changing models requires your direct slash command. Claude still displays “Operation stopped by hook” when generation is paused; this prototype cannot hide that client-owned notice.

A direct skill requests the chosen model for one turn. It does not pin later turns or change the saved default. Subsequent prompts are checked again; context-dependent follow-ups avoid unnecessary downgrade advice. Haiku is excluded in auto and plan permission modes. Other model families are not preview routing targets.

Automatic Skill invocation remains disabled: on Claude Code 2.1.282, the skill-loaded notice said Sonnet but the actual answer came from Opus. Direct invocation answered on Sonnet. Never treat a skill-loaded notice as execution evidence.

There is no MCP connection to fail. The local command hook returns a stop response for caught configuration/storage/input errors. A disabled, missing, killed, or timed-out hook can still fail open in Claude itself. This is model advice, not a guaranteed spending ceiling.

## Pricing, history, and privacy

Cost tiers express the configured relative ranking, not dollar prices or measured subscription savings. This flow makes no paid classification requests. Task history uses the existing private local SQLite store and retention setting; normal Claude transcripts remain separate.

Use `bohselecta history`, `bohselecta history delete ID`, or `bohselecta history clear --yes` in the shell. Completion hooks do not independently verify the execution model, so preview results record `modelEvidence: unavailable` and do not learn a successful model match from an unverified answer. Requested and recommended models remain distinct in stored tasks.

## Verified behavior

On Claude Code 2.1.282 with default permissions and an empty strict MCP configuration:

- A plain synthetic task produced short model commands before generation.
- `/boh:sonnet` delivered the saved request and answered `ONE_STEP_OK` on `claude-sonnet-5`, verified in that test's own response metadata.
- Repeating the command was stopped; it did not answer a second time.
- No inline shell loader or additional tool grants were used.

Earlier experiments used a native MCP picker, then a separate model command. That unnecessary two-step interaction and server dependency have been removed. Automatic model-invoked skills failed both headless and interactive execution checks; this remains a known client limitation.

Official references: [hooks](https://code.claude.com/docs/en/hooks), [skill model selection](https://code.claude.com/docs/en/skills#frontmatter-reference), [plugin reference](https://code.claude.com/docs/en/plugins-reference).
