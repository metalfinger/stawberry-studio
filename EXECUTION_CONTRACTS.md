# Execution and recovery contracts

Implemented and offline-verified. This complements `PRODUCTION_CONTRACTS.md` and is
not evidence that a paid generation has been tested.

- Workers publish a durable heartbeat, current job and enabled providers. A
  stale heartbeat is "not responding", not proof that a provider stopped work.
- A worker with Higgsfield submission disabled leaves paid queued jobs queued.
  It may still poll/collect an already-known remote job without submitting again.
- Heartbeats renew owned job leases while provider calls/downloads are blocked.
- Only queued jobs may be cancelled locally. Cancellation races are checked in
  the same transaction as job state changes. There is no remote cancellation
  claim for the installed CLI.
- Uncertain submissions require a preview of a user-supplied remote job ID.
  Verify remote ID/model/prompt/effective settings, compare reference counts and
  expose evidence. Linking requires the preview fingerprint, an explicit user
  decision and confirmation of reference identity (remote uploaded bytes cannot
  be cryptographically matched through the installed CLI). A remote job cannot
  be linked to two local jobs. Recovery polls/collects; it never calls create.
- Price estimates are provider credits, not dollars or proof of unlimited
  subscription use. Installed `generate cost` returns `credits` and can upload
  local reference files. Do not upload references merely to estimate. Requests
  with references therefore carry an unknown exact estimate plus a clearly
  separate settings-only hint. Unknown prices require explicit acknowledgement.
- An approved estimate ceiling is rechecked before submission, not a provider-
  enforced billing cap. No automatic retry when cost/schema/context changed.
- Keep original receipts/events and all partially collected media. Retry failed
  collection without regenerating any image.
- Download only public HTTPS destinations, pin the validated IP through the TLS
  connection, preserve certificate/hostname verification, check every redirect,
  bound bytes/time and clean partial temporary files.

Implementation references: Python's [HTTP client](https://docs.python.org/3/library/http.client.html)
and [TLS socket](https://docs.python.org/3/library/ssl.html#ssl.SSLContext.wrap_socket)
contracts. Installed Higgsfield CLI 0.1.28 help and read-only responses verified
2026-09-16: cost returned `{"credits":2}` for `nano_banana_2` (the installed
catalog labels this **Nano Banana Pro**, not Nano Banana 2); existing job detail
exposes `job_set_type`, `params.prompt`, input media, status and output URL.
No create/upload was executed for this inspection.

## Acceptance checklist

- [x] Worker health/capability visibility and disabled-queue preservation.
- [x] Long-call heartbeat/lease, concurrent ownership and cancellation tests.
- [x] Two-step reconciliation with mismatch/stale/duplicate-ID protection.
- [x] Explicit known/unknown cost approval and pre-submit estimate checks.
- [x] DNS-pinned collection, redirect/size/incomplete-output tests.
- [x] Viewer activity, job events and recovery controls implemented.
- [x] Full test/build/browser verification and documented commit.

Verified: 155 offline tests, frontend build, scoped Ruff/ESLint. Browser tests
covered worker status, persisted events, uncertain preview/link, collection to
ready, queued cancellation, and a 390px layout with no overflow. Known-cost
approval preview inspected without submitting. An isolated fake-provider UI test
verified unknown-cost approval stays disabled until acknowledged, then queues.
Real create/upload receipts still require the separately approved visual proof.
