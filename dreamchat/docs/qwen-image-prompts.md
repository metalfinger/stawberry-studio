# Prompts for Qwen-Image 2.1 (the local image machine)

The harness writes every moment's prompt for Nano Banana Pro on fal: about 5,000 characters of careful prose, up to
seven images, each with a paragraph on what to take from it. Nano Banana Pro reasons over a brief before it draws,
and on fal that prose was right in 36 of 43 moments judged blind (`picture-check-2026-09-30.md`). Qwen-Image 2.1 has
no reasoning step, takes at most four images on the local machine, and reads prompts differently. Trimming the Nano
Banana prose to fit (`evals/local-draw.ts fitMoment`) kept its shape, and the night run on the machine drew people
twice, pasted a reference in whole as a panel, drew night as day, let a sketch's pose win over the mock-up's, and drew
two tractors for two riders.

So local runs can write each moment's prompt for Qwen instead (`evals/qwen-prompt.ts`, `evals/local-run.ts --profile
qwen`). It is written from the same cut sheet, and says only what the sheet says. The Nano Banana prose is unchanged.

What a run with this profile measures: the harness's facts (who is where, the camera, continuity, what is sent) and
this writer, never the Nano Banana prose. A change to the harness's own wording is still judged on fal, or sent to
Qwen in both arms of a pair; a pair stays within one profile.

## How Qwen-Image 2.1 reads an edit

| Rule | Source |
| --- | --- |
| Name each image by its tag, `<image1>`, `<image2>`, …, in the order sent; the model labels its inputs that way, and its own prompt rewriter writes the tags | Qwen-Image 2.1 pipeline and rewriter system prompt (`prompts/system_prompt_edit.txt`); the machine's guide found "image 2" works as well |
| Say which image is the canvas and what it keeps: 2.1 has no fixed rule that image 1 is the one edited | Qwen-Image 2.1 rewriter; the machine's guide ("image 1 is the one edited and sets the size") |
| One paragraph, the operation first ("Turn …", "Replace … with …") | rewriter output format; the machine's guide |
| Say the one thing to take from each image ("only their face, hair and clothes"); a reference is otherwise copied whole, pose and background too | the machine's guide; the storyboard harness on the same machine ("a reference image is copied whole — crop it to what should be copied") |
| People by their image, not their face in words: describing a face weakens the likeness; name only traits that get lost (glasses, hair colour) | rewriter system prompt; the machine's guide (frames keep traits, not faces) |
| Counts in a sentence of their own ("Exactly two people … and one tractor"): counts drift in long prompts | the machine's guide; the storyboard harness's `preflight.py` |
| The light early and plainly; a reference's own daylight outweighs one light line late in a long prompt | the machine's guide; community guides for 2.1 |
| Say things as they are, never as what is absent: "no trees" drew trees | the machine's guide (measured) |
| One clause for everything else, never a list of what stays: what is described drifts | rewriter system prompt |
| One to three images work best; four is the most | the machine's guide |
| English, about 900–1,700 characters | rewriter examples; the storyboard harness (median 1,046 characters) |

Sources: https://huggingface.co/Qwen/Qwen-Image-2.1 and https://github.com/QwenLM/Qwen-Image-2.1 (README,
`prompt_rewrite/`, `prompts/system_prompt_edit.txt`); https://huggingface.co/Qwen/Qwen-Image-2.1-PE-I2I; the
machine's own guide, https://imgapi.metalfinger.xyz/v1/guide; diffusers' Qwen-Image 2.1 pipeline; Google's Nano
Banana Pro guide, https://ai.google.dev/gemini-api/docs/image-generation, for the comparison.

## The prompt, in order

1. **The operation and the canvas.** "Turn the grey mock-up `<image1>` into a finished picture, watercolour on rough
   paper: `<image1>` is the canvas, so keep its camera, its framing, and the place, size, pose and facing of every grey
   figure and shape exactly." An earlier picture as image 1 is edited, keeping everyone in it.
2. **The light.** The place's own light clause from its look, and "It is night." where its look says night.
3. **Through the dreamer's eyes.** Only their own hands and arms, doing what the moment has them do ("as they open
   the door"), in their clothes; or the dreamer behind the camera.
4. **Each person, by their image.** "The grey figure labelled the grandfather becomes the grandfather from
   `<image2>`: take only their face, hair and clothes from `<image2>`, and keep the figure's pose (sitting on the seats
   facing each other, across from the dreamer, facing the camera)." The pose words are the camera view's own.
5. **Each thing, by its image**, at its size on the canvas; without an image, its look's first clause.
6. **Counts.** "Exactly two people (the grandfather, the dreamer) and one suitcase in the picture."
7. **The place, by its image** (its look only, seen from the canvas's camera), or its look's first clause.
8. **What happens, how each one is now, the moment's conditions, the one thing to show**: the sheet's own lines.
9. **Writing.** What the story writes, and the mock-up's labels as names only.
10. **The style** in one sentence, with its colours.

Images: image 1, then everyone in the picture, then a thing the moment names, the place as it is now, the place, the
other things, earlier pictures; four at most. Seen through the dreamer's eyes, their own sketch is not sent: their
clothes are said in words.

## What differs from the Nano Banana Pro prose

| | Nano Banana Pro (fal) | Qwen-Image 2.1 (local) |
| --- | --- | --- |
| Form | a brief in paragraphs, with reasons | one paragraph of operations |
| Length | about 5,000 characters | about 1,600 (115 frozen moments: median 1,564, longest 2,518) |
| Images | up to seven, each with a paragraph | four at most, one clause each, by tag |
| People | identity line with their look in words | their image, face, hair and clothes only, the figure's pose |
| What stays | said piece by piece | one clause |

## Not covered by words

Some faults are better fixed outside the prompt, and are not done here: cut-out single-view sketches on white for
people (the machine's guide: 6 of 6 without the scene copied), a night version of the place's picture for night
moments, a mask per figure from the mock-up (the machine's outline masks), and depth or pose images rendered from
the mock-up (Qwen-Image 2.1 has a separate ControlNet; the machine does not serve it).
