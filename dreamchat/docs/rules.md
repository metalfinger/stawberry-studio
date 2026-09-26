# Rule library: what two days of dreams taught, as general rules

From 201 commits, 289 incident comments, a person's verdicts on 122 pictures, the evals and a sibling storyboard harness (26 Sep 2026). Steps S3-S7 of HARNESS_PLAN.md turn these into code rules, Jev questions routed by tag, prompt patterns and reference choices. Status: M measured on real pictures, S seen in incidents, A assumed.

46 rules in 7 groups, then the contradictions. Sources: 201 commits, the 289 comments that cite a dated incident, your verdicts on 62 pictures from real runs and 60 pictures from the three-way test, the "about" notes in the evals, the sibling storyboard skill, the memory notes and the reassessment.

**Status:** M means measured on real pictures, with the count ("person" means the owner's own verdicts). S means seen in incidents, with how many (n). A means assumed: film grammar, or backed only by Jev's readings of text. **Hold as:** Code is a rule enforced in code (the story record or the planner). Jev[tag] is a typed Jev question, sent by the moment's tag. Prompt is a wording pattern. Ref is a rule for which images to attach.

**What the owner weighs.** The owner left 23 notes on the 26 pictures you did not rate right:
- place state: 5
- someone missing, or in the wrong place: 3
- held things: 3
- the camera did not turn, or the place changed: 3
- physics or composition: 3
- action or gaze: 2
- identity: 1
- a fact you told was changed: 1
- an absence drawn as a see-through person: 1
- vague: 1

None is about colour, breed, lettering or a lost glow. The owner rated 9 pictures right that had such faults. The library is ranked in that order.

### A. Film grammar and camera

| # | Rule | Evidence | Status | Hold as |
|---|---|---|---|---|
| A1 | Keep the 180° line: people keep their sides of the frame within a scene. | e6d0d3b (ice-head sides swapped); snow-train-2 m7 (blind judge) | S 2 | Code (left-to-right order per scene) + Jev[reverse] |
| A2 | A reverse angle turns the room: the far wall goes behind the camera, and window and door sides swap. Never keep the last background. | You, on snow-train m2, all three versions: "background is all the same… rotate the camera 180°… window on the right". lighthouse-fresh m2 edit: "the lighthouse should not be there". 97d2f9d. The mock-up version failed too. | M person 4 | Code states walls and sides from the floor plan; Ref: no edit across a reverse; Jev[reverse] |
| A3 | When the subject or action moves, the framing changes, and each moment looks visibly different from the last. Edit the same setup only within one continuing action. | You: library-1 m5 "the camera is moving, it should have shifted"; lighthouse-fresh m12. snow-train-2 m5 edit kept the same pose. Sibling B11. | M person 3 | Code (where a new shot starts) + Ref |
| A4 | Point of view: the dreamer is the camera, and at most their hands, arms or feet show. If the dreamer is there but is not the subject, show them over the shoulder, or they read as gone. | ce830a0. You: orchard m7 "legs should not be visible", orchard m2 "third person", lighthouse-fresh m10 dreamer drawn twice, lighthouse-fresh m13 "the dreamer is gone". Mock-up 0/3 on point-of-view moments. | M person 5 | Code (dreamer out of the cast and the images) + Jev[pov] |
| A5 | The subject, and whatever the words name, is in frame and big enough. Never frame it out. | 429b782, 944f2a9, 812d591; sibling: at least 15% of the frame | S 4 (proxy only) | Code (camera search) + Jev[close-up] |
| A6 | What is seen beyond the place stays off the floor plan and never comes inside. | c7a64ea. You on lighthouse-fresh m10: "why is the tractor inside that room?" In the three-way test the mock-up and sketches-only versions repeated it. | M person 3 | Code (tag: beyond) + Ref (no mock-up) |

### B. Continuity and state

| # | Rule | Evidence | Status | Hold as |
|---|---|---|---|---|
| B1 | What has changed stays changed, places included, until it changes again. State the action depends on comes first. | 1a736f3, ebc7a0e, c6a81a7. You: library-1 m3 and m5 wrong ("the water is gone"), 3 more partly. Blind judge: state is 21 of 47 faults. The lost glow in orchard m5-6 you rated right. | M person 5 | Code (state at each moment worked out from typed events) + Jev[place-state, change] |
| B2 | Nothing shows before its moment. Sketches and early pictures hold the state before the change. | 86e9bd9 (door already open), fc13fcc (boat already in the field's sketch), f14cd59 (Tomas a boy at m1) | S 3 | Code (a sketch is the base look) |
| B3 | How something looks where it is first shown is its look, not a change. Every change must differ from the base look. | 31ed426, e3c4ebf. 1cb0632: a seaweed in-between picture contradicted itself and every moment drawn from it was lost. 11 of 58 in-between pictures changed nothing. | S many; Jev 57/57 (text) | Code: refuse a change that changes nothing |
| B4 | A change replaces what it changes: a part replaces that part, a turning replaces the whole, and a turning stays whole. | 94da68c (her face inside the ice), d0d425d, 045117a, 0baf433, 7d69adc (Mr Hale drawn beside his own octopus) | S 5 | Code (kinds: becomes, part, place, holding, presence) + Ref (drop the old sketch) |
| B5 | Who is there is a recorded fact. They stay unless seen leaving, nobody appears without coming in, and everyone seen has an entry. | You: snow-train m3 "suddenly sitting on the chair", lighthouse-fresh m13. e0844db, e0b1ca3 (the whale) | M person 2, S 2 | Code (appears / leaves) + Jev[presence] |
| B6 | A held thing has one holder, changes hands on screen, and keeps its state (open or shut). | You: snow-train-2 m1 (the bag should be with grandpa), snow-train-2 m5 "should be shut" (2 versions), snow-train-2 m7, snow-train m4 (suitcase missing). 9318dc1; record.ts:519 | M person 5 | Code (holds / releases, prop state) + Jev[held] |
| B7 | One subject has one entry, one kind and one image. Nothing is drawn twice. | You: snow-train-2 m6 "two suitcases". 34b43a7 (two babies), 75971b0 (Mrs Okafor and the heron as two), 3ff7dfd (a couple drawn as one man), 1029b35 (the dog sketched as a person); sibling H | S 5, person 1 | Code (one name, typed kind) + Prompt "exactly one" |
| B8 | A place keeps its build and furniture from moment to moment. | You: snow-train-2 m2 "totally different frame". Blind judge: lighthouse-first m7, heron m4. | S 3 | Ref (the place's sketch for surfaces) + Jev[same place] |

### C. The image model's habits

| # | Rule | Evidence | Status | Hold as |
|---|---|---|---|---|
| C1 | It takes pose, layout and identity from every attached image, whatever the words say the image is for. | 3dffcc9 (an image attached for its light gave the pose), 9d81034 (picture 4's lunge copied), 97d2f9d, 045117a (a house through the walls); sibling 3/3 | S 4 | Ref: attach only what should be copied |
| C2 | It invents what is not said: sizes, distances, which way the room faces (a theater faces its screen), badges. | Theater m3 took 7 takes and was fixed by giving sizes in words (project_previs); 9159ee3; 8cb97fc. You: key "too big", suitcase "proportion super wrong", boat size, whale "photoshopped". | S 3, person 4 | Prompt: each subject's share of the frame + its size against a neighbour |
| C3 | Quoted words and names become lettering; hex colour codes become swatches. | c1c87c0 (KITCHEN), 3aca0e5 (ZIIKERY), ff66fa3 (COME ON), 59c96d7, 4c4fd07 | S 5 | Prompt (only the dream's own writing, with its letter count; colours by name) + lint |
| C4 | Naming a thing draws it, even when it is said to be gone or not there. | 8ef5b18 (the sea back on the horizon). You on orchard m7: "why the partial invisibility?" Sibling 3/3. | S 2, sibling | Prompt + lint |
| C5 | It copies a believable mock-up exactly: rows, bare mannequins, dry floors, walls. | heron m4. Three-way test: "completely naked" (heron), "a door inside the door" (snow-train m6), "the wall has become a city" (library-1 m5). Dry library floors. The reassessment's "it ignores an absurd one" has no traced source. | M person 4 | Ref (see D6) |
| C6 | Style words carry content, and a style that names no medium drifts. | e26d94c (cobbled hallway), f5dbf6f (droplets), 79e4080 (ice horse heads), 0ed73d2 (4 paid redraws), 1d1499b (photograph turned to ink at picture 5); sibling: saints 3/3 | S 6 | Code (a style is medium + technique, checked) |
| C7 | An edit keeps image 1's framing, state and flaws, and adds things rather than moving them. | 72f60f6, 1d1499b (a viewer's hands kept in every edit). Three-way test snow-train-2 m5 edit: suitcase still open. Sibling: 3/3 duplicates. | S 3, person 1 | Ref (edit only from the same camera setup) |

### D. References and in-between pictures (ghosts)

| # | Rule | Evidence | Status | Hold as |
|---|---|---|---|---|
| D1 | One image per subject: the approved sketch says who they are. Use the last picture only for someone with no sketch. | 9d81034; 0e5fd7b (a second image drew the hair wrong); 15 moments had two or more images of one subject | S 2 | Code; the recorded sources must equal the images actually sent |
| D2 | Attach only what should be copied. Each image's line says what it is (who and where, never its action), what to take, and "nothing else from it". No image for its light alone. | 3dffcc9, e26d94c, f665006; 40 of 131 moments still plan an image for light only | S 3; wording A | Ref + Prompt; delete the lighting role |
| D3 | A ghost only when one edit would carry several changes. One change per ghost, edited from the subject's previous look, and keyed by subject, kind and change. | Your rule; plan lines 450-452; sibling. 79e4080 moved to a ghost per change: 11 of 58 changed nothing, 10 of 28 paid were never used. 6077517: a ghost keyed by list position lost 3 moments. Its source is always empty (continuity.ts:614). | S (counts) | Code |
| D4 | A ghost says its change and what stays, never the look it replaces. A ghost of one part gives only that part. | 2fc8c5c (grandma's age and the paper city held), 9d81034, f665006 | S 3 | Prompt |
| D5 | A place's state has one carrier. A mock-up without the state beats the ghost that has it. | library-3 m2-m3 came out dry although both ghosts were right; all three library runs | M person, 3 runs | Ref |
| D6 | Choose image 1 by the kind of moment, from paired tests. No way wins overall; the mock-up is weak on point of view (0/3) and on another place (0/2). | 68ecd85: edit 11, mock-up 10, sketches alone 9 of 20. abe9e3a sent every camera through the mock-up after one success. | M n=20 | Ref: a routing table by moment tag |
| D7 | Sketches are identity in the base state: one subject, no pose, framing, props or story, nothing in front of the face; places empty of the story's things. | 7af2fed (drawn cooking at a stove 3 times, face behind glass), 159e220, fc13fcc, 8c8897d; sibling: props on sketches get drawn twice | S 5 | Code (sketch prompt) |

### E. Prompt writing

| # | Rule | Evidence | Status | Hold as |
|---|---|---|---|---|
| E1 | Each fact once, from one source. The image model gets only what the moment shows; planners get the whole tree. | Every look said twice (frames.ts:374-378 and 396-434); "mid-toned … green glass lamps" (library-3 m5); 5b32cf6; 77ea9d2; 17 fixes for conflicting lines | S 17 | Code (prompt built from the record; lint for duplicates) |
| E2 | The action as visible facts at one instant: who does what, with which hand, looking at what. | You: books should fly, "looking towards fish", "both looking at the camera", "doesn't look like a driver". Blind judge: action is 13 of 47 faults. 100af07 | M person 5 | Prompt + Jev[action] |
| E3 | Third person only: "the dreamer" or a name, never you, he, she or them. Say who alone is in the picture. | 48099ca (a viewer's hands), 7f74287 ("him" beside a woman), a89273c (a man appeared beside her) | S 3 | Code: only third-person text reaches fal |
| E4 | Plain positive words: no story roles ("the turn"), no "gone", no negation. A redraw says the state to make true. | 9d81034, 8ef5b18, 9dac166, 4b63cc3, a225fa7 | S 5 | Prompt + lint |
| E5 | Style is medium and technique, named every time. Colours by name. The dream's own colours are exceptions to the palette; in a one-colour style, guessed colours become light and dark. | 383ab03 (blue balloons drawn silver), b99086c (hair auburn 2/6), f815bb6 (boat pale 2/4), 797fa39, 1d1499b | S 5 | Code |
| E6 | Facing and camera are said once, in the camera line, as which view and which side of the frame. | 11658e3 (facing in the action clashed with the plan), 6c69cf2. Sibling Y06: view + side 4/4, "toward X" 0/3. | S 2, sibling | Prompt |

### F. Story facts and listening

| # | Rule | Evidence | Status | Hold as |
|---|---|---|---|---|
| F1 | Every clause records where it came from: said, confirmed, guessed or read from the story. Only code sets "said". | 40f755f: 127 of 239 findings are sketch words marked "said" that were never said. You on lighthouse-fresh m15, wrong: the boat should go "into the sea". | S; person 1 | Code |
| F2 | Ask the big gaps openly. Imagine the small ones once, store them as guessed, and show them in the sketch. A gap is big when the dreamer would reject the picture and it recurs, or when it is the key moment or the dream's strange thing. | Reassessment §7; b9cc59b (8 look questions in a row lost a person); 5b0a437. 6 of 11 identity faults are the dreamer's, whose words never give sex or face. | A | Jev (big or small) + Code (count recurrences) |
| F3 | Never lead. Ask on the dreamer's own words; one detail, then back to the story. | e196b77 ("did you go through it?" got "yeah"), bfac6fa, 4df52b9 (17 of 18 turns on details); only 43% of goal questions asked their goal | S 3 | Jev checks each reply against its planned move |
| F4 | Give an entry to everyone a moment shows, however far off or brief. Keep what a moment implies about a place. | e0b1ca3 (whale 3/3 vs 1/3), e0844db, c6a81a7 (water up to the window 3/3 vs 0/3) | S 3 (text, n=3) | Jev at breakdown + Code check before planning |
| F5 | How the dream is drawn is style, not story. A guessed look comes from before the dream's changes. | record.ts:1112 ("like a six-year-old" made the dreamer a child); 13b60b8 (adult 3/3 vs 1/3) | S 2 | Code + Jev |
| F6 | Approve only a picture Berry has named to the dreamer; never claim a picture that is not drawn. | cf9ce66 reversed e4a42a0; 776cd19; 5243916 (99 answers: 92% to 99%) | S; text labels | Code (one lifecycle for each picture) |

### G. Measuring

| # | Rule | Evidence | Status | Hold as |
|---|---|---|---|---|
| G1 | A check may hold, reword or redraw only if it predicts pictures (at least 0.7 on at least 60 labels). Otherwise it only logs. | The gate held pictures 22% right and passed pictures 26% right; the storyboard check scored 0.49-0.58, a coin toss (70ff05b); holds left 20 of 89 moments undrawn | M | Code (log only) |
| G2 | Judge against you, weighted as you weigh. | 6595822. Agreement with you on right vs not right: maker 39, blind judge 37, picture judge 42 of 62 (19 of 26 on runs it was not written from) | M | Judge rubric |
| G3 | Measure on real pictures from frozen transcripts: one variable at a time, blind, in balanced order. Fake pictures are for plan faults only. | eff356d, 8c9126f; 16 fixes after the blind result came from runs with fake pictures | A (method) | Benchmark |
| G4 | A Jev difference under about 0.11 is noise, and planners vary from run to run. Use margins and averages, and let code place typed relations. | dd26b79 (the same question asked again moves 0.06, up to 0.3); 13 wordings chosen on differences of 0.04-0.11; round room 4/6 then 0/6 | M (text) | Code |
| G5 | Takes vary more than ways of drawing do. Best of three is a safety net, not the harness. | 68ecd85: one of three right in 18 of 20; the judge's pick right 16/20 against about 10 for one take | M n=20 | A switch, off by default |
| G6 | Classify before fixing; at the third incident of a class, change the mechanism; incidents go in a ledger. | feedback_root_not_dream; sibling N (9 critique rounds); 104 fixes for one dream's case | S | Process |

### Contradictions and flags

1. **Ghosts.** 79e4080 (the code: a ghost per change) contradicts plan lines 450-452, your rule and the sibling (ghosts only when an edit carries several changes). The plan still states both rules.
2. **Whole tree vs each fact once.** feedback_tree_context gives every generation the whole tree. E1 resolves it: planners and checks get the tree, the image model gets only the moment.
3. **Point of view.** The sibling says a point of view should be over the shoulder. You accepted a true point of view with hands (orchard m2 sketches only; snow-train m6 sketches only and edit), but read a shot that left the dreamer out as the dreamer gone (lighthouse-fresh m13). A4 keeps both.
4. **Facing.** The sibling says to pin facing in words, but 11658e3 took it out of the action. E6 says it once, in the camera line.
5. **A1 needs A2.** A fixed left-to-right order plus a copied background is what gave the rotated grandpa.
6. **Choosing image 1.** Two rules are not supported. abe9e3a sends every new camera through the mock-up. project_continuity_core says never draw from sketches alone when an earlier picture holds the setup, yet sketches alone got 9/20 against 11/20 for edits. You also fault edits on reverse angles. Unresolved at n=20.
7. **The judge.** 4c59188 has the judge drive redraws, the plan says "the judge only informs", and you said the judge is "the second part". The measured best of three (16/20) fits your order as a switch.
8. **Low rank in your verdicts.** These are real rules, but your verdicts do not rank them highly; keep them below B1, B5, B6 and A2:
   - a close-up that frames the hands (1da880c; you rated lighthouse-fresh m2 right)
   - quoted speech painted as writing (lighthouse-fresh m3 right)
   - a change shown too early (orchard m1 right)
   - a decorative place state (orchard m5-6 right)
   - the animal's breed (lighthouse-fresh m3 right)
9. **Stale memory.** The MEMORY.md index line and project_prompt_writing's description still say "change wording only by gate-measured ablation". The note's body withdraws that rule.
10. **Data.** In paired-verdicts.json, the sketches-only version of lighthouse-first m7 carries orchard m7's note about Tomas, on a picture rated right. It is probably attached to the wrong row.
11. **Lens.** The blind judge shows no lens gradient (2/8 right under 22mm, 5/15 at 22-29mm, 4/20 at 30mm or more), and you have not checked it. Changing the lens is not a fix.
