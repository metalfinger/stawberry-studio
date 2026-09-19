#!/usr/bin/env bash
# Reconciles a completed Higgsfield connector job with its already-approved
# Strawberry recipe, then records the user's explicit sequential auto-approval.
set -euo pipefail

CUT_ID=${1:?usage: finalize_connector_cut.sh CUT_ID LOCAL_JOB_ID PROVIDER_JOB_ID}
LOCAL_JOB_ID=${2:?usage: finalize_connector_cut.sh CUT_ID LOCAL_JOB_ID PROVIDER_JOB_ID}
PROVIDER_JOB_ID=${3:?usage: finalize_connector_cut.sh CUT_ID LOCAL_JOB_ID PROVIDER_JOB_ID}
BASE_URL=${STRAWBERRY_URL:-http://127.0.0.1:8788}
PY=venv/bin/python

preview=$(curl -fsS "$BASE_URL/api/studio/jobs/$LOCAL_JOB_ID/external-submission?provider_id=$PROVIDER_JOB_ID")
fingerprint=$(jq -r '.fingerprint' <<<"$preview")
[[ -n "$fingerprint" && "$fingerprint" != "null" ]] || {
  echo "No reconciliable provider receipt for $PROVIDER_JOB_ID" >&2
  exit 1
}

jq -n --arg provider "$PROVIDER_JOB_ID" --arg fingerprint "$fingerprint" '{
  provider_id:$provider,
  fingerprint:$fingerprint,
  user_decision:"User enabled auto-approval for the sequential storyboard run.",
  confirm_reference_match:true
}' | curl -fsS -X POST "$BASE_URL/api/studio/jobs/$LOCAL_JOB_ID/external-submission" \
  -H 'Content-Type: application/json' -H 'X-Strawberry-Action: 1' --data-binary @- >/dev/null

for _ in 1 2 3 4 5 6 7 8; do
  "$PY" -m backend.studio worker --once --allow-higgsfield >/dev/null || true
  state=$("$PY" -m backend.studio job "$LOCAL_JOB_ID" | jq -r '.state')
  [[ "$state" == "ready" ]] && break
  sleep 2
done
[[ "${state:-}" == "ready" ]] || { echo "Collection did not reach ready state: ${state:-unknown}" >&2; exit 1; }

media_id=$("$PY" -m backend.studio inspect "$CUT_ID" | jq -r '.media[-1].id')
detail=$("$PY" -m backend.studio media "$media_id")
context=$(jq -r '.review_context' <<<"$detail")
review_revision=$(jq -r '.media.review.revision' <<<"$detail")
depicted=$(sqlite3 .strawberry/production.sqlite "
  SELECT json_object(
    'location', json_extract(fields,'$.location_id.value'),
    'cast', coalesce(json_extract(fields,'$.visible_cast.value'),'[]'),
    'props', coalesce(json_extract(fields,'$.required_props.value'),'[]')
  ) FROM nodes WHERE id='$CUT_ID';")
payload=$(jq -n --argjson revision "$review_revision" --arg context "$context" --argjson depicted "$depicted" '{
  expected_revision:$revision,
  expected_context:$context,
  status:"approved",
  user_decision:"User enabled auto-approval for the sequential storyboard run.",
  depicted_assets: (([$depicted.location] + $depicted.cast + $depicted.props) | map(select(. != null)) | unique)
}')
printf '%s' "$payload" | "$PY" -m backend.studio review "$media_id" - >/dev/null
node_revision=$("$PY" -m backend.studio inspect "$CUT_ID" | jq -r '.node.revision')
"$PY" -m backend.studio select "$CUT_ID" "$media_id" --revision "$node_revision" >/dev/null

printf '%s\n' "$media_id"
