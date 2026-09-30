# Viewer fixtures

One frozen dream's `ViewDream` (viewer/types.ts) and its mock-ups, for building the page against real data before the
data side is on lab. Made with the harness's profile on `viewer-data`:

    DREAMCHAT_WRITER=claude DREAMCHAT_RECORD=on DREAMCHAT_CUT_SHEET=on DREAMCHAT_CAMERA=on DREAMCHAT_REFS=on \
      DREAMCHAT_ONE_BUILDER=on bun run viewer/data.ts dream-0926-070314-0f40

Frozen copies keep no media, so every `file` is null here but the mock-ups'. Replace it once lab has the S6 stack
and the S5 anchor (orchard m3's mock-up appears then: it is an edit here).
