# Checkpoint verdicts

The owner's blind verdicts from each picture checkpoint. `verdicts.ts` (branch `s5-fix2`) reads these to make sure a
picture the owner already judged wrong is never sent again as a reference: it looks in `runs/checkpoint/<name>/`
(gitignored, and in DREAMCHAT_DATA's copy too) for each checkpoint's `answers.json` and `judge/made.json`, alongside
`evals/story-pictures.json`. Without a restored copy, a fresh checkout has no verdicts to read, and would send a
picture judged wrong straight back to fal.

Restore before running anything that reads verdicts (copy each checkpoint's own subfolder back into place):

    cd dreamchat
    mkdir -p runs/checkpoint/s4/judge
    cp evals/checkpoint/s4/answers.json runs/checkpoint/s4/answers.json
    cp evals/checkpoint/s4/key.json runs/checkpoint/s4/key.json
    cp evals/checkpoint/s4/judge/made.json runs/checkpoint/s4/judge/made.json

Once a checkpoint is finished and judged, copy its `answers.json`, `key.json` and `judge/made.json` here, under
`evals/checkpoint/<name>/`, so the next checkout keeps them.

- `s4`: the camera-rules checkpoint (27 Sep), 20 moments, judged blind. Score: new right 15/20, old 10/20.
- `s5`: the references checkpoint (29 Sep), 17 moments, judged blind. Score: new right 7/17, old right 12/17;
  faults put right 2/8, guards kept 5/9. `answers.before-correction.json` keeps the page's answers before the owner's
  one correction (orchard-m3: 'neither' to 'A').
