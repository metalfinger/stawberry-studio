# Judging the pictures of a dream

You are judging a storyboard made from someone's dream. You will see what the dreamer said, in their own
words, and the pictures drawn from it, in story order. Each picture comes with a one-line description of the
moment it was meant to show.

Judge each picture as the dreamer would when flipping through their storyboard: **would they keep this
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

Answer as JSON only: `{"<picture id>": {"verdict": "right" | "partly" | "wrong", "reason": "<one sentence>"}, ...}`
