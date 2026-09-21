"""Build a cut's prompt and its ordered references from the graph, and nothing else.

    PYTHONPATH=. venv/bin/python autoloop/cuts.py PROJECT_ID [CUT_ID ...]

Every line of the prompt is a rendering of something the production already declares, so a
prompt cannot drift from the story it belongs to and `recipe_gaps` cannot find an unquoted
lock or token. The host's creative work is writing the fields; this only says them out loud.
Anything the graph cannot hold has no business in a prompt.
"""
import json
import sys
import time
from pathlib import Path

from backend.studio.models import RecipeCreate, Reference
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError
from scripts.autopilot import approve_within_policy, drive_job

ROLE = {"character": "identity", "location": "location", "prop": "prop"}
# longest keys first: "medium close" must win over "close"
FRAMING = {
    "long wide": "The subject is small in a wide view; the space is most of the frame.",
    "medium wide": "The subject occupies about a third of the frame height, with the space around them clearly visible.",
    "medium close": "The subject fills roughly half the frame height; only a narrow band of background remains at the edges.",
    "full body": "The whole figure is in frame from head to feet, with a margin above and below.",
    "close": "The subject fills nearly the whole frame edge to edge; the background is a thin strip and little more.",
    "wide": "The whole space is in frame and the subject, if any, is small within it.",
    "medium": "The subject occupies about half the frame height.",
}
PERFORMANCE = ("expression", "body_language", "gaze", "gesture", "state")


def _lines(title, items, join=" "):
    items = [i.strip() for i in items if i and i.strip()]
    return [f"{title}: " + join.join(items)] if items else []


def build(studio, cut_id):
    """-> (prompt, [Reference], label). Derived; never hand-written."""
    node = studio.inspect(cut_id)["node"]
    values = studio.inspect(cut_id)["context"]["values"]
    with studio.store.connection() as conn:
        production = studio.rules.resolve(conn, cut_id)
        incoming = production["continuity"]["incoming"]
        conflicted = {c["key"] for c in production["continuity"].get("conflicts", [])}
        names = {a["id"]: a["name"] for a in production["assets"]}
        anchor = studio.store.one(conn, "nodes", node["project_id"])["active_media_id"]

    out, refs = [], []
    if anchor:
        refs.append(Reference(media_id=anchor, role="style",
                              instruction="the printing language only — copy no content or layout from it"))
    # A cut that declares where it continues from gets that cut's selected take as its base. This is
    # the one place a generated image is fed back in, and it is admission-controlled: the reference
    # deepens the lineage by one, so the depth cap decides whether a scene may chain at all. A scene
    # whose whole content is a single object transforming is the case that earns a deeper cap; a
    # scene that merely happens in order is not.
    # Which frame the visual continues is not always which frame the story continues. In a
    # transformation, every frame after the first should continue *that* one: chaining each onto
    # its predecessor deepens the lineage by one per cut and the form drifts a step at a time,
    # while chaining all of them onto the frame that established the form keeps them one step from
    # it. `base_from` says so; without it the story chain is used.
    for previous in values.get("base_from") or values.get("continuity_from") or []:
        with studio.store.connection() as conn:
            earlier = studio.store.one(conn, "nodes", previous)
        if earlier["active_media_id"]:
            refs.append(Reference(media_id=earlier["active_media_id"], role="base",
                                  instruction=f"the frame immediately before this one ('{earlier['name']}'): the same "
                                              "objects in the same places, seen a moment later. Continue it; do not "
                                              "restage it"))

    # A shot size is a word to a director and nothing at all to a generator: "close" came back
    # three times as a medium, and two beats declared one size apart came back as the same
    # picture. Say how much of the frame the subject is to occupy.
    framing = str(values.get("camera.framing") or "").strip()
    angle = str(values.get("camera.angle") or "").strip()
    fills = next((how for key, how in FRAMING.items() if key in framing.lower()), "")
    action = str(values.get("action") or "").strip() or node["notes"].strip()
    opening = f"A single storyboard frame, {framing}{', ' + angle if angle else ''}."
    if fills:
        opening += f" {fills}"
    # Where the camera is decides which faces of everything are visible, and a frame that gets it
    # wrong reads as composited rather than drawn. These fields were in the vocabulary and the
    # prompt was throwing them away.
    for field, label in (("camera.height", "Camera height"), ("camera.lens", "Lens"),
                         ("camera.movement", "Camera movement"), ("camera.depth_of_field", "Depth")):
        if str(values.get(field) or "").strip():
            opening += f" {label}: {str(values[field]).strip().rstrip('.')}."
    out.append(f"{opening} {action}")

    out += _lines("PERFORMANCE", [str(values.get(f"performance.{p}") or "") for p in PERFORMANCE], join="; ")

    states = []
    for key, candidates in incoming.items():
        if key in conflicted or not candidates:
            continue
        fact = candidates[0]
        if fact["asset_id"] not in {a["id"] for a in production["assets"]}:
            continue
        states.append(f"{names.get(fact['asset_id'], fact['asset_id'])}'s "
                      f"{fact['attribute'].replace('_', ' ')} is {fact['value']}.")
    out += _lines("STATE AT THIS MOMENT", states)

    for asset in production["assets"]:
        ctx = asset["context"]["values"]
        bits = [str(ctx.get("identity") or "").strip()]
        for field in ("wardrobe", "distinctive_features", "materials"):
            if str(ctx.get(field) or "").strip():
                bits.append(str(ctx[field]).strip())
        # every lock quoted verbatim: recipe_gaps checks for exactly these strings
        locks = ctx.get("consistency_tokens") or []
        if locks:
            bits.append("Unchanging: " + ", ".join(f'"{t}"' for t in locks) + ".")
        out.append(f"{asset['name']} ({asset['kind']}): " + "; ".join(b.strip().rstrip(".") for b in bits if b) + ".")
        media = asset.get("selection") or {}
        # A sheet shows a place along one axis. A cut staged across that axis has nothing holding
        # its walls in place, and the room comes back rearranged. When the cut names a view, use
        # the media that covers it instead of the primary sheet.
        wanted = values.get("location_view") if asset["kind"] == "location" else None
        if wanted:
            covering = [r for r in studio.inspect(asset["id"])["requirements"]
                        if r["kind"] == "view" and r["label"] == wanted and r.get("covered_by")]
            if not covering:
                raise ValueError(f"{node['name']}: no approved view labelled {wanted!r} for {asset['name']}")
            media = {"media_id": covering[0]["covered_by"][-1]}
        if ctx.get("reference_mode") != "text" and media.get("media_id"):
            instruction = f"{asset['name']}: this exact {asset['kind']}, unchanged"
            if wanted:
                instruction = f"{asset['name']} seen '{wanted}': this exact room from this angle"
            if asset["kind"] == "location":
                # the commonest location failure is not a wrong room but a mirrored one
                instruction += (". The camera stands inside this room: keep its walls, windows, benches and "
                                "doors on the sides the reference puts them. Do not mirror, rearrange or "
                                "duplicate them")
            refs.append(Reference(media_id=media["media_id"], role=ROLE[asset["kind"]], instruction=instruction))

    tokens = values.get("bible.tokens") or []
    style = [str(values.get("style") or "").strip()] + [f"{t}." for t in tokens]
    palette = values.get("bible.palette_hex") or []
    if palette:
        style.append("Palette strictly " + ", ".join(palette) + " and no fifth colour.")
    if str(values.get("bible.lighting_rules") or "").strip():
        style.append(str(values["bible.lighting_rules"]).strip())
    # the material/palette contradiction, said once, where the generator will read it
    if palette:
        style.append("Every material is depicted in those inks and never printed in its own colour.")
    out += _lines("STYLE", style)

    if str(values.get("world_logic") or "").strip():
        out += _lines("WORLD LOGIC", [str(values["world_logic"]).strip()])
    if str(values.get("negative_prompts") or "").strip():
        out += _lines("NONE OF THIS", [str(values["negative_prompts"]).strip(), "No text, no labels, no captions."])
    return "\n\n".join(out), refs, f"cut: {node['name']}"


def run(project_id, cut_ids):
    studio = Studio(Store(Path("autoloop/store")))
    pol = studio.workflow(project_id)["policy"]
    out, log = {}, []
    for cut_id in cut_ids:
        prompt, refs, label = build(studio, cut_id)
        try:
            recipe = studio.prepare(RecipeCreate(node_id=cut_id, provider="higgsfield", model="gpt_image_2_5",
                                                 intent=label, prompt=prompt, references=refs,
                                                 settings={"aspect_ratio": "16:9"}))
        except StudioError as e:
            print(f"REFUSED {label}: {str(e)[:220]}")
            log.append({"label": label, "refused": str(e)[:220]})
            continue
        if recipe["warnings"]:
            print(f"  warn {label}: {[w['code'] for w in recipe['warnings']]}")
        job = approve_within_policy(studio, recipe, pol, log)
        if not job:
            print(f"SKIPPED {label}: outside policy")
            continue
        state = drive_job(studio, job["id"], 90, sleep=lambda s: time.sleep(5))
        if state != "ready":
            err = (studio.job(job["id"]).get("error") or "")[:180]
            print(f"FAILED  {label}: {state} {err}")
            log.append({"label": label, "job_state": state, "error": err})
            continue
        with studio.store.connection() as conn:
            row = conn.execute("SELECT id FROM media WHERE job_id=? ORDER BY created_at DESC LIMIT 1",
                               (job["id"],)).fetchone()
        out[cut_id] = row["id"]
        print(f"READY   {label}  media {row['id'][:8]}")
    Path("autoloop/scratch/cuts_out.json").write_text(json.dumps({"media": out, "log": log}, indent=1))
    return out


if __name__ == "__main__":
    project = sys.argv[1]
    ids = sys.argv[2:]
    if not ids:
        ids = [c["node_id"] for c in Studio(Store(Path("autoloop/store"))).workflow(project)["cuts"]
               if c["ready_to_prepare"]]
    print(json.dumps(run(project, ids), indent=1))
