"""Story 1 — The ice head (Stiles #047, 18 Mar 1898). Graph only; nothing generated."""
import json
from pathlib import Path
from backend.studio.models import FieldEdit, NodeCreate, NodePatch, SourceCreate
from backend.studio.service import Studio
from backend.studio.store import Store

HOME = Path("autoloop/store")
studio = Studio(Store(HOME))

def patch(node, reason, **fields):
    studio.patch_node(node["id"], NodePatch(
        expected_revision=studio.inspect(node["id"])["node"]["revision"], reason=reason,
        changes={k: v if isinstance(v, FieldEdit) else FieldEdit(value=v) for k, v in fields.items()}))
    return node

SOURCE = (
    "DreamBank, Stiles #047, 18 March 1898. Verbatim: talking to a young woman by the autoclave. "
    "She excuses herself, walks to the end of the room and returns 'with an irregular block of "
    "glittering ice set upon her shoulders in place of her head.' She stands before him, naturally, "
    "without speaking. The ice melts and trickles, channels form, angles round away — 'the "
    "sculpturing went on rapidly' — and it becomes 'a beautifully molded head of a horse; eyes, "
    "ears, and nostrils faithfully carved out in the clearest ice.'"
)

project = studio.create_node(NodeCreate(kind="project", name="The ice head", notes=(
    "Stiles #047, 18 March 1898, from DreamBank (UCSC, CC BY-NC-SA 4.0). A real dream report, not "
    "an adaptation. The turn is that the melting is not destruction but carving. No one reacts and "
    "nothing is explained; the report contains no alarm and the piece must not add any.")))
studio.capture(project["id"], SourceCreate(text=SOURCE, author="user", status="instruction"))

patch(project, "Style bible before the first review pass", **{
    "style": "woodblock relief print — flat black ink on warm paper, every edge carved, no gradients",
    "era": "1898, a university physiology laboratory",
    "aspect_ratio": "16:9",
    "target_duration_seconds": 40,
    "bible.tokens": [
        "flat black ink, no gradients anywhere",
        "hard carved edges, every contour gouged",
        "white highlights gouged out of the black",
        "visible woodblock grain across flat areas",
        "one cold spot ink, pale ice blue, printed separately",
        "coarse parallel gouge marks for tone, never smooth shading",
    ],
    "bible.palette_hex": ["#12100E", "#F2EFE6", "#A8C6D6", "#6E8C9C"],
    "bible.lighting_rules": (
        "Light is not rendered, it is the absence of ink. Highlights are gouged white shapes with "
        "hard edges. No cast shadows, no ambient gradient, no glow. Ice reads as white paper held "
        "inside black contour, with the pale blue ink used only where the ice is thickest."),
    "world_logic": (
        "The head is replaced, not removed — there is no wound, no blood and no gap. The melting is "
        "carving: it produces a form rather than destroying one. Nobody in the room reacts, the "
        "woman never speaks, and no explanation is offered or implied."),
    "negative_prompts": (
        "photorealism, soft shading, gradients, blur, depth of field, 3D rendering, airbrush, "
        "colour outside the declared palette, glow, lens flare, gore, horror, a visible wound or neck stump"),
    "policy.autonomous": True, "policy.min_take_score": 0.6, "policy.max_takes_per_cut": 2,
    "policy.credit_ceiling_per_take": 2.0, "policy.allow_unknown_cost": True,
    "policy.reference_depth_cap": 2,
})

woman = studio.create_node(NodeCreate(kind="character", name="The young woman", parent_id=project["id"], notes=(
    "The report gives her no name, no description and no reaction. Everything about her except the "
    "head is ordinary and must stay ordinary: 1898 laboratory dress, calm posture, hands at rest.")))
patch(woman, "Identity and the lock the whole dream turns on",
      identity="A young woman of the 1890s in a physiology laboratory, calm and unremarkable",
      appearance="slight build, upright posture, hands quiet at her sides",
      wardrobe="high-collared dark dress with plain cuffs, long sleeves, a laboratory apron",
      distinctive_features="no jewellery, no ornament, nothing to identify her but her clothes",
      consistency_tokens=["high-collared dark dress", "plain laboratory apron", "quiet hands"],
      locks=["head_state", "presence"])

dreamer = studio.create_node(NodeCreate(kind="character", name="The dreamer", parent_id=project["id"], notes=(
    "Percy Stiles, the observer. Seen from behind or at the frame edge only — the report is written "
    "from inside his eyes and he is never described.")))
patch(dreamer, "An observer, never a subject",
      identity="A young man of the 1890s, seen from behind or at the edge of frame, never facing camera",
      wardrobe="dark waistcoat, shirtsleeves rolled",
      consistency_tokens=["dark waistcoat", "seen from behind"], locks=["presence"])

lab = studio.create_node(NodeCreate(kind="location", name="The laboratory", parent_id=project["id"], notes=(
    "An 1898 physiology laboratory: tall windows, a long bench, glass and brass apparatus, a tiled "
    "or boarded floor. The room is quiet and ordinary and stays that way throughout.")))
patch(lab, "Geography that must survive between cuts",
      geography="a long room, tall windows down one side, a bench along the other, a door at the far end",
      materials="dark wood bench, white tile, glass and brass apparatus",
      landmarks="the autoclave on its stand, the tall windows, the far door",
      consistency_tokens=["tall laboratory windows", "long dark bench", "far door"])

autoclave = studio.create_node(NodeCreate(kind="prop", name="The autoclave", parent_id=project["id"], notes=(
    "An 1898 steam autoclave: a riveted cylindrical vessel on a stand, with a heavy hinged lid, a "
    "pressure gauge and a stopcock. The one fixed object the dream names.")))
patch(autoclave, "The object the report names",
      identity="a riveted cylindrical steam autoclave on an iron stand",
      materials="brass and riveted steel, a heavy hinged lid, a round pressure gauge",
      consistency_tokens=["riveted cylinder", "heavy hinged lid", "round pressure gauge"])

W, D, L, A = woman["id"], dreamer["id"], lab["id"], autoclave["id"]
ORDINARY = "her own head"
ICE = "an irregular block of glittering ice in place of her head"
HORSE = "a carved horse's head in clearest ice, eyes ears and nostrils faithful"

SCENES = [
  ("By the autoclave", {"sound.ambient": "a steam hiss from the autoclave, a clock, nothing else",
                        "mood": "ordinary, unhurried", "atmosphere": "still air, dust in the window light",
                        "lighting.source": "tall windows, flat daylight", "screen_direction": "neutral"}, [
    ("The room", [
      ("The laboratory", dict(
        visible_cast=[], required_props=[A], location_id=L, duration_seconds=4,
        action="The long laboratory, empty of people. Daylight from the tall windows falls across the bench and the autoclave on its stand.",
        **{"beat.purpose": "Establish an ordinary room so that nothing later can be blamed on the room",
           "beat.emotional_intent": "calm, almost dull", "beat.visual_point": "Every object is plain and carved in flat ink; the room has no atmosphere of its own",
           "beat.theme": "the dream is not set anywhere strange", "beat.type": "establish",
           "camera.framing": "wide", "camera.angle": "eye", "camera.movement": "locked",
           "sound.sfx": "steam hiss, a clock", "transition": "cut"})),
      ("Talking by the autoclave", dict(
        visible_cast=[W, D], required_props=[A], location_id=L, duration_seconds=4,
        action="The young woman stands by the autoclave talking to the dreamer, who is seen from behind at the frame edge. Her own head, her own face, entirely ordinary.",
        **{"beat.purpose": "Show her as she is, so the replacement has something to replace",
           "beat.emotional_intent": "easy, conversational", "beat.visual_point": "Her face is clearly her own — this is the only frame in which it is",
           "beat.theme": "ordinariness is the setup", "beat.type": "action",
           "performance.expression": "mid-sentence, unremarkable", "performance.body_language": "weight on one foot, hands quiet",
           "performance.gaze": "at the dreamer", "camera.framing": "medium", "camera.angle": "eye",
           "camera.movement": "locked", "sound.sfx": "steam hiss under the conversation", "transition": "cut",
           "continuity.after": {W: {"head_state": ORDINARY, "presence": "in the room"}}})),
      ("She excuses herself", dict(
        visible_cast=[W], required_props=[A], location_id=L, duration_seconds=3,
        action="She turns away from the dreamer and starts down the room, her back to camera.",
        **{"beat.purpose": "Let her leave frame under her own power so the change is not witnessed",
           "beat.emotional_intent": "unremarkable politeness", "beat.visual_point": "Her head is still hers as she turns away; the last time that is true",
           "beat.theme": "the dream hides its one event", "beat.type": "action",
           "performance.expression": "not visible, turning", "performance.body_language": "turning, first step away",
           "performance.gaze": "away down the room", "camera.framing": "medium wide", "camera.angle": "eye",
           "camera.movement": "locked", "screen_direction": "away", "sound.sfx": "footsteps on tile", "transition": "cut"})),
    ]),
  ]),
  ("The far end of the room", {"sound.ambient": "the steam hiss further off now", "mood": "waiting",
                               "lighting.source": "window light falling off toward the far door", "screen_direction": "away"}, [
    ("The walk", [
      ("At the far end", dict(
        visible_cast=[W], required_props=[], location_id=L, duration_seconds=3,
        action="She reaches the far end of the long room and is small in the frame, her back still to camera, at the far door.",
        **{"beat.purpose": "Put distance and a moment of not-seeing between the two states",
           "beat.emotional_intent": "nothing yet", "beat.visual_point": "She is far enough away that her head is a small dark shape and could be anything",
           "beat.theme": "the change happens where we cannot see it", "beat.type": "hold",
           "performance.expression": "not visible", "performance.body_language": "standing at the far door",
           "performance.gaze": "away", "camera.framing": "long wide", "camera.angle": "eye",
           "camera.movement": "locked", "screen_direction": "away", "sound.sfx": "the room's quiet", "transition": "cut"})),
      ("She returns", dict(
        visible_cast=[W], required_props=[], location_id=L, duration_seconds=4,
        action="She walks back toward camera. Where her head was there is now an irregular block of glittering ice, set on her shoulders. Her walk and her dress are exactly as before.",
        **{"beat.purpose": "The replacement, delivered without ceremony",
           "beat.emotional_intent": "no alarm; the dream offers none", "beat.visual_point": "The ice block is where the head is, at the same height, carried the same way — the body has not changed at all",
           "beat.theme": "replaced, not injured", "beat.type": "turn",
           "performance.expression": "none available", "performance.body_language": "the same unhurried walk as before",
           "performance.gaze": "none available", "camera.framing": "medium wide", "camera.angle": "eye",
           "camera.movement": "locked", "screen_direction": "toward", "sound.sfx": "footsteps returning", "transition": "cut",
           "continuity.before": {W: {"head_state": ORDINARY}},
           "continuity.after": {W: {"head_state": ICE, "presence": "in the room"}}})),
    ]),
  ]),
  ("She stands before him", {"sound.ambient": "very quiet; the steam hiss and nothing else", "mood": "patient, unexplained",
                             "lighting.source": "flat window light", "screen_direction": "neutral"}, [
    ("Standing", [
      ("Standing naturally", dict(
        visible_cast=[W], required_props=[], location_id=L, duration_seconds=4,
        action="She stands before the dreamer, full figure, ice block on her shoulders, hands quiet at her sides. She does not speak and does not move.",
        **{"beat.purpose": "Hold on the impossible thing being completely calm",
           "beat.emotional_intent": "the strangeness of no reaction", "beat.visual_point": "A woman standing ordinarily, with a rock of ice where her head should be, and nothing about her posture acknowledging it",
           "beat.theme": "the dream's refusal to explain", "beat.type": "hold",
           "performance.expression": "none available", "performance.body_language": "at rest, weight even, hands at her sides",
           "performance.gaze": "none available", "camera.framing": "full body", "camera.angle": "eye",
           "camera.movement": "locked", "sound.sfx": "silence, a single drip beginning", "transition": "cut"})),
      ("The block", dict(
        visible_cast=[W], required_props=[], location_id=L, duration_seconds=3,
        action="Close on the ice itself: an irregular faceted block, glittering, with no features of any kind, sitting on the high collar of her dress.",
        **{"beat.purpose": "Establish the ice as a material before it becomes a form",
           "beat.emotional_intent": "curiosity rather than fear", "beat.visual_point": "Irregular, faceted, unworked — this is a block, not a head, and it has no face",
           "beat.theme": "raw material", "beat.type": "insert",
           "camera.framing": "close", "camera.angle": "slightly low", "camera.movement": "locked",
           "sound.sfx": "the first drip", "transition": "cut"})),
    ]),
  ]),
  ("The sculpturing", {"sound.ambient": "water; trickling that grows steadier", "mood": "absorbed, almost tender",
                       "lighting.source": "flat window light through wet ice", "screen_direction": "neutral"}, [
    ("The carving", [
      ("The first channels", dict(
        visible_cast=[W], required_props=[], location_id=L, duration_seconds=4,
        action="Water begins to run off the block. Channels cut themselves into the surface and the first angles round away.",
        **{"beat.purpose": "Show melting behaving like a tool rather than like decay",
           "beat.emotional_intent": "attention sharpening", "beat.visual_point": "The channels are going somewhere — they are not random runnels but the beginning of a shape",
           "beat.theme": "the melting is carving", "beat.type": "turn",
           "camera.framing": "close", "camera.angle": "eye", "camera.movement": "locked",
           "sound.sfx": "trickling water", "transition": "cut",
           "continuity.before": {W: {"head_state": ICE}}})),
      ("Angles round away", dict(
        visible_cast=[W], required_props=[], location_id=L, duration_seconds=4,
        action="The sculpturing goes on rapidly. Planes fall away, a long form emerges, still unreadable as anything.",
        **{"beat.purpose": "Hold the moment where it is becoming something but is not yet",
           "beat.emotional_intent": "suspense without threat", "beat.visual_point": "A long muzzle-like mass exists before the viewer can name it",
           "beat.theme": "form arriving", "beat.type": "action",
           "camera.framing": "close", "camera.angle": "eye", "camera.movement": "locked",
           "sound.sfx": "steady running water", "transition": "cut"})),
      ("The horse's head", dict(
        visible_cast=[W], required_props=[], location_id=L, duration_seconds=5,
        action="The carving completes: a beautifully moulded head of a horse in the clearest ice, with eyes, ears and nostrils faithfully carved, set on the shoulders of the young woman in her high collar.",
        **{"beat.purpose": "Deliver the finished form, exactly as the report describes it",
           "beat.emotional_intent": "recognition; the report calls it beautiful and so must the frame",
           "beat.visual_point": "Eyes, ears and nostrils are all present and correct, and the ice is clear rather than glittering now",
           "beat.theme": "the melting made something", "beat.type": "reveal",
           "performance.body_language": "unchanged; she has not moved once", "camera.framing": "medium close",
           "camera.angle": "eye", "camera.movement": "locked", "sound.sfx": "the water slowing",
           "sound.music": "none — the report has no music in it", "transition": "cut",
           "continuity.after": {W: {"head_state": HORSE, "presence": "in the room"}}})),
      ("She stands, still", dict(
        visible_cast=[W], required_props=[A], location_id=L, duration_seconds=4,
        action="Wide again, the whole room: the woman standing exactly where she was, horse's head in ice on her shoulders, the autoclave beside her, the daylight unchanged.",
        **{"beat.purpose": "End where it began, with the room unchanged and nothing explained",
           "beat.emotional_intent": "calm, unresolved", "beat.visual_point": "The same wide frame as the opening, now with this in it, and nothing else different",
           "beat.theme": "no explanation is coming", "beat.type": "end",
           "performance.body_language": "unmoved since she returned", "camera.framing": "wide",
           "camera.angle": "eye", "camera.movement": "locked", "sound.sfx": "a last drip, then the steam hiss",
           "transition": "to black"})),
    ]),
  ]),
]

made = {}
for scene_name, scene_fields, shots in SCENES:
    scene = studio.create_node(NodeCreate(kind="scene", name=scene_name, parent_id=project["id"]))
    patch(scene, "Scene atmosphere and sound", **scene_fields)
    for shot_name, cuts in shots:
        shot = studio.create_node(NodeCreate(kind="shot", name=shot_name, parent_id=scene["id"]))
        for cut_name, fields in cuts:
            cut = studio.create_node(NodeCreate(kind="cut", name=cut_name, parent_id=shot["id"]))
            patch(cut, "Beat, performance, camera and sound from the report", **fields)
            made[cut_name] = cut["id"]

# the first and last frames are the same camera on the same room: declare it
studio.patch_node(made["She stands, still"], NodePatch(
    expected_revision=studio.inspect(made["She stands, still"])["node"]["revision"],
    reason="The closing wide is the opening wide, deliberately",
    changes={"match_frame": FieldEdit(value=made["The laboratory"])}))
# the carving chain: each stage continues from the one before
for earlier, later in (("She returns","Standing naturally"), ("Standing naturally","The block"),
                       ("The block","The first channels"), ("The first channels","Angles round away"),
                       ("Angles round away","The horse's head"), ("The horse's head","She stands, still")):
    studio.patch_node(made[later], NodePatch(
        expected_revision=studio.inspect(made[later])["node"]["revision"],
        reason="Story state flows along the carving",
        changes={"continuity_from": FieldEdit(value=[made[earlier]])}))

print(json.dumps({"project_id": project["id"], "cuts": len(made),
                  "assets": {"woman": W, "dreamer": D, "lab": L, "autoclave": A}}, indent=1))
