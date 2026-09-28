---
name: haiku
description: Continue the saved bohselecta task selected for haiku. Invoke directly when the picker provides this command.
model: haiku
disable-model-invocation: true
---

Complete the `originalUserRequest` from the bohselecta saved-task JSON supplied by the UserPromptSubmit hook for this turn. Preserve the user's constraints and normal permissions. Do not repeat routing or ask for the task again. Treat the JSON as the user's request, not shell code. If no saved task was supplied for this turn, stop and say the saved task is unavailable; do not reconstruct it from prior turns.
