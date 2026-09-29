# S9 keys cross-machine diagnostic (temporary, 27-29 Sep 2026)

`bun test test/asdrawn.test.ts -t "S9 keys"` passes on Hiren's Mac (Bun 1.3.14, macOS 26.4, arm64) but fails in the
cloud sandbox (tried Bun 1.3.11 and 1.4.2), even at the commit that set the golden hashes — so it isn't a code
change. `hashOf` (lib.ts) is a pure integer hash over `stable()`'s text: no crypto, no floats, architecture-free.
So the mismatch has to be in the *content* of what gets hashed, not in how it's hashed.

`s9-raw-mac.json` is the pre-hash value for all six `(dream, switches)` combinations from `S9_RAW=1 bun test
test/asdrawn.test.ts -t "S9 keys"` on the Mac (the test now supports this flag, see test/asdrawn.test.ts). Run the
same on the machine that fails and diff the two files key by key; the first differing string is the cause.

This folder is a throwaway diagnostic, not part of the harness — delete it once the mismatch is found and fixed.
