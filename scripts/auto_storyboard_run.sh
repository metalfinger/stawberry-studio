#!/usr/bin/env bash
# Prepares the next approved storyboard cut for the Higgsfield connector while
# Strawberry remains the durable record for recipes, receipts and takes.
#
# The direct Higgsfield CLI is intentionally not the default transport: its
# local-reference upload path is known to fail upstream. The connected plugin
# accepts provider job IDs and must perform the paid submission.
set -euo pipefail

PROJECT_ID=${1:?usage: scripts/auto_storyboard_run.sh PROJECT_ID}
BASE_URL=${STRAWBERRY_URL:-http://127.0.0.1:8788}
PY=venv/bin/python

json_stdin() { printf '%s' "$1" | "$PY" -m backend.studio "$2" "$3" -; }

# Convert a completed take into an auto-approved continuity source. The caller
# explicitly opted into this mode; no image pixels are inspected here.
approve_take() {
  local cut_id=$1 media_id=$2
  local detail context revision depicted payload
  detail=$("$PY" -m backend.studio media "$media_id")
  context=$(jq -r '.review_context' <<<"$detail")
  revision=$(jq -r '.media.review.revision' <<<"$detail")
  depicted=$(sqlite3 .strawberry/production.sqlite "
    SELECT json_object(
      'location', json_extract(fields,'$.location_id.value'),
      'cast', coalesce(json_extract(fields,'$.visible_cast.value'),'[]'),
      'props', coalesce(json_extract(fields,'$.required_props.value'),'[]')
    ) FROM nodes WHERE id='$cut_id';")
  payload=$(jq -n --argjson rev "$revision" --arg ctx "$context" --argjson d "$depicted" '{
    expected_revision:$rev, expected_context:$ctx, status:"approved",
    user_decision:"User enabled auto-approval for the sequential storyboard run.",
    depicted_assets: (([$d.location] + $d.cast + $d.props) | map(select(. != null)) | unique)
  }')
  json_stdin "$payload" review "$media_id" >/dev/null
  local cut_rev
  cut_rev=$("$PY" -m backend.studio inspect "$cut_id" | jq -r '.node.revision')
  "$PY" -m backend.studio select "$cut_id" "$media_id" --revision "$cut_rev" >/dev/null
}

provider_id_for_media() {
  sqlite3 .strawberry/production.sqlite "
    SELECT j.provider_id FROM media m JOIN jobs j ON j.id=m.job_id WHERE m.id='$1';"
}

build_recipe() {
  local cut_id=$1 prev_id=$2 cut_json location cast props action refs prompt beat_lock
  cut_json=$(sqlite3 .strawberry/production.sqlite "
    SELECT json_object('location',json_extract(fields,'$.location_id.value'),
      'cast',coalesce(json_extract(fields,'$.visible_cast.value'),'[]'),
      'props',coalesce(json_extract(fields,'$.required_props.value'),'[]'),
      'action',json_extract(fields,'$.action.value')) FROM nodes WHERE id='$cut_id';")
  location=$(jq -r '.location // empty' <<<"$cut_json")
  cast=$(jq -c '.cast' <<<"$cut_json")
  props=$(jq -c '.props' <<<"$cut_json")
  action=$(jq -r '.action // "Advance the story."' <<<"$cut_json")
  refs='[]'
  if [[ -n "$prev_id" ]]; then
    local prev_media prev_subjects
    prev_media=$(sqlite3 .strawberry/production.sqlite "SELECT active_media_id FROM nodes WHERE id='$prev_id';")
    prev_subjects=$(sqlite3 .strawberry/production.sqlite "SELECT json_object('location',json_extract(fields,'$.location_id.value'),'cast',coalesce(json_extract(fields,'$.visible_cast.value'),'[]'),'props',coalesce(json_extract(fields,'$.required_props.value'),'[]')) FROM nodes WHERE id='$prev_id';")
    refs=$(jq --arg m "$prev_media" --argjson s "$prev_subjects" '. + [{media_id:$m,role:"base",instruction:"Preserve approved preceding-cut continuity; change only what this beat requires.",subjects:(([$s.location]+$s.cast+$s.props)|map(select(. != null))|unique)}]' <<<"$refs")
  fi
  for asset in "$location" $(jq -r '.[]' <<<"$cast") $(jq -r '.[]' <<<"$props"); do
    [[ -z "$asset" ]] && continue
    local media kind role instruction
    media=$(sqlite3 .strawberry/production.sqlite "SELECT active_media_id FROM nodes WHERE id='$asset';")
    kind=$(sqlite3 .strawberry/production.sqlite "SELECT kind FROM nodes WHERE id='$asset';")
    role=$([[ "$kind" == location ]] && echo location || ([[ "$kind" == character ]] && echo identity || echo prop))
    instruction="Preserve this approved $kind identity or geography; use it only as needed for this cut."
    refs=$(jq --arg m "$media" --arg role "$role" --arg instruction "$instruction" --arg asset "$asset" '. + [{media_id:$m,role:$role,instruction:$instruction,subjects:([$asset] | if $role=="identity" then . else [] end)}]' <<<"$refs")
  done
  # Later beats deliberately alter time, scale, or cast. State those changes
  # explicitly so the base image preserves continuity without erasing the dream
  # transformation that the cut calls for.
  beat_lock=""
  case "$cut_id" in
    e4f2a7a6-*) beat_lock="The auto must cross close in the foreground and briefly occlude Abhishek. Keep one Abhishek and one toddler only; reveal them continuing behind it." ;;
    5af0f0ed-*) beat_lock="Reveal the first pale stone arches and clock tower only through wind-blown branches; the school is distant, not yet the setting." ;;
    eacfe56e-*) beat_lock="Use the old-stone school geography. Make the evening-to-morning change feel like a single dream discontinuity, not a montage or split screen." ;;
    c94b4c28-*) beat_lock="Frame a single analogue clock face that clearly reads 9:00 AM. Do not generate readable words, extra clocks, or a digital display." ;;
    04082c0e-*) beat_lock="Hold Abhishek, the quiet toddler in the chest carrier, and the single 9:00 clock in one coherent composition." ;;
    464d94c8-*) beat_lock="Keep Abhishek in adult clothes with toddler and carrier present while he moves beneath the stone arches." ;;
    4b497485-*) beat_lock="Locked full-body threshold view: adult Abhishek, toddler on chest, carrier straps visible, stone doorway. This exact geometry is the before-state for the next cut." ;;
    d7cf1450-*) beat_lock="Close continuity detail: one quiet toddler against Abhishek's pale adult shirt, both carrier straps clearly visible. No school uniform yet." ;;
    3328ae91-*) beat_lock="Return to the locked full-body threshold geometry. Adult Abhishek crosses while toddler and carrier are still visibly present." ;;
    2a74fe5f-*) beat_lock="Matched-after transition: preserve Abhishek's pose and doorway geometry from the preceding cut, but he now wears a school uniform and his chest is empty. Toddler and carrier are absent." ;;
    2eb9c107-*) beat_lock="Keep the uniformed Abhishek at the entrance with an empty chest. Do not reintroduce toddler or carrier." ;;
    c63cdf2f-*) beat_lock="Keep the school physically believable but subtly oversized around the small uniformed Abhishek; no surreal creature or impossible new architecture." ;;
    9b78d8fd-*) beat_lock="Abhishek stays coherent and identity-readable while only clock geometry, arch edges, paper grain and registration drift slightly out of alignment." ;;
    c7010fc6-*) beat_lock="Let the school image fold and run out like damaged monochrome film. Abhishek is the last recognizable form before the image resolves to grey; one frame only, never a collage grid." ;;
  esac
  prompt=$(cat <<EOF
Create one finished 16:9 STORYBOARD FRAME for Nine O Clock. One cinematic image only; never a sheet, grid, contact sheet, multi-panel board, captioned image, or presentation.

Use the ordered references exactly by role. Preserve approved identities, geography, era, screen direction and the handmade monochrome charcoal-and-cut-paper language: graphite linework, torn matte-paper forms, visible fibres, faint paste seams, rubbed erasures, restrained smudging, imperfect registration, and no color accents.

STORY BEAT:
$action

CUT-SPECIFIC LOCK:
$beat_lock

FRAME:
Make this a distinct, purposeful storyboard composition for the stated beat. Maintain third-person dream perspective, approximately-1980s Bangalore, soft grey light, and an anxious but humane tone. Do not add unlisted characters, props, locations or story events.

CONTINUITY LOCKS:
No photorealism, glossy digital painting, readable text, logo, decorative border, panel division, captions, maps, newspapers, modern vehicles, duplicate characters, duplicate children, or duplicate props. Only introduce school imagery, school uniform, or the planned dream transformation when this cut explicitly calls for it.
EOF
)
  jq -n --arg node "$cut_id" --arg prompt "$prompt" --arg action "$action" --argjson refs "$refs" '{node_id:$node,provider:"higgsfield",model:"gpt_image_2_5",intent:$action,prompt:$prompt,settings:{aspect_ratio:"16:9",batch_size:1,model:"flare",quality:"xhigh",resolution:"2k"},references:$refs}'
}

# Ordered current-project cuts. Each next recipe sees the selected output of its
# immediate predecessor, while explicit assets add only the required locks.
CUTS=()
while IFS= read -r cut_id; do
  [[ -n "$cut_id" ]] && CUTS+=("$cut_id")
done < <(sqlite3 .strawberry/production.sqlite "SELECT c.id FROM nodes c JOIN nodes h ON c.parent_id=h.id JOIN nodes s ON h.parent_id=s.id WHERE c.project_id='$PROJECT_ID' AND c.kind='cut' ORDER BY s.position,h.position,c.position;")

for i in "${!CUTS[@]}"; do
  cut_id=${CUTS[$i]}
  inspect=$("$PY" -m backend.studio inspect "$cut_id")
  active=$(jq -r '.node.active_media_id // empty' <<<"$inspect")
  if [[ -n "$active" ]]; then continue; fi
  # A previous run may have collected a take before interruption. Promote that
  # exact existing output rather than creating a duplicate paid generation.
  pending_media=$(jq -r '.media | map(select(.review.status == "unreviewed")) | last | .id // empty' <<<"$inspect")
  if [[ -n "$pending_media" ]]; then
    approve_take "$cut_id" "$pending_media"
    continue
  fi
  prev_id=""
  if (( i > 0 )); then prev_id=${CUTS[$((i-1))]}; fi
  "$PY" -m backend.studio readiness "$cut_id" | jq -e '.ready' >/dev/null
  recipe=$(build_recipe "$cut_id" "$prev_id")
  prepared=$(printf '%s' "$recipe" | "$PY" -m backend.studio prepare -)
  recipe_id=$(jq -r '.id' <<<"$prepared")
  fingerprint=$(jq -r '.fingerprint' <<<"$prepared")
  approval=$(jq -n --arg f "$fingerprint" '{fingerprint:$f,user_decision:"User enabled auto-approval for the sequential storyboard run.",allow_unknown_cost:true}')
  printf '%s' "$approval" | "$PY" -m backend.studio approve "$recipe_id" - >/dev/null
  job=$("$PY" -m backend.studio enqueue "$recipe_id")
  job_id=$(jq -r '.id' <<<"$job")
  provider_medias='[]'
  while read -r media; do
    provider_media=$(provider_id_for_media "$media")
    [[ -n "$provider_media" ]] || { echo "Missing provider receipt for reference $media" >&2; exit 1; }
    provider_medias=$(jq --arg value "$provider_media" '. + [{role:"image",value:$value}]' <<<"$provider_medias")
  done < <(jq -r '.spec.references[].media_id' <<<"$prepared")
  # One deterministic handoff per invocation. The assistant submits this
  # payload through mcp__codex_apps__higgsfield_generate_image, then calls
  # finalize_connector_cut.sh with the returned provider job ID.
  jq -n --arg cut_id "$cut_id" --arg job_id "$job_id" --arg recipe_id "$recipe_id" --arg fingerprint "$fingerprint" \
    --arg prompt "$(jq -r '.spec.prompt' <<<"$prepared")" --argjson medias "$provider_medias" '{
      cut_id:$cut_id, local_job_id:$job_id, recipe_id:$recipe_id, fingerprint:$fingerprint,
      params:{model:"gpt_image_2_5",prompt:$prompt,aspect_ratio:"16:9",quality:"xhigh",resolution:"2k",variant:"flare",medias:$medias}
    }'
  exit 0
done
