# Original standalone launcher

This optional interface is separate from the recommended Claude popup.

## Easiest way to start

In Terminal, type:

```sh
bohselecta
```

On your first launch, choose **Codex or Claude** and paste the **project folder** you want to work in. Press Enter to accept the displayed folder. Bohselecta remembers both choices and opens them directly next time. Then just type your task.

Requires Node.js 22.18+ (22.x) or 24+, and an installed, signed-in Codex or Claude client.

To change your saved assistant or folder:

```sh
bohselecta setup
```

To use a different folder just for this launch:

```sh
bohselecta --cwd /path/to/repository
```

Explicit client commands still work and use the terminal's current folder, without changing your saved preferences:

```sh
bohselecta codex
bohselecta claude --cwd /path/to/repository
```

For a fresh installation, run `npm install` and `npm link` from this project once. Without installing the command globally, run `npm start` from this project or use the double-click launcher. `bohselecta --help` lists all commands; `bohselecta doctor` checks installed clients.

The standalone launcher does not install hooks itself. Use `bohselecta install` to enable the native integration described above; the launcher skips those hooks to avoid double routing. It provides its own small terminal interface around the real clients' agent runtimes. Client configuration, credentials, instructions, and applicable hooks are still loaded. Use a working directory you trust.

## Everyday use

Enter a task. With one clear recommendation, execution starts automatically. With two choices, select `1` or `2`; Enter cancels without sending the task. You can always pin a model.

```text
bohselecta › Fix the typo in the README heading

1. GPT-6-Luna · low reasoning
   The requested change is narrow and well-defined.
Selected GPT-6-Luna · low. Starting task…
```

Commands inside a session:

| Command | Action |
| --- | --- |
| `/models` | List models returned by the client |
| `/model MODEL` | Pin a model for subsequent tasks |
| `/auto` | Return to automatic routing |
| `/feedback good` | Mark the last task's model a good fit |
| `/feedback stronger` | Indicate that a stronger model was needed |
| `/feedback cheaper` | Indicate that a cheaper model may suffice |
| `/feedback unsure` | Save inconclusive feedback |
| `/history` | Show recent tasks in this project |
| `/help` | Show help |
| `/exit` | Exit |

End a line with `\` to continue a multiline prompt. Ctrl-C cancels the active task or current question. Ctrl-D or `/exit` closes the session. Agent tool approvals appear in the terminal; only an explicit `y` grants an action that the client asks you to approve. Client rules can still allow actions without prompting. Codex runs with the workspace-write sandbox and on-request user approvals; Claude uses its default permission mode. Unsupported permission-profile expansion requests are denied.

Native client slash commands, image attachments, terminal autocomplete, and concurrent background agents are not implemented in this first interface. The first release routes text tasks within the selected provider; it does not transfer conversations between Claude and Codex.

## Recommendations, scripting, and history

```sh
bohselecta recommend codex "Rename the button label to Save"
bohselecta recommend claude "Investigate this intermittent failure" --json
bohselecta recommend codex "Fix the README typo" --offline --json
bohselecta models claude

bohselecta codex --prompt "Explain this function" --choose 1
bohselecta claude --model sonnet --effort medium --prompt "Review this change"

bohselecta sessions
bohselecta codex --resume SESSION_ID
bohselecta history
bohselecta history --json
bohselecta feedback TASK_ID good
```

`recommend` saves the suggestion but never submits the task. `--offline` uses the bundled catalog, makes no client or classifier request, and does not verify account availability. Normal model discovery reflects the client's model picker, but an account/provider may still reject a model at request time. Such errors are recorded; bohselecta does not silently retry on a pricier model.

`--resume` takes a **bohselecta session ID**, not a native client ID, and preserves the original working directory. One bohselecta process may hold a session at a time. Piped input is accepted as a single task. If two models are suggested in non-interactive mode, pass `--choose 1`, `--choose 2`, or `--model MODEL`. Tool approvals still require a terminal and are never implicitly accepted.

Agents can call `bohselecta recommend CLIENT "TASK" --json` as a command to receive structured recommendations. This command does not itself switch the caller's model.

## How routing works

1. Classify task type, scope, ambiguity, and consequences with local rules. Short follow-ups use a bounded excerpt of prior conversation; the underlying agent keeps the full native conversation.
2. Look for similar tasks in the same project and provider, under the current catalog version. Only completed tasks marked **good** by you can supply a learned successful choice. Recorded negative feedback can raise the required capability.
3. Rank available models by configured cost tier subject to the capability floor. A current model at the same cost tier is preferred to unnecessary switching. Models with unknown ratings require an explicit override.
4. If configured, ask a small OpenAI classifier about uncertain tasks. It classifies difficulty rather than selecting models; it cannot lower the rule-based difficulty floor.
5. Present one winner or two meaningful alternatives, then apply model and supported reasoning settings before submission.

The starter model tiers are **heuristic policy**, not measured benchmarks or price ratios. Cost tier 2 does not mean twice the subscription usage of tier 1. Real cost depends on context, cache rebuilds, retries, reasoning, and tools. Switching a long conversation can cost more than staying put; this release only avoids switches within the same cost tier and does not predict that break-even point.

Claude assistant responses report observed model IDs. Codex exposes the configured model and reroute events; bohselecta verifies the configuration but labels execution identity as unavailable. It never presents configured identity as observed execution identity. Native fallback models can be recorded separately from bohselecta's recommendation.

The tool requests occasional feedback after every five uncertain or overridden tasks. Set `feedbackEvery` to `0`, or pass `--no-feedback`, to disable questions. Explicit `/feedback` always works.

## Configuration and optional classifier

```sh
bohselecta config init
bohselecta config
```

Default data directory: `~/.local/share/bohselecta`. Override it using `BOHSELECTA_HOME` or `--home PATH`. The printed `config.json` path is editable. Example model policy:

```json
{
  "version": 1,
  "feedbackEvery": 5,
  "retentionDays": 90,
  "models": {
    "codex": {
      "gpt-6-luna": { "capability": 1, "costRank": 1 },
      "gpt-6-sol": { "capability": 2, "costRank": 2 },
      "gpt-6-astra": { "capability": 3, "costRank": 3 }
    }
  }
}
```

Capability is 1–4; costRank is a positive relative rank. Set `disabled: true` on an entry to exclude it. Exact IDs must come from `bohselecta models`. Unknown future models can be rated here without editing code. Reconnect after changing configuration.

Local routing needs no additional API key. To enable optional API classification, set `OPENAI_API_KEY` and add a `classifier` object with these fields:

| Field | Meaning |
| --- | --- |
| `model` | An inexpensive Responses API model supporting structured outputs |
| `dailyBudgetUsd` | Daily reservation budget, e.g. `0.10` |
| `inputUsdPerMillion` | Current input price for that model |
| `outputUsdPerMillion` | Current output price for that model |
| `maxCallsPerDay` | Daily request limit, e.g. `20` |

No classifier is enabled by default and no credential is stored in config. Enabling it sends up to 6,000 task characters and 3,000 context characters to OpenAI with `store: false`; the request has no tools, an eight-second timeout, and a 400-output-token limit. Conservative reservations use your configured prices, so keep them current. They are not a provider billing cap. Errors retain their reservation and fall back visibly to local routing. History deletion does not reset the classifier budget.

The underlying Codex and Claude runtimes use their own authentication and billing. SDK/subscription eligibility depends on provider policies and your account; bohselecta neither extracts credentials nor translates subscription limits into dollars.

## Stored data

SQLite records task text, a bounded context excerpt, recommendations, selection, configured/observed model evidence, output, status, timing, token telemetry, and feedback. These files are private to your OS user but are **not encrypted**. Retention defaults to 90 days; `0` disables automatic pruning.

```sh
bohselecta history delete TASK_ID
bohselecta history clear --yes
```

Deletion clears bohselecta records and relevant saved routing context. It does not delete transcripts retained by Codex or Claude or remove semantic references in other outputs. Native transcripts are managed by their own clients.

Claude USD figures are client estimates (including applicable query-pipeline calls), not subscription charges. After resuming Claude in a fresh process, the first turn's cost estimate is omitted because the prior cumulative baseline is unavailable. Claude token figures cover the main agent turn. Codex token figures use differences of cumulative client telemetry, persisted across resumes. Savings against an always-expensive baseline have not yet been measured.

## Development and verification

```sh
npm run check
npm test

# Optional real-client checks: these consume model usage.
node scripts/smoke-live.ts
node scripts/smoke-cli.ts
```

Offline tests cover routing, history and feedback, bounded classification, CLI behavior, model switching, explicit approvals, cancellation, crashes, and model mismatch handling. Live checks verify both clients, model switching, and preserved conversation context. Tests use isolated temporary workspaces and history.

Implementation: TypeScript using Node's native type stripping, `node:sqlite`, the official Claude Agent SDK, and Codex App Server over stdio. No hosted service is required. Native macOS integrations remain a later milestone.

Primary interface references: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk), [Claude permissions](https://code.claude.com/docs/en/agent-sdk/permissions), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
