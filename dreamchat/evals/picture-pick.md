# Picking the best of a moment's takes

A storyboard is being made from someone's dream. One moment of it has been drawn two or three times, in
different ways, and you keep the one the dreamer would most want in their storyboard. The other takes are
kept as alternates; nothing is thrown away.

## What you are given

A pick request in the judge queue (`judge-queue/pick-<session>-<moment>-v<version>.json`):

- `said`: what the dreamer said, in their own words, in order.
- `line`: the moment's one-line description: what happens in it.
- `before`: the picture just before this moment in their storyboard (`image`, with its own `line`), for
  continuity only; `null` for the first moment drawn.
- `takes`: the versions of this moment, each an `id` (a letter) and an `image`. The letters and their order
  say nothing about how each was drawn.
- `answerFile`: where to write your answer.

Look at the picture before, then at every take.

## How to judge

Judge each take as the dreamer would when flipping through their storyboard: **would they keep this
picture?** Look at it once as a whole, then against the picture just before it. Do not hunt for flaws; a
picture is not worse because you can list small things about it.

- **right**: they would keep it as it is. This moment of their dream reads at a glance, and flipping from the
  picture before, nothing jolts them. Most pictures with small imperfections are right: a slightly different
  shirt, a detail the dream mentions missing or changed (fewer books, no oars, the apples not glowing in this
  one, a different lamp), a framing similar to the last picture, the staging a little stiff, a background
  that shifted. None of these are what the dreamer looks at.
- **partly**: they would keep it but ask for one fix, because one thing they would notice straight away is
  off: the dreamer looks like someone else, a thing is with the wrong person, a person who was there has
  gone for no reason, the water or weather that the moment is about is missing, the view looks exactly like
  the last picture when the story has clearly moved somewhere new.
- **wrong**: they would throw it away, because it breaks the story: the key action is not what happened, the
  picture shows something that is not in their dream (a tractor inside the room), someone jumps into a pose or
  place that contradicts the picture just before (suddenly seated, suddenly somewhere else), a person is half
  erased or something looks pasted on, or the main state of the scene is gone (the flooded room completely dry).

Judge against what the dreamer said, not the moment's line, where they disagree. Do not judge the drawing
style.

## What to keep

Keep the take the dreamer would most want in their storyboard: the moment reads at a glance and follows on
from the picture before without a jolt. Prefer a right take to a partly one, and a partly one to a wrong one;
among takes alike, keep the one that reads best at a glance. If every take is wrong, still keep the least
wrong: a moment always has a picture.

## The answer

Write JSON only to `answerFile`, one object for this moment:

```json
{
  "best": "<take id>",
  "verdicts": { "<take id>": "right" | "partly" | "wrong", ... },
  "reason": "<one sentence>"
}
```

`best` must be one of the take ids in the request, and `verdicts` gives every take a verdict. Write the file
whole in one go; the harness reads it as soon as it is there. With no answer in time
(`DREAMCHAT_JUDGE_WAIT_MS`), the harness keeps its first take.
