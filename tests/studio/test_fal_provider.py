import json

import httpx
import pytest

from backend.studio.models import Approval, NodeCreate, RecipeCreate
from backend.studio.providers import Fal, ProviderRejected, SubmissionUnknown
from backend.studio.service import Studio
from backend.studio.store import Store, StudioError
from backend.studio.worker import Worker

QUEUE = "https://queue.fal.run/"
RESULT = QUEUE + "fal-ai/nano-banana-pro/requests/req-1"


class FakeFal:
    """Records every request and answers like fal's queue and storage APIs."""

    def __init__(self, *, submit_status=200, status="COMPLETED", result_status=200, upload_status=200, cdn_status=200):
        self.calls = []
        self.submit_status, self.status, self.result_status, self.upload_status, self.cdn_status = (
            submit_status,
            status,
            result_status,
            upload_status,
            cdn_status,
        )

    def __call__(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        body = json.loads(request.content) if request.headers.get("content-type") == "application/json" else None
        self.calls.append((request.method, url, body))
        if url.startswith("https://rest.fal.ai/storage/auth/token"):
            if self.cdn_status >= 400:
                return httpx.Response(self.cdn_status, text="token refused")
            return httpx.Response(200, json={"token": "t", "token_type": "Bearer", "base_url": "x", "expires_at": "2099-01-01T00:00:00+00:00"})
        if url == "https://v3.fal.media/files/upload":
            n = sum(1 for c in self.calls if c[1] == url)
            return httpx.Response(200, json={"access_url": f"https://v3.fal.media/files/{n}.png"})
        if url.startswith("https://rest.fal.ai/storage/upload/initiate"):
            if self.upload_status >= 400:
                return httpx.Response(self.upload_status, text="storage down")
            n = sum(1 for c in self.calls if "initiate" in c[1])
            return httpx.Response(200, json={"upload_url": f"https://up.example/{n}", "file_url": f"https://cdn.example/{n}.png"})
        if url.startswith("https://up.example/"):
            return httpx.Response(200)
        if request.method == "POST" and url.startswith(QUEUE):
            if self.submit_status != 200:
                return httpx.Response(self.submit_status, text="refused")
            return httpx.Response(200, json={"request_id": "req-1", "response_url": RESULT, "status_url": RESULT + "/status"})
        if url == RESULT + "/status":
            return httpx.Response(200, json={"status": self.status})
        if url == RESULT:
            if self.result_status != 200:
                return httpx.Response(self.result_status, json={"detail": "content policy"})
            return httpx.Response(200, json={"images": [{"url": "https://v3.fal.media/files/out.png"}], "description": "ok"})
        return httpx.Response(404)


def fal(fake: FakeFal) -> Fal:
    return Fal(key="test-key", client=httpx.Client(transport=httpx.MockTransport(fake)))


def request(**over):
    return RecipeCreate(
        **{
            "node_id": "n",
            "provider": "fal",
            "model": "nano_banana_pro",
            "prompt": "a kitchen with a railway board",
            "intent": "test",
            **over,
        }
    )


def spec_for(provider, **over):
    prepared = provider.prepare(request(**over))
    return {"model": "nano_banana_pro", "prompt": "a kitchen with a railway board", **prepared}


def test_prepare_defaults_and_list_price():
    prepared = fal(FakeFal()).prepare(request())
    assert prepared["settings"] == {"aspect_ratio": "16:9", "resolution": "1K", "output_format": "png"}
    assert prepared["estimate"]["credits"] == 0.15 and prepared["estimate"]["unit"] == "usd"
    assert fal(FakeFal()).prepare(request(settings={"resolution": "4K"}))["estimate"]["credits"] == 0.30


@pytest.mark.parametrize(
    "over, code",
    [
        ({"settings": {"resolution": "8K"}}, "setting_invalid"),
        ({"settings": {"seed": 3}}, "setting_unknown"),
        ({"model": "something_else"}, "model_unknown"),
    ],
)
def test_prepare_refuses_what_is_not_verified(over, code):
    with pytest.raises(StudioError) as exc:
        fal(FakeFal()).prepare(request(**over))
    assert exc.value.code == code


def test_generate_without_references(tmp_path):
    fake = FakeFal()
    provider_id, receipt = fal(fake).submit("job", spec_for(fal(fake)), [])
    assert provider_id == RESULT
    post = [c for c in fake.calls if c[0] == "POST" and c[1].startswith(QUEUE)][0]
    assert post[1] == QUEUE + "fal-ai/nano-banana-pro"
    assert post[2]["num_images"] == 1 and "image_urls" not in post[2]
    assert receipt["request_id"] == "req-1"


def test_references_are_uploaded_then_sent_to_the_edit_model(tmp_path):
    fake = FakeFal()
    files = []
    for i in range(2):
        path = tmp_path / f"ref{i}.png"
        path.write_bytes(b"\x89PNG fake")
        files.append(path)
    fal(fake).submit("job", spec_for(fal(fake)), files)
    post = [c for c in fake.calls if c[0] == "POST" and c[1].startswith(QUEUE)][0]
    assert post[1] == QUEUE + "fal-ai/nano-banana-pro/edit"
    assert post[2]["image_urls"] == ["https://v3.fal.media/files/1.png", "https://v3.fal.media/files/2.png"]


def test_uploads_fall_back_to_the_storage_route_when_the_cdn_refuses(tmp_path):
    path = tmp_path / "ref.png"
    path.write_bytes(b"x")
    fake = FakeFal(cdn_status=500)
    fal(fake).submit("job", spec_for(fal(fake)), [path])
    post = [c for c in fake.calls if c[0] == "POST" and c[1].startswith(QUEUE)][0]
    assert post[2]["image_urls"] == ["https://cdn.example/1.png"]


def test_a_refusal_is_definitive_and_an_outage_needs_reconciling(tmp_path):
    with pytest.raises(ProviderRejected):
        fal(FakeFal(submit_status=422)).submit("job", spec_for(fal(FakeFal())), [])
    with pytest.raises(SubmissionUnknown):
        fal(FakeFal(submit_status=503)).submit("job", spec_for(fal(FakeFal())), [])


def test_a_failed_upload_costs_nothing_and_says_so(tmp_path):
    path = tmp_path / "ref.png"
    path.write_bytes(b"x")
    fake = FakeFal(upload_status=500, cdn_status=500)
    with pytest.raises(ProviderRejected, match="before submission"):
        fal(fake).submit("job", spec_for(fal(fake)), [path])
    assert not [c for c in fake.calls if c[0] == "POST" and c[1].startswith(QUEUE)]


def test_poll_reads_queue_states_and_results():
    assert fal(FakeFal(status="IN_QUEUE")).poll(RESULT)[0] == "running"
    state, outputs, _ = fal(FakeFal()).poll(RESULT)
    assert (state, outputs) == ("collecting", ["https://v3.fal.media/files/out.png"])
    state, outputs, receipt = fal(FakeFal(result_status=422)).poll(RESULT)
    assert (state, outputs) == ("failed", []) and receipt["error"]["detail"] == "content policy"


def test_poll_refuses_urls_outside_fals_queue():
    with pytest.raises(StudioError):
        fal(FakeFal()).poll("https://elsewhere.example/requests/1")


def queued_fal_job(studio):
    node = studio.create_node(NodeCreate(kind="project", name="fal"))
    recipe = studio.prepare(
        RecipeCreate(node_id=node["id"], provider="fal", model="nano_banana_pro", prompt="a board", intent="test")
    )
    assert recipe["spec"]["estimate"]["credits"] == 0.15
    studio.approve(recipe["id"], Approval(fingerprint=recipe["fingerprint"], user_decision="test", max_credits=0.2))
    return studio.enqueue(recipe["id"])


def test_worker_leaves_fal_jobs_alone_until_fal_is_switched_on(tmp_path):
    studio = Studio(Store(tmp_path / "ws"))
    job = queued_fal_job(studio)
    fake = FakeFal()
    assert not Worker(studio, {"fal": fal(fake)}).tick()
    assert Worker(studio, {"fal": fal(fake)}, allow_fal=True).tick()
    assert studio.job(job["id"])["state"] == "running"
    assert studio.job(job["id"])["provider_id"] == RESULT
