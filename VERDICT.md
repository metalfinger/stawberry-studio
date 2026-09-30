# Verdict: lab/agent-portability

- **Question:** Can Strawberry Studio run a real dream end to end on its own and grade its own frames honestly? If not, can an open image judge on the PC replace the host's self-grading?
- **Answer:**
  - "The Ice Head" got 8 of 11 cuts drawn and self-passed. A blind reviewer then rejected all 8, so the host grades generously.
  - The harness gained many checks as a result, including palette conflicts, sheet matching, not-visible answers, inherited defects, prompt-scoped budgets and the remote-judge client.
  - Neither open judge (Qwen3-VL-8B, Qwen3.5-27B) is trustworthy.
  - The dream chat plan moved to its own branch, `lab/dream-chat`.
- **Evidence:**
  - Commits 3ccb7c7, 30c9851 (DREAM_CHAT_PLAN.md) and a9ac1d5 (judge results); 163 studio tests pass.
  - On the 15 disputed questions, the 8B sided with the blind reviewer 3 of 15 times and with the host 11. The 27B with thinking off split 7/7, at ~17 s per frame. With thinking on it fixed the clock but took ~4 min per frame.
  - Engram decision `projects/strawberry-studio/decisions/2026-09-23-drop-open-image-judges.md`; backups in `~/Documents/Strawberry-Backups/icehead-2026-09-23*.zip`.
- **Left open:**
  - 3 ice-head cuts still to draw.
  - Items from autoloop/state.json: `policy.require_stranger`, rewording `continues`, tests for the newer checks, and moving `cuts.py`/`reanswer.py` into the engine.
  - A labelled set from Hiren's own marks before any future judge test.
  - To resume: read `autoloop/PAUSED.md`.
- **Verdict:** Park. The harness checks are worth keeping and the loop can resume from PAUSED.md. The open-judge path is killed. Active work continues in `lab/dream-chat`.
