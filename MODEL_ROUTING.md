# Image model routing

Date: 2026-09-18
Status: Live-schema integration complete; visual benchmark pending.

## Boundary

Higgsfield is Strawberry's current image execution provider. It is not the
creative database, continuity system or permanent provider abstraction. A
generation recipe freezes the provider, model, settings, prompt and ordered
references. Changing any of them creates a new recipe and requires approval.

The installed, authenticated CLI is `higgsfield 0.1.28`. Read-only discovery on
2026-09-18 returned 44 image models. Strawberry exposes the live list with:

```bash
venv/bin/python -m backend.studio models
venv/bin/python -m backend.studio model gpt_image_2_5
```

The local viewer's **Models** panel exposes the same read-only contracts. Model
discovery never submits a job or spends credits.

## What is verified

- `nano_banana_2` (Nano Banana Pro) declares a prompt plus `input_images`.
- `gpt_image_2_5` (GPT Image 2.5) declares a prompt plus `medias`.
- `flux_2` (FLUX.2) declares a prompt plus `input_images`.
- `seedream_v5_pro` (Seedream 5.0 Pro) declares a prompt plus `medias`.
- The Higgsfield create command accepts ordered repeated `--image` arguments.
- Strawberry maps either schema name to the same ordered `ReferenceUse` records.
- The live schema exposes settings and enums. It does not consistently expose a
  maximum reference count or prove visual identity/geography performance.

The first real four-image asset batch completed on 2026-09-18: three Nano Banana
Pro sheets and one GPT Image 2.5 character sheet. See `VISUAL_PROOF_BATCH.md` for
observed prompt deviations. Text-to-image submission, receipt parsing and local
collection are now verified. Reference-conditioned storyboard cuts remain untested.

## Current default

The user selected GPT Image 2.5 (`gpt_image_2_5`) on 2026-09-18 as the default
for new image recipes. The shared request contract applies this when `model`
is omitted, without an environment flag. Explicit model choices remain supported;
stored recipes and historical takes are never rewritten. Settings still come
from the frozen live contract or explicit recipe settings. For the visual proof,
use explicit 2K/xhigh settings rather than assuming the provider's quality default.
This is a user preference, not a claim that multi-reference continuity is proven.

## Selection policy

1. Retrieve the live catalog and exact model contract before preparing work.
2. Exclude utilities without a prompt from the standard sheet/cut recipe path.
3. A recipe with references requires a model that declares image inputs.
4. Choose the model for the task only after inspecting its validated settings
   and the project's reference needs. Do not silently fall back to another model.
5. Preserve the reference order and write one instruction per reference stating
   what to preserve, borrow and exclude.
6. Unknown provider limits remain unknown. Reduce a reference recipe deliberately
   by creative priority; never silently trim it in the adapter.
7. Treat model quality, identity retention, edit obedience, location geography
   and style stability as empirical properties established by reviewed outputs.

## Benchmark before defaults

Use a small, explicitly approved benchmark rather than provider marketing:

- One character sheet testing whole-body front/side/back identity and wardrobe.
- One location sheet testing connected geography and useful planned viewpoints.
- One prop sheet testing shape, scale and important detail.
- One storyboard cut with character, location and prop references.
- One continuation/edit cut using an approved earlier cut plus identity/location
  references, with a precise change instruction.

Run only the models and settings displayed to the user with a total credit
estimate. Review every output manually. Store feedback and all takes. The result
can establish task-specific recommendations; it must not become an irreversible
global default.

## Initial candidates, not rankings

- Nano Banana Pro: existing integration candidate for multi-reference recipes.
- GPT Image 2.5: live schema supports references through `medias` and multiple
  quality/resolution choices; visual continuity remains untested in Strawberry.
- FLUX.2: live schema supports references and model variants; untested here.
- Seedream 5.0 Pro: live schema supports references and inpaint-related settings;
  untested here.
- Angles (`qwen_camera_control`): a promptless image utility, not a standard
  Strawberry generation recipe. It may later support approved derived views via
  a separate typed operation, but it must not be treated as a general model.
