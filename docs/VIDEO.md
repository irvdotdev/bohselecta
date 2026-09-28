# Website quickstart recording

The 27-second `website/bohselecta-quickstart.mp4` replaces the earlier HTML approximation of the Ratatui popup. The poster is a crop of the recorded popup itself. Neither is generated artwork or a simulated model response.

Recorded on 28 September 2026 with public release v0.3.0-alpha.3 and Claude Code 2.1.283. The installer was downloaded from the public GitHub release and run with `--prefix ./app` in a disposable project. Node, npm, tmux, and authenticated Claude Code were already available. A real catalog refresh preceded `bohselecta popup claude --model opus`. The default launch model is Sonnet; Opus demonstrates the downgrade.

The recorded prompt was “Plan a todo app. Suggest three features in one short sentence.” Arrow keys selected Opus and then Sonnet; Enter triggered the normal task-bound continuation. Only this synthetic session's transcript was inspected to confirm `claude-sonnet-5` execution. File-editing tools and personal plugins were disabled for the demo session.

Actual PTY output was replayed in a terminal renderer and encoded as H.264 MP4. Pauses and onboarding were cut, account information was cropped out, and chapter labels were added outside the terminal. The real hook-stop notice remains visible. This is an edited walkthrough, not an installation-speed benchmark.

English WebVTT captions explain prerequisites and each step. The player has native controls, a real-popup poster, no autoplay, no audio, and `preload="none"` to avoid downloading the video until requested. The public site remains one page; source and detailed documentation stay in GitHub.

For v0.3.0-alpha.4, the chooser segment and poster were re-recorded from the updated Ratatui binary with the same task and keyboard sequence. The install and Claude continuation segments remain the original alpha.3 recording; the surrounding terminal renderer now uses the website palette. This palette update does not change the continuation behavior.
