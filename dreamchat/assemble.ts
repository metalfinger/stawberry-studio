// A cut's prompt and images, assembled from its cut sheet (cutsheet.ts) and nothing else: the sheet is
// its only input, and everything it reads is a named field of it. Word for word what framePrompt
// (frames.ts) writes today, with today's choice of images: which picture is image 1, which sketches go
// in, which earlier pictures follow, and what each is for. Changing a word here is a change to the
// prompts, measured like any other (HARNESS_PLAN.md, S6).
//
// The prompt opens with the shot, then a manifest: each attached image, numbered, with exactly what to
// take from it and nothing else. An edit base goes first (image 1 is the picture to change), or the
// mock-up where there is none, then the sketches of who and what is in view, then in-between pictures,
// then earlier moments while there is room.
import { sayTurn } from './camera';
import type { CutSheet, SheetEarlier, SheetElement } from './cutsheet';
import { aNoun, FRAMING, MAX_IMAGES, NOTHING_ELSE, SHAPE_WORDS, samePlaceLine, sentence, writingLine } from './frames';
import { sayNow } from './record';
import { styleBlock } from './sheets';

/** An image as attached: what it is, its role, what to take from it, and where on the sheet it comes from. */
export type AssembledRef = {
  image: string;
  role: 'identity' | 'location' | 'prop' | 'base' | 'composition';
  instruction: string;
  /** The edit base, the mock-up, a sketch, an in-between picture or an earlier moment. */
  source: 'edit' | 'mockup' | 'sketch' | 'ghost' | 'earlier';
  /** Whose sketch, or which picture. */
  of: string;
  /** Whom it is attached to say how they look: a sketch's own subject, an in-between picture's, or who someone is. */
  subjects: string[];
};

/** One paragraph of the prompt, named, with the sheet fields it says. */
export type AssembledLine = { id: string; text: string; fields: string[] };

export type Assembled = {
  prompt: string;
  references: AssembledRef[];
  lines: AssembledLine[];
  /** The production nodes of what it shows, for the picture's record. */
  depicted: string[];
};

/** Where the line that says who "you" is goes, when anything told to the picture says "you". */
const YOU = 'you';

/** A cut's prompt, its images in the order attached, and its paragraphs by name, from its sheet alone. */
export function assembleCut(s: CutSheet): Assembled {
  const cam = s.camera;
  const name = (id: string) => s.names[id] ?? id;
  const seenHere = s.inView.filter((e) => e.kind === 'character').map((e) => e.id);
  const usable = s.earlier;
  const base = usable.find((x) => x.role === 'base');
  const roomFromCut = usable.some(
    (x) => x.kind === 'cut' && (x.relation === 'same_setup' || x.relation === 'same_side'),
  );
  const viewGhost = usable.find((x) => x.ghost?.kind === 'view');

  const references: AssembledRef[] = [];
  const manifest: string[] = [];
  const depicted: string[] = [];
  const attach = (ref: Omit<AssembledRef, 'instruction'> & { instruction: string }, line: string) => {
    references.push(ref);
    manifest.push(`Image ${references.length}: ${line}`);
  };
  // Each clause of an image's "Except", by the one it is about and the part it names, so that with each state said
  // once (S6 row 16) the whole clause, and only it, can point to that part's in-between picture.
  type Change = { what: string; now: string; part?: string };
  const excepts: { line: number; of: string; what: string; now: string; head: string }[] = [];
  // Every state an image's line says outright or points to, by the one and the part it is about: with each state
  // said once, "How each one is at this moment" leaves out these and only these.
  const written: { of: string; what: string; part?: string; now: string }[] = [];
  const noteExcepts = (of: string, changes: Change[], head: (st: Change) => string) => {
    for (const st of changes) {
      excepts.push({ line: manifest.length - 1, of, what: st.what, now: st.now, head: head(st) });
      written.push({ of, what: st.what, part: st.part, now: st.now });
    }
  };
  const pictureNo = (x: SheetEarlier) => (x.frame ? `picture ${x.frame.order}` : 'an in-between reference');
  // Across a jump, only who is in both pictures keeps their place.
  const keepAcross = (x: SheetEarlier) => {
    const shared = (x.frame?.visible ?? []).filter((id) => s.visible.includes(id));
    const names = shared.map(name);
    return names.length
      ? `Keep its framing and where ${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} exactly; no one else from it`
      : 'Keep its framing exactly; none of the people in it';
  };
  // What the judge found invented in an earlier picture stays out of this one.
  const strays = (x: SheetEarlier) => {
    const found = s.take.strays[x.id] ?? [];
    return found.length ? ` Leave out what it shows that is not in the dream: ${found.join('; ')}.` : '';
  };

  // Who leaves the picture being edited, and who joins it.
  const baseWho = base?.frame?.visible ?? [];
  const leaving = baseWho.filter((id) => !s.visible.includes(id)).map(name);
  const joining = base ? s.visible.filter((id) => !baseWho.includes(id)).map(name) : [];
  if (base)
    attach(
      {
        image: base.image,
        role: 'base',
        instruction: 'the same view a moment earlier: edit it into this moment',
        source: 'edit',
        of: base.id,
        subjects: [],
      },
      leaving.length || joining.length
        ? `EDIT THIS PICTURE. It is ${pictureNo(base)}, the same view a moment earlier. Keep its camera, framing, room and light exactly; who is in it changes: ${[
            ...(leaving.length
              ? [`${leaving.join(' and ')} ${leaving.length > 1 ? 'are' : 'is'} no longer there`]
              : []),
            ...(joining.length
              ? [`${joining.join(' and ')} ${joining.length > 1 ? 'are' : 'is'} there now, drawn from their sketch`]
              : []),
          ].join('; ')}. Change only that and what this moment changes.${strays(base)}`
        : `EDIT THIS PICTURE. It is ${pictureNo(base)}, the same view a moment earlier. Keep its camera, framing, room, light and everyone in it exactly as they are, faces and clothes included; change only what this moment changes.${strays(base)}`,
    );

  // The mock-up is the picture made real, where there is no other picture to edit, on every cut that has one
  // (with S5's references the sheet's choice, refs.ts chooseRefs, which is the same).
  const mockUp = !base && cam.previs && (!s.refs || s.refs.first === 'mockup') ? cam.previs : undefined;
  if (mockUp)
    attach(
      {
        image: mockUp,
        role: 'base',
        instruction:
          'the previs of this exact picture, from its camera: make it real, keeping where everyone and everything is and how big',
        source: 'mockup',
        of: s.id,
        subjects: [],
      },
      "EDIT THIS PICTURE. It is a rough grey mock-up of this exact picture, rendered from the floor plan of the place through this very camera: make it real. Every labelled grey shape becomes the person or thing its label names, exactly where it is and exactly as big, looking as their own images below show; the unlabelled shapes under people become what they sit on, and the plain grey surfaces the walls, floor and ceiling of the place. Keep the camera, the framing and where everything is exactly; keep nothing of the mock-up's look: no grey clay, no outlines, no labels or letters.",
    );

  const facts: string[] = [];
  // In one colour, a sketch drawn with a colour of its own passes it on; what the dream itself gives a
  // colour keeps it, in its image's words too.
  // With each colour said once (S6 row 15), in one colour the style's list is the one list, and an image's line
  // points to it: the style keeping the boat yellow is what kept it from coming out white (library-3 m5).
  const shadesOf = (e: SheetElement) => {
    if (!s.style.oneColour) return '';
    if (!e.colours.length) return ", drawn in this picture's shades of one colour";
    // The pointer only where the style has a Colours line to point to.
    return s.once?.colour && s.style.option.palette_hex.length
      ? ", drawn in this picture's shades of one colour except what the dream itself gives a colour (listed under Colours), which keeps it exactly"
      : `, drawn in this picture's shades of one colour except what the dream itself gives a colour, which keeps it exactly: ${e.colours.join('; ')}`;
  };
  // Where each sketch went, so a group and someone in it who has their own sketch are one and the same.
  const imageOf = new Map<string, number>();
  const inBase = (e: SheetElement) => !!base && baseWho.includes(e.id);
  // With the camera rules: who and what is only out past the place is far off, never inside it.
  const outside = (e: SheetElement) =>
    s.rules?.outside[e.id] ? ` It is out past ${name(s.place)}, seen far off, never inside it.` : '';
  // With S5's references, the in-between pictures that are someone's one image, attached in their place.
  const asStage = new Set<string>();
  for (const e of s.inView) {
    if (e.nodeId) depicted.push(e.nodeId);
    const look = e.look;
    // Its one image, where it is an in-between picture: what that shows, and the changes it does not.
    const stageId = e.turned === null ? s.refs?.stage[e.id] : undefined;
    const stage = stageId ? usable.find((x) => x.id === stageId && x.kind === 'ghost') : undefined;
    if (stage) asStage.add(stage.id);
    // What that picture shows, each thing once as its latest change left it; where this moment has a thing
    // newer than the picture, the newer is said, as an exception to the picture, never both as now.
    const thing = (w: string) => w.toLowerCase().trim();
    const latest = new Map<string, { what: string; now: string }>();
    for (const x of stage?.ghost ? (stage.ghost.shows ?? (stage.ghost.state ? [stage.ghost.state] : [])) : []) {
      latest.delete(thing(x.what));
      latest.set(thing(x.what), { what: x.what, now: x.now });
    }
    const shown = [...latest.values()].filter(
      (x) => !e.changes.some((st) => thing(st.what) === thing(x.what) && st.now !== x.now),
    );
    const changes = e.changes.filter((st) => !shown.some((x) => thing(x.what) === thing(st.what)));
    const said = (x: { what: string; now: string }) =>
      thing(x.now).startsWith(thing(x.what)) ? x.now : `${x.what}: ${x.now}`;
    const nowIs = shown.length ? shown.map(said).join('; ') : '';
    const image = stage?.image ?? e.image;
    // Everything in view is listed, with its look where no image's line says it: with the look said once (S6
    // row 14), one with an image of its own is named here and its look said in that image's line alone.
    const sayLook = !(s.once?.look && image);
    facts.push(
      (e.turned !== null
        ? `${e.name} (${e.said}): it has turned into ${aNoun(e.turned)}.`
        : `${e.name} (${e.said})${look && sayLook ? `: ${look}` : ''}.`) + outside(e),
    );
    // Someone or something turned into something else entirely is drawn from its in-between picture,
    // never its old sketch.
    if (!image || e.turned !== null) continue;
    for (const x of shown) written.push({ of: e.id, what: x.what, now: x.now });
    // Where the one image is an in-between picture, it is said as that: how it is now, as it shows it.
    const from = stage
      ? { source: 'ghost' as const, of: stage.id, subjects: [stage.ghost?.of ?? e.id] }
      : { source: 'sketch' as const, of: e.id, subjects: [e.id] };
    if (e.kind === 'character') {
      const animal = e.said === 'animal';
      // A change that replaces part of them overrides their sketch for that part.
      const head = (st: Change) => `their ${st.what}, which is no longer theirs: it is now `;
      const except = changes.length
        ? ` Except ${changes.map((st) => `${head(st)}${st.now}, with nothing of the old ${st.what} inside or behind it`).join('; ')}.`
        : '';
      const now = nowIs ? `, as ${animal ? 'it is' : 'they are'} now (${nowIs})` : '';
      const shows = stage && !inBase(e) ? `, as this picture shows ${animal ? 'it' : 'them'}` : '';
      attach(
        {
          image,
          role: 'identity',
          instruction: animal
            ? `${e.name}: this exact animal, the same kind, size, build, coat and markings${now}`
            : `${e.name}: this exact person, with the same face, build and clothes${now}`,
          ...from,
        },
        animal
          ? `what ${e.name} is${look ? ` (${look})` : ''}${now}: its kind, its size, its build, its coat and its markings, exactly${shows}${inBase(e) ? ', as Image 1 already shows it' : ''}${shadesOf(e)}. Nothing else from it: not its pose, background or framing.${except}${outside(e)}`
          : `who ${e.name} ${e.group ? 'are' : 'is'}${look ? ` (${look})` : ''}${now}: their ${changes.some((st) => /head|face/i.test(st.what)) ? 'build and clothes' : 'face, hair, build and clothes'}, exactly${shows}${inBase(e) ? ', as Image 1 already shows them' : ''}${shadesOf(e)}. Nothing else from it: not its pose, background or framing.${except}${outside(e)}`,
      );
      noteExcepts(e.id, changes, head);
      imageOf.set(e.id, references.length);
    } else if (e.kind === 'location') {
      // An edit base or an earlier picture of this side sets where things stand; a view ghost shows the
      // side this frame faces; with a mock-up, where everything stands comes from it alone. With S5's
      // references, a view worked out on the floor plan says where things stand where no mock-up does.
      const layout = cam.sheetLayout && !roomFromCut && !base && !viewGhost && !mockUp && !(s.refs && cam.view);
      const plain = `${e.name}${look ? ` (${look})` : ''}`;
      const called = `${plain}${nowIs ? `, as it is now (${nowIs})` : ''}`;
      // Its one image an in-between picture of its state, where only its materials are taken from it: its state
      // is taken too, said outright (a mock-up without the water beat the in-between picture that had it:
      // the library runs, rules.md D5), and what has changed since is said as no longer so.
      const state = shown.length
        ? `, and its ${shown.map((x) => x.what).join(' and ')} exactly as in this picture (${nowIs})`
        : '';
      const head = (st: Change) => `${st.what}, which is no longer as it shows: it is now `;
      const since =
        stage && changes.length ? ` Except its ${changes.map((st) => `${head(st)}${st.now}`).join('; ')}.` : '';
      attach(
        {
          image,
          role: 'location',
          instruction: layout
            ? `${e.name}: this exact place. Keep everything in it on the sides the reference puts it; do not mirror or rearrange it`
            : `${e.name}: its materials, colours and objects only; the layout comes from ${mockUp ? 'the previs' : base ? 'the picture being edited' : 'the earlier picture'}`,
          ...from,
        },
        (layout
          ? `${called}: the camera stands in this place. Keep everything in it where it puts it (walls, doors, paths, furniture, whatever it has), and its light; do not mirror or rearrange it.`
          : (base || (roomFromCut && !(s.refs && cam.view))) && !mockUp
            ? `${state ? plain : called}: only its materials, colours and objects${state}; where things stand comes from ${base ? 'Image 1' : 'the earlier picture of this place'}.`
            : cam.view || mockUp
              ? `${state ? plain : called}: only what it is made of and its colours (its ground or floor, its walls or buildings, what stands in it)${state}. Where everything stands, and which way the picture looks, come from ${mockUp ? 'Image 1, the mock-up' : 'the shot above'}, not from this image; any of its objects the shot has outside the picture stay out of it.`
              : `${state ? plain : called}: only its materials, colours, objects and light${state}. It shows the place from another side: this frame faces ${cam.looksAt || 'the other way'}.`) +
          since,
      );
      if (since) noteExcepts(e.id, changes, head);
    } else {
      // A part of it that has changed is no longer as its sketch shows, as for a person: each by the part
      // it names, or the whole of it.
      const byPart = changes.some((st) => st.part !== undefined);
      const head = (st: Change) =>
        `${byPart ? (st.part === '' ? 'the whole of it' : `its ${st.part ?? st.what}`) : st.what}, which is no longer as it shows: it is now `;
      const except = !changes.length
        ? ''
        : ` Except ${byPart ? '' : 'its '}${changes.map((st) => `${head(st)}${st.now}`).join('; ')}.`;
      attach(
        {
          image,
          role: 'prop',
          instruction: `${e.name}: this exact object, with the same shape and materials${nowIs ? `, as it is now (${nowIs})` : ''}`,
          ...from,
        },
        nowIs
          ? `${e.name}${look ? ` (${look})` : ''}, as it is now (${nowIs}): its exact shape, materials and colours, as this picture shows it${shadesOf(e)}. Nothing else from it.${except}${outside(e)}`
          : `${e.name}${look ? ` (${look})` : ''}: its exact shape, materials and colours, the same in every picture${shadesOf(e)}. Nothing else from it.${except}${outside(e)}`,
      );
      noteExcepts(e.id, changes, head);
    }
  }

  const element = (id: string) => s.inView.find((e) => e.id === id);
  for (const m of s.members) {
    const g = imageOf.get(m.group);
    const i = imageOf.get(m.member);
    if (!g || !i) continue;
    manifest[g - 1] += ` The ${m.word} in it is ${name(m.member)}, drawn from Image ${i}: one ${m.word}, never two.`;
    manifest[i - 1] +=
      ` They are the ${m.word} in ${name(m.group)}'s picture (Image ${g}): one and the same, drawn as this image shows.`;
  }

  // An earlier picture is named by who and where it is, never by what happens in it.
  const whoWhere = (x: SheetEarlier) => {
    const fr = x.frame;
    if (!fr) return '';
    const pov = fr.eyes === 'dreamer';
    const people = fr.visible.filter((id) => !(pov && id === s.dreamer.id)).map(name);
    const parts = [
      people.join(' and '),
      fr.place ? `at ${name(fr.place)}` : '',
      pov ? "through the dreamer's eyes" : '',
    ];
    const said = parts.filter(Boolean).join(', ');
    return said ? ` (${said})` : '';
  };
  // An earlier picture for who someone is, as last drawn: a person by their face, hair, build and clothes; an animal or
  // a thing by what makes it that one (a shoal of fish has no face or clothes); someone turned into something else by
  // what they have turned into.
  const lastSeen = (x: SheetEarlier, ids: string[]) => {
    const names = ids.map(name);
    const el = (id: string) => s.inView.find((e) => e.id === id);
    // Before the step, every earlier picture said as a person's, as framePrompt says it.
    if (
      !s.earlierWords ||
      (ids.every((id) => (el(id)?.said ?? 'person') === 'person' || el(id)?.said === 'people') &&
        !ids.some((id) => el(id)?.turned))
    )
      return `${pictureNo(x)}${whoWhere(x)}: who ${names.join(' and ')} ${names.length > 1 || (s.earlierWords && ids.some((id) => el(id)?.group)) ? 'are' : 'is'}, as last drawn: their face, hair, build and clothes, exactly. Nothing else from it: not its pose, background or framing.`;
    const each = ids.map((id) => {
      const e = el(id);
      return e?.turned
        ? `what ${name(id)} has turned into`
        : e?.said === 'animal'
          ? `what ${name(id)} is: its kind, size, build, coat and markings`
          : e?.said === 'thing' || e?.said === 'place'
            ? `${name(id)}: its shape, materials and colours`
            : `who ${name(id)} ${e?.group ? 'are' : 'is'}: their face, hair, build and clothes`;
    });
    return `${pictureNo(x)}${whoWhere(x)}: ${each.join('; ')}, as last drawn, exactly. Nothing else from it: not its pose, background or framing.`;
  };
  // Someone turned into something else is drawn from the in-between picture of what they have turned into: an earlier
  // picture is never sent for who they are beside it.
  const turnedBy = new Set(s.earlierWords ? usable.filter((x) => x.ghost?.state?.whole).map((x) => x.ghost!.of) : []);

  // In-between pictures, then earlier moments, while there is room. A person's latest picture, the
  // last kind added, is the first to go.
  // The dream's jump, said with one full stop: its words may end with their own.
  const shift = s.earlierWords ? s.story.shift.replace(/[.\s]+$/, '') : s.story.shift;
  // Each part's in-between picture, by its image: with each state said once (S6 row 16) its sketch's "Except"
  // points to it instead of saying the state again.
  const partPictures: { of: string; what: string; now: string; at: number }[] = [];
  for (const x of usable) {
    if (x === base || asStage.has(x.id) || references.length >= MAX_IMAGES) continue;
    const g = x.ghost;
    if (g) {
      attach(
        {
          image: x.image,
          role: x.role === 'location' ? 'location' : x.role === 'prop' ? 'prop' : 'identity',
          instruction: x.carries,
          source: 'ghost',
          of: x.id,
          subjects: [g.of],
        },
        g.kind === 'view'
          ? `${name(g.of)} seen facing ${g.looksAt || 'the other way'}: the side this frame faces. Keep everything in it where it puts it.`
          : g.state && g.state.whole
            ? `what ${name(g.of)} has turned into, ${aNoun(g.state.now)}: draw it exactly so, where ${name(g.of)} was. Nothing else from it.`
            : g.of === s.place || !g.state
              ? `how ${name(g.of)} looks now (${g.state?.what}: ${g.state?.now}): draw it exactly so. Nothing else from it.`
              : `${name(g.of)}'s ${g.state.what} as it is now (${g.state.now}): draw their ${g.state.what} exactly so, and take nothing else from it.`,
      );
      if (g.kind === 'state' && g.state && !g.state.whole)
        written.push({ of: g.of, what: g.state.what, now: g.state.now });
      if (g.state && !g.state.whole && g.of !== s.place)
        partPictures.push({ of: g.of, what: g.state.what, now: g.state.now, at: references.length });
      continue;
    }
    const unsketched = x.who?.filter((id) => !imageOf.has(id) && !turnedBy.has(id)) ?? [];
    if (x.who?.length && !unsketched.length) continue;
    // With the view worked out from the floor plan, the picture showing the dreamer from outside would
    // only pull its own layout back into their view.
    if (x.relation === 'seat' && cam.view) continue;
    // No image goes in for its light alone: a picture from the other side goes in only for someone in
    // it who has no sketch of their own, as who they are.
    if (x.role === 'lighting') {
      const own = seenHere.filter(
        (id) => !imageOf.has(id) && !turnedBy.has(id) && (x.frame?.visible ?? []).includes(id),
      );
      if (own.length)
        attach(
          {
            image: x.image,
            role: 'identity',
            instruction: `${own.map(name).join(' and ')}: as last drawn`,
            source: 'earlier',
            of: x.id,
            subjects: own,
          },
          lastSeen(x, own),
        );
      continue;
    }
    const r = x.relation;
    const shows = whoWhere(x);
    attach(
      {
        image: x.image,
        role: x.role === 'composition' ? 'composition' : 'identity',
        instruction: x.carries,
        source: 'earlier',
        of: x.id,
        // For who has no sketch of their own here, or else how everyone in both pictures looks now.
        subjects:
          x.role === 'composition'
            ? []
            : x.who?.length
              ? unsketched
              : (x.frame?.visible ?? []).filter((id) => s.visible.includes(id)),
      },
      (r === 'shift'
        ? s.camera.eyes === 'dreamer' && x.frame?.eyes !== 'dreamer'
          ? `${pictureNo(x)}${shows}, just before the dream jumps. Keep its framing and the shapes in it where they are; the dreamer in it is now the camera, so they are not in this picture. The dream changes this: ${shift}.`
          : x.frame?.place && x.frame.place !== s.place
            ? `${pictureNo(x)}${shows}, just before the dream jumps to another place. Keep only its composition: where the main shapes and figures sit in the frame, so the two pictures cut together; the place and everything in it are this picture's own. The dream changes this: ${shift}.`
            : x.turned
              ? `${pictureNo(x)}${shows}, just before the dream changes it. Keep only its composition: where the main shapes and figures sit in the frame, so the two pictures cut together; this picture faces ${cam.looksAt || 'another side of the place'}. The dream changes this: ${shift}.`
              : `${pictureNo(x)}${shows}, just before the dream jumps. ${keepAcross(x)}; the dream changes this: ${shift}.`
        : r === 'seat'
          ? `${pictureNo(x)}${shows}: the camera is where the dreamer is in it, at their eye height, turned toward ${cam.looksAt || 'what this moment shows'}; what is beside them there is beside the camera here, seen from their place. Nothing else from it: not its camera, framing or angle.`
          : x.role === 'composition'
            ? samePlaceLine(
                `${pictureNo(x)}${shows}`,
                // "From the shot above" only where the place's own line says so too (as frames.ts).
                mockUp
                  ? 'mockup'
                  : cam.view && !base && !(roomFromCut && !s.refs)
                    ? 'shot'
                    : r === 'same_setup'
                      ? 'setup'
                      : 'side',
                cam.size,
                cam.eyes === 'dreamer' && !!s.dreamer.id && (x.frame?.visible ?? []).includes(s.dreamer.id),
              )
            : unsketched.length
              ? lastSeen(x, unsketched)
              : `${pictureNo(x)}${shows}: take only ${x.carries.replace(/;.*$/, '')}. Nothing of its place, framing or background. ${NOTHING_ELSE}`) +
        strays(x),
    );
  }

  // Each state said once (S6 row 16): a part an in-between picture shows is said there, and its sketch's "Except"
  // says it is now as that picture shows; what the images' lines say of how one is now is not said again below.
  // Only the clause of that one's Except about that part, whole: up to its state and then its end.
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const same = (a: string, b: string) => a.toLowerCase().trim() === b.toLowerCase().trim();
  if (s.once?.state)
    for (const g of partPictures)
      for (const x of excepts)
        if (x.of === g.of && same(x.what, g.what) && x.now === g.now)
          manifest[x.line] = manifest[x.line].replace(
            new RegExp(`${esc(x.head + x.now)}(?=[.;,])`),
            () => `${x.head}as Image ${g.at} shows`,
          );
  // Said above: that one's part, in that state, is what an image's line says or points to; never a word that happens
  // to be in a line ("wet" of the fish's look is not the newspaper's; a wet shirt is not the wet hair said above).
  const saidAbove = (x: { of: string }, f: { part: string; what: string; now: string }) =>
    written.some(
      (w) =>
        w.of === x.of &&
        same(w.now, f.now) &&
        [w.what, w.part].some((n) => n !== undefined && (same(n, f.what) || same(n, f.part))),
    );
  let dropped = 0;
  const nowOf = s.once?.state
    ? s.now
        ?.map((x) => {
          const facts = x.facts.filter((f) => !(f.kind === 'part' && saidAbove(x, f)));
          dropped += x.facts.length - facts.length;
          return { ...x, facts };
        })
        .filter((x) => x.facts.length)
    : s.now;

  const states = s.states.map((st) => `${name(st.who)}'s ${st.what}: ${st.now}`);
  // How each one in the picture is right now, each fact once, in place of what is still so from earlier.
  const now = nowOf ? sayNow(nowOf).map((x) => x.text) : (s.nowWords ?? undefined);
  const action = s.story.action;
  // Seen from outside, the dreamer is a person in the picture only when the moment has them in it.
  const angle =
    cam.eyes === 'dreamer'
      ? "seen through the dreamer's own eyes"
      : s.inView.some((e) => e.isDreamer)
        ? 'at eye level, the dreamer seen from outside'
        : 'at eye level';
  // Their own hands or feet may show, in their own clothes. With the camera rules, only their hands
  // and arms, and only where they do something with them: nothing of them otherwise.
  const wear = s.dreamer.wear;
  const inWear = wear ? `, in ${wear.charAt(0).toLowerCase()}${wear.slice(1)}` : '';
  const body = s.rules?.body ?? null;
  const own =
    body === 'self'
      ? `their own body shows as they look down at it${inWear}, never their face`
      : body === 'hands'
        ? `at most their own hands and arms show${inWear}, and nothing else of them`
        : body === 'none'
          ? "nothing of the dreamer's own body shows, not even their hands: they touch nothing in it"
          : `at most their own hands, arms or feet show${inWear}`;
  const pov =
    cam.eyes === 'dreamer' && !cam.view
      ? body === 'self'
        ? `The camera is the dreamer's own eyes: their own body shows as they look down at it${inWear}, never their face.`
        : body === 'hands'
          ? `The camera is the dreamer's own eyes: the dreamer is not in the picture, except their own hands and arms${inWear}, and nothing else of them.`
          : body === 'none'
            ? "The camera is the dreamer's own eyes: nothing of the dreamer is in the picture, not even their hands: they touch nothing in it."
            : `The camera is the dreamer's own eyes: the dreamer is not in the picture, except perhaps their own hands, arms or feet${inWear}.`
      : '';
  // A reverse angle: the room turned with the camera, said after the shot.
  const turned = s.rules?.turn ? sayTurn(s.rules.turn) : '';
  const after = [...(s.rules?.lines ?? []), ...(turned ? [turned] : [])].map((x) => ` ${x}`).join('');
  const feeling = s.story.feeling;
  const point = s.story.point;
  // Someone drawn with their group stands with it, not beside it.
  const staged = cam.staging.filter((id) => !s.members.some((m) => m.member === id));
  const withGroups = s.members
    .map((m) => ` ${name(m.member)} ${element(m.member)?.group ? 'are' : 'is'} with ${name(m.group)}.`)
    .join('');
  const shape = SHAPE_WORDS[cam.shape];
  const lines: AssembledLine[] = [
    {
      id: 'framing',
      fields: ['camera.shape', 'camera.size', 'camera.eyes', 'camera.looksAt', 'camera.view', 'inView'],
      // With the dreamer's view worked out, the view is the framing; an edit keeps the framing of the
      // picture it edits.
      text: cam.view
        ? cam.eyes === 'dreamer'
          ? `One picture from the dream, in ${shape}, through the dreamer's own eyes.`
          : `One picture from the dream, in ${shape}: a ${cam.size} shot, ${angle}${cam.looksAt ? `, facing ${cam.looksAt}` : ''}.`
        : `One picture from the dream, in ${shape}: a ${cam.size} shot, ${angle}${cam.looksAt ? `, facing ${cam.looksAt}` : ''}.${base ? '' : ` ${FRAMING[cam.size]}`}`,
    },
    {
      id: 'shot',
      fields: ['camera.brief', 'camera.view', 'camera.previs', 'dreamer.wear'],
      // The shot comes first, before the images: its brief where there is one, else the view.
      text: cam.view
        ? cam.brief !== null
          ? `The shot${mockUp ? ', as the mock-up in Image 1 shows it' : ''}${cam.eyes === 'dreamer' ? ` (${own})` : ''}: ${cam.brief}${after}`
          : cam.eyes === 'dreamer'
            ? `What the dreamer sees, the camera being their own eyes${mockUp ? ', as the mock-up in Image 1 shows it' : ''} (${own}): ${cam.view}${after}`
            : `What the camera sees${mockUp ? ', as the mock-up in Image 1 shows it' : ''}: ${cam.view}${after}`
        : '',
    },
    {
      id: 'manifest',
      fields: ['earlier', 'inView', 'camera.previs', 'members', 'take.strays'],
      text: manifest.length
        ? `The attached images, in order, and the one thing to take from each:\n${manifest.join('\n')}`
        : '',
    },
    { id: 'happens', fields: ['story.action'], text: `What happens in this frame: ${action}` },
    {
      id: 'dream',
      fields: ['story.dreamlike'],
      // The dream's own strangeness, shown as plain fact, never as an effect.
      text: s.story.dreamlike
        ? `The dream in it, drawn as plain fact, as solid and ordinary as everything around it: ${sentence(s.story.dreamlike)}`
        : '',
    },
    { id: 'pov', fields: ['camera.eyes', 'camera.view', 'dreamer.wear'], text: pov },
    {
      id: 'staging',
      fields: ['camera.words', 'camera.across', 'camera.staging', 'members'],
      text:
        cam.words && cam.across.length >= 2
          ? `Seen ${cam.words}. From left to right across the picture: ${cam.across.map(name).join(', then ')}. They keep these places in every picture of this scene.${withGroups}`
          : staged.length >= 2
            ? `Where they stand, from left to right: ${staged.map(name).join(', then ')}. They keep these sides in every picture of this scene.${withGroups}`
            : '',
    },
    { id: 'you', fields: ['camera.eyes'], text: YOU },
    { id: 'in_it', fields: ['inView', 'once'], text: facts.length ? `In it:\n${facts.join('\n')}` : '' },
    {
      id: 'now',
      fields: ['now', 'nowWords', 'states'],
      text: now
        ? now.length
          ? `How each one is at this moment: ${now.join('; ')}.`
          : ''
        : states.length
          ? `Still so from earlier in the dream: ${states.join('; ')}.`
          : '',
    },
    { id: 'feeling', fields: ['story.feeling'], text: feeling ? `It should feel: ${sentence(feeling)}` : '' },
    {
      id: 'point',
      fields: ['story.point'],
      text: point ? `The one thing this frame must show: ${sentence(point)}` : '',
    },
    {
      id: 'repairs',
      fields: ['take.repairs'],
      // The judge's findings on the last attempt, when it is drawn again for them.
      text: s.take.repairs.length
        ? `The last attempt at this frame got these wrong. Put each right:\n${s.take.repairs.map((q) => `- ${q}`).join('\n')}`
        : '',
    },
    {
      id: 'style',
      fields: ['style'],
      text: styleBlock(s.style.option, s.style.told, { fromImages: references.length > 0 }),
    },
    {
      id: 'as_images',
      fields: ['now', 'nowWords'],
      // What this moment changes, and nothing else, differs from the references.
      text: references.length
        ? `Everyone and everything looks exactly as in their images above, except for what this moment itself changes and ${now?.length || dropped ? 'how each one is at this moment, as said' : 'what is still so from earlier'}.`
        : '',
    },
    {
      id: 'no_layering',
      fields: ['earlier'],
      // An earlier picture gives only what it is attached for, whatever the style.
      text: usable.some((x) => x.kind === 'cut')
        ? 'Nothing from another picture shows through this one: no other place, sky, wall or person is layered or double-exposed into it, whatever the style.'
        : '',
    },
    {
      id: 'single',
      fields: ['story.writing'],
      text: `One single picture filling the whole frame. ${writingLine(s.story.writing)}`,
    },
  ];
  // Each colour the dream gives said once (S6 row 15): in many colours every colour said above keeps it, and the
  // style lists only those no line above says. In one colour the style's list is the one list (above).
  // Said above is where a look is said: an image's line or "In it", as a whole phrase ("red" is not in "rendered");
  // a colour said only in the moment's own words or the shot is of something with no look, and stays listed.
  if (s.once?.colour && !s.style.oneColour) {
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const looks = lines
      .filter((l) => l.id === 'manifest' || l.id === 'in_it')
      .map((l) => l.text)
      .join('\n');
    const rest = s.style.told.filter((c) => !new RegExp(`\\b${esc(c)}\\b`, 'i').test(looks));
    const style = lines.find((l) => l.id === 'style');
    if (style)
      style.text = styleBlock(s.style.option, rest, {
        fromImages: references.length > 0,
        saidAbove: rest.length < s.style.told.length,
      });
  }
  // To a picture "you" is the viewer: where anything told to it says "you", it is told who that is.
  const told = lines
    .filter((l) => l.id !== 'you')
    .map((l) => l.text)
    .join('\n');
  const out = lines
    .map((l) =>
      l.id !== 'you'
        ? l
        : {
            ...l,
            text:
              s.camera.eyes === 'outside' && /\byou(r|rself)?\b/i.test(told)
                ? `"You" in these words is the dreamer, a person in the picture like anyone else. There is no viewer in the picture: no hands, arms or body of the camera.`
                : '',
          },
    )
    .filter((l) => !!l.text);
  return {
    prompt: out.map((l) => l.text).join('\n\n'),
    references,
    lines: out,
    depicted: [...new Set(depicted)],
  };
}
