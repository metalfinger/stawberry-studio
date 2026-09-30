// What step S6 retires, measured before it is built (HARNESS_PLAN.md, S6 eval). Every prompt is rebuilt from
// the saved dreams exactly as plan.ts rebuilds it, and read four ways; none of them calls a model:
//
// 1. The footprint of each text clean-up and word list S6 retires (cleanups.ts): each turned off on its own,
//    every picture whose prompt, images or plan change is one it acts on today, with the runs of words it
//    removes and adds. When S6 retires one for a typed fact, those are the pictures whose change is intended;
//    its words coming back anywhere is a regression (evals/corpus.ts --came-back).
// 2. Each fact once: every clause of the dream the cut sheet gives the prompt (each look of who and what is in
//    view, how each one is now, the states carried, what an in-between picture shows, the moment's own words,
//    the colours the dream gives), and each place a prompt says one twice; and which clauses the sheet itself
//    carries in two fields (one source per fact).
// 3. The action as visible facts: what "What happens in this frame" says that no picture can show at one
//    instant (a sequence or a time, what is heard, felt or known, "you", a story word, someone gone or turned
//    into something else by their old name), and who in view it never names.
// 4. Where two sources of one fact disagree today (the duplicates S6 makes one): who is in view, names, kinds,
//    looks, the states carried, the relation to the cut before, the colours the dream gives; and ids in words.
//
//   DREAMCHAT_WRITER=claude DREAMCHAT_RECORD=on DREAMCHAT_CUT_SHEET=on bun run evals/retire.ts --label lab
//   … --live                   every saved conversation and fake replay instead of the frozen dreams
//   … --no-imply               without what the moments imply (else read from runs/implied-cache.json only)
//   … --only gone vague        only these clean-ups;   --checks   the readings 2-4 only, no clean-up turned off
//   … --dreams <id> …          only these dreams
//
// What the moments imply is taken from the cache only (evals/implied-cache.ts, keyed by DREAMCHAT_WRITER's model):
// a dream whose readings are not all there is measured without them, and listed. The cut sheet must be built
// (DREAMCHAT_CUT_SHEET=shadow or on) for the readings 2-4. Writes runs/retire/<label>.json and <label>.txt.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { builds, CLEANUP_NAMES, CLEANUPS, type Cleanup, oneBuilder, withRetired } from '../cleanups';
import { pictureName } from '../continuity';
import type { CutSheet } from '../cutsheet';
import { type Rebuilt, type RebuiltPicture, rebuild } from '../plan';
import type { StyleOption } from '../producer';
import { type ElementKind, recordInputsOf, sayNow, type StoryRecord, storyRecord } from '../record';
import type { Session } from '../session';
import { inShades, LOOK } from '../sheets';
import { atomicChanges, diffDumps, type DumpDream, dumpOf, wordDiff, wordRuns } from './corpus';
import { withImplied } from './implied-cache';
import { withTyped } from './typed-cache';
import { JEV_MODEL, sectionsOf } from './prompt-cases';
import { commitOf, DIR, type Dream, dataDir, frozenDreams, liveDreams, loadDream, readLive, switches } from './saved';

// ── words ────────────────────────────────────────────────────────────────────────────────────────

/** Words that say no fact by themselves. Words of place and direction (up, over, under …) stay: they tell facts apart. */
const STOP = new Set(
  'a an the this that these those it its they them their theirs he him his she her hers we us our you your i me my of in on at by for from with to as is are was were be been being am has have had do does did not no nor or and but so than then too very just only also all each every some any both either neither there here which who whom whose what when where while how now still already'.split(
    ' ',
  ),
);
const singular = (w: string) => (w.length > 3 && w.endsWith('s') && !/(?:ss|us|is)$/.test(w) ? w.slice(0, -1) : w);

/** A text's words that say something, in order: lower case, no little words, a plural as its singular. */
export function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((w) => (w.length > 1 || /\d/.test(w)) && !STOP.has(w))
    .map(singular);
}

/** How many times `run` stands in `words`, whole and in order, never overlapping. */
export function timesIn(words: string[], run: string[]): number {
  if (!run.length) return 0;
  let n = 0;
  for (let i = 0; i + run.length <= words.length;)
    if (run.every((w, k) => words[i + k] === w)) {
      n++;
      i += run.length;
    } else i++;
  return n;
}

/** A line of a prompt: a paragraph, or one row of a list in it (the images, "In it", the repairs). */
export type Line = { section: string; text: string; words: string[] };

export function linesOf(prompt: string): Line[] {
  return prompt.split('\n\n').flatMap((para) => {
    const section = Object.keys(sectionsOf(para))[0] ?? 'other';
    return para.split('\n').map((text) => ({ section, text, words: contentWords(text) }));
  });
}

// ── 2. each fact once ───────────────────────────────────────────────────────────────────────────

/** Where on the sheet a clause of the dream comes from. */
export type FactSource =
  'look' | 'turned' | 'now' | 'state' | 'ghost' | 'action' | 'point' | 'dream' | 'feeling' | 'shift' | 'colour';

/** One clause of the dream the sheet gives the prompt, and every field of the sheet that carries it. */
export type Fact = { text: string; words: string[]; sources: string[] };

/** A text's clauses: cut at ";", ", ", ". ", ": ", brackets and new lines. */
const clausesOf = (text: string) =>
  text
    .split(/;\s*|,\s+|\.\s+|:\s+|[()]|\n/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Every clause of the dream a cut sheet gives the prompt, at least two words that say something, and never only
 * a name (a name is how a fact is said of someone): each look of who and what is in view, what one has turned
 * into, how each one is now (or the states carried), what each in-between picture shows, the moment's own words
 * (what happens, what it must show, the dream in it, the feeling, the jump) and the colours the dream gives.
 * A clause two fields carry is one fact with two sources.
 */
export function factsOf(sheet: CutSheet): Fact[] {
  const names = [...Object.values(sheet.names), ...sheet.inView.map((e) => e.name)].map(contentWords);
  const onlyName = (ws: string[]) => names.some((n) => ws.every((w) => n.includes(w)));
  const facts = new Map<string, Fact>();
  const add = (source: FactSource, of: string, text: string | null | undefined, whole = false) => {
    for (const clause of whole ? [text ?? ''] : clausesOf(text ?? '')) {
      const words = contentWords(clause);
      if (words.length < 2 || onlyName(words)) continue;
      const key = words.join(' ');
      const f = facts.get(key) ?? { text: clause, words, sources: [] };
      const at = `${source}:${of}`;
      if (!f.sources.includes(at)) f.sources.push(at);
      facts.set(key, f);
    }
  };
  for (const e of sheet.inView) {
    add('look', e.id, e.look);
    if (e.turned) add('turned', e.id, e.turned, true);
  }
  if (sheet.now) for (const x of sayNow(sheet.now)) add('now', x.of, x.text);
  else if (sheet.nowWords) for (const t of sheet.nowWords) add('now', '', t);
  else for (const st of sheet.states) add('state', st.who, st.now);
  for (const x of sheet.earlier) if (x.ghost?.state) add('ghost', x.id, x.ghost.state.now);
  add('action', '', sheet.story.action);
  add('point', '', sheet.story.point);
  add('dream', '', sheet.story.dreamlike);
  add('feeling', '', sheet.story.feeling);
  add('shift', '', sheet.story.shift);
  for (const c of sheet.style.told) add('colour', '', c, true);
  return [...facts.values()];
}

/** A fact a prompt says more than once, with the part of the prompt of each time. */
export type SaidTwice = { text: string; sources: string[]; times: number; sections: string[] };

/** Each fact of the sheet that its prompt says twice or more, in its lines (a paragraph, or one row of a list). */
export function saidTwice(prompt: string, facts: Fact[]): SaidTwice[] {
  const lines = linesOf(prompt);
  const out: SaidTwice[] = [];
  for (const f of facts) {
    const sections: string[] = [];
    for (const l of lines) for (let n = timesIn(l.words, f.words); n > 0; n--) sections.push(l.section);
    if (sections.length > 1) out.push({ text: f.text, sources: f.sources, times: sections.length, sections });
  }
  return out;
}

/** Where a fact said twice is said: its parts of the prompt, each once, in order ("in_it+manifest"). */
export const whereSaid = (x: Pick<SaidTwice, 'sections'>) => [...new Set(x.sections)].sort().join('+');

/** The kind of field a fact comes from (its sources' kinds, each once): "look", "action+now". */
export const fromWhat = (x: Pick<Fact, 'sources'>) =>
  [...new Set(x.sources.map((s) => s.split(':')[0]))].sort().join('+');

/** The shot's own words: the floor plan's view and the brief a model wrote for it, and the framing line. */
export const SHOT_WORDS = new Set(['shot', 'framing']);

/** Said twice even leaving out the shot's words: what the prompt's own lines repeat. */
export const outsideShot = (x: Pick<SaidTwice, 'sections'>) => x.sections.filter((s) => !SHOT_WORDS.has(s)).length > 1;

/**
 * What kind of repetition a fact said twice is, first match wins: said once by the prompt's own lines and again
 * only in the shot's words; a state (how one is now, carried, or what an in-between picture shows); the
 * moment's own words (what happens, what it must show, the dream in it, the feeling, the jump); a colour the
 * dream gives said again in the style; or a look said twice by the prompt's own lines (its image's line and
 * "In it").
 */
export function kindOfTwice(
  x: Pick<SaidTwice, 'sections' | 'sources'>,
): 'state' | 'story' | 'colour' | 'shot' | 'look' {
  const from = new Set(x.sources.map((s) => s.split(':')[0]));
  if (!outsideShot(x)) return 'shot';
  if (['now', 'state', 'ghost'].some((k) => from.has(k))) return 'state';
  if (['action', 'point', 'dream', 'feeling', 'shift'].some((k) => from.has(k))) return 'story';
  if (x.sections.includes('style')) return 'colour';
  return 'look';
}

/** Facts two kinds of field of the sheet carry (a look and a colour, a state and an in-between picture): two sources of one fact. */
export const twoSources = (f: Pick<Fact, 'sources'>) => new Set(f.sources.map((s) => s.split(':')[0])).size > 1;

// ── 3. the action as visible facts ──────────────────────────────────────────────────────────────

/**
 * What a picture cannot show of an action at one instant, by kind: a sequence or a time (it shows one
 * instant), what is heard, felt, thought or known (never seen), "you" (to a picture, the viewer), and a story's
 * words for a turn in it. The eval's own reading of the words sent, never the harness's.
 */
export const NOT_SEEN: Record<'sequence' | 'unseen' | 'you' | 'story', RegExp> = {
  sequence:
    /\b(?:then|and then|after that|afterwards?|finally|eventually|later|at last|in the end|until|as soon as|by the time|suddenly|meanwhile)\b|\b(?:starts?|started|starting|begins?|began|beginning)\s+(?:to\s+)?[a-z]+|\b(?:keeps?|kept|continues?|continued)\s+[a-z]+ing\b/i,
  unseen:
    /\b(?:hears?|heard|hearing|listens?|listened|listening|feels?|felt|thinks?|thought|thinking|knows?|knew|realis\w+|realiz\w+|remembers?|remembered|remembering|wonders?|wondered|wondering|decides?|decided|wants?|wanted|hopes?|hoped|senses?|sensed|smells?|smelled|imagines?|imagined|understands?|understood|notices?|noticed|recognis\w+|recogniz\w+)\b/i,
  you: /\byou(?:r|rs|rself)?\b/i,
  story: /\b(?:the turn|the reveal|the twist|the climax|the moment (?:when|that)|at that moment|in that moment)\b/i,
};

export type ActionFinding = {
  rule: keyof typeof NOT_SEEN | 'gone_named' | 'turned_named' | 'unnamed';
  said: string;
};

/** A name as the words of a picture say it: "the older sister" is found as "older sister" or "sister". */
const namePatterns = (name: string) => {
  const bare = name.replace(/^(?:the|a|an)\s+/i, '').trim();
  const head = bare.split(/\s+/).at(-1) ?? '';
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [bare, head]
    .filter((x) => x.length > 2)
    .map((x) => new RegExp(`(?<![\\p{L}-])${esc(x)}(?:s|es)?(?![\\p{L}-])`, 'iu'));
};

/**
 * What the moment's "What happens" paragraph says that a picture cannot show, and who in view it never names.
 * `gone` names what the story record has gone from the moment; someone in view who has turned into something
 * else is not to be called by their old name there.
 */
export function actionFindings(prompt: string, sheet: CutSheet, gone: { id: string; name: string }[]): ActionFinding[] {
  const para = sectionsOf(prompt).happens ?? '';
  const said = para.replace(/^What happens in this frame:\s*/, '');
  const out: ActionFinding[] = [];
  for (const [rule, re] of Object.entries(NOT_SEEN) as [keyof typeof NOT_SEEN, RegExp][]) {
    const m = said.match(re);
    if (m) out.push({ rule, said: m[0] });
  }
  for (const g of gone) {
    const m = namePatterns(g.name)
      .map((re) => said.match(re))
      .find(Boolean);
    if (m) out.push({ rule: 'gone_named', said: m[0] });
  }
  for (const e of sheet.inView) {
    if (e.kind !== 'character') continue;
    const named = namePatterns(e.name).some((re) => re.test(said));
    if (e.turned !== null && named) out.push({ rule: 'turned_named', said: e.name });
    // Someone (a person or an animal, never a crowd) in view whom the words never name has no act said: "they"
    // is not read, so this is an upper bound until the acts are typed.
    const crowd = sheet.record?.kinds[e.id] === 'crowd';
    if (!named && e.turned === null && (e.said === 'person' || e.said === 'animal') && !crowd)
      out.push({ rule: 'unnamed', said: e.name });
  }
  return out;
}

// ── 4. two sources of one fact ──────────────────────────────────────────────────────────────────

/** Ids of the dream's people, places, things and moments standing as words in a prompt ("outside it l2"). */
export function idsInWords(prompt: string, ids: string[]): string[] {
  if (!ids.length) return [];
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\w-])(${ids.map(esc).join('|')})(?![\\w-])`, 'g');
  return [...new Set([...prompt.matchAll(re)].map((m) => m[1]))];
}

const bareName = (x: string) =>
  x
    .toLowerCase()
    .replace(/^(?:the|a|an)\s+/, '')
    .trim();
const setDiff = <T>(a: Set<T>, b: Set<T>) => [...a].filter((x) => !b.has(x));
const KIND_OF_SAID: Record<string, ElementKind[]> = {
  person: ['person'],
  animal: ['animal'],
  people: ['group', 'crowd'],
  place: ['place'],
  thing: ['thing'],
};

/** Where one moment's sources of one fact disagree. Each list names what differs; empty where they agree. */
export type Disagreement = {
  /** Who and what is in view: the sheet's (the plan's lists and view), against the record's and the tree's. */
  inView: { sheetOnly: string[]; recordOnly: string[]; treeOnly: string[]; notInTree: string[] };
  /** Names: the sheet's (the sketch's) against the record's and the tree's. */
  names: string[];
  /** Kinds: what the sheet says one is (person, animal, people, place, thing) against the record's kind. */
  kinds: string[];
  /** Looks: words the sheet's look says that the record's does not, and the other way, by who. */
  looks: { id: string; sheetOnly: string[]; recordOnly: string[] }[];
  /** The changes carried: the plan's, against the record's in force on who and what is in view. */
  states: { planOnly: string[]; recordOnly: string[] };
  /** The plan was made from an older record than the sheet reads (flag record_moved). */
  recordMoved: boolean;
  /** How it follows the cut before: the plan's reference, against the move the sheet reads (relationIn). */
  toPrev: string | null;
  /** A colour the dream gives, said in an image's line and again in the style (a style of one colour). */
  coloursTwice: string[];
  /**
   * A colour the dream gives, said two ways in one prompt: whole where it is told ("green glass lamps") and as a
   * shade of the one colour elsewhere ("mid-toned glass lamps", library-3 m5, rule E1).
   */
  colourTwoWays: string[];
};

/** Each colour the dream gives that a prompt also says as a shade ("dark", "mid-toned", "pale") of the one colour. */
export function colourTwoWays(prompt: string, told: string[]): string[] {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return told.filter((c) => {
    const rest = c.split(/\s+/).slice(1).join(' ');
    return !!rest && new RegExp(`\\b(?:dark|mid-toned|pale)\\s+${esc(rest)}\\b`, 'i').test(prompt);
  });
}

/** The words of a look as the record would say it: its base facts, the look's fields, a guessed colour in the style's shades. */
function recordLook(
  rec: StoryRecord,
  id: string,
  kind: 'character' | 'location' | 'prop',
  style: StyleOption,
  away: Set<string> = new Set(),
  keep: string[] = [],
): string[] {
  const e = rec.elements[id];
  if (!e) return [];
  // A first look (a change made where it is first shown) is said as how it is now, not in the look; a group's
  // clause about someone with a sketch of their own who is in view is theirs (S6 row 12).
  return LOOK[kind].flatMap((k) =>
    (e.base[k] ?? [])
      .filter((f) => !f.first && !f.about?.some((m) => away.has(m)))
      .flatMap((f) =>
        // A clause guessed or implied is said in the style's shades; one said, confirmed or read from the story as told.
        contentWords(f.basis === 'guessed' || f.basis === 'implied' ? inShades(f.text, style, keep) : f.text),
      ),
  );
}

export function disagreementsOf(p: RebuiltPicture, rec: StoryRecord | null, style: StyleOption): Disagreement | null {
  const s = p.sheet;
  if (!s) return null;
  const sheetIds = new Set(s.inView.map((e) => e.id));
  // Who is in view by one definition (S6 row 7): the record's shows and whom the camera's view sees on the
  // floor plan (the market's crowd behind the stall, the sister beside it: seen, not listed).
  const recIds = new Set([
    ...(s.record?.shows ?? []),
    ...(s.record?.place ? [s.record.place] : []),
    ...(p.item.frame?.plan?.sees ?? []).filter((id) => sheetIds.has(id)),
  ]);
  // The tree's own elements for the floor plan's spots ("l2/table") and its camera and light are not the dream's.
  const treeIds = new Set(
    (s.tree?.at ?? [])
      .filter((e) => (e.present === 'listed' || e.present === 'sees') && !/[/:]/.test(e.id))
      .map((e) => e.id),
  );
  const names: string[] = [];
  const kinds: string[] = [];
  const looks: Disagreement['looks'] = [];
  for (const e of s.inView) {
    const called = rec?.elements[e.id]?.called;
    const inTree = s.tree?.at.find((x) => x.id === e.id)?.called;
    if (called !== undefined && bareName(called) !== bareName(e.name))
      names.push(`${e.id}: "${e.name}" / record "${called}"`);
    // The tree calls one who has turned into something else by what they are now, as the sheet says it beside
    // their name ("it has turned into …"): one fact, said one way by each, not two names.
    const treeSays = (x: string) => bareName(pictureName(x));
    if (
      inTree !== undefined &&
      treeSays(inTree) !== bareName(e.name) &&
      (e.turned === null || treeSays(inTree) !== treeSays(e.turned)) &&
      e.id !== s.dreamer.id
    )
      names.push(`${e.id}: "${e.name}" / tree "${inTree}"`);
    const kind = s.record?.kinds[e.id];
    // A group or crowd of animals the record marks so (S6 row 6) is said as an animal: one kind, not two.
    const animals = rec?.elements[e.id]?.animal && e.said === 'animal' && (kind === 'group' || kind === 'crowd');
    if (kind && !animals && !KIND_OF_SAID[e.said]?.includes(kind)) kinds.push(`${e.id}: ${e.said} / record ${kind}`);
    // With the one builder's looks, only where the record's base is the drawn sketch's words: a sketch waiting or
    // failed carries its look in the item, which the sheet reads (cutsheet.ts recLook).
    if (rec && e.turned === null && (!builds('looks') || rec.elements[e.id]?.fromSketch)) {
      const a = new Set(contentWords(e.look));
      const away = new Set(s.members.filter((m) => m.group === e.id).map((m) => m.member));
      const z = new Set(recordLook(rec, e.id, e.kind, s.style.option, away, builds('shades') ? e.colours : []));
      const sheetOnly = setDiff(a, z);
      const recordOnly = setDiff(z, a);
      if (sheetOnly.length || recordOnly.length) looks.push({ id: e.id, sheetOnly, recordOnly });
    }
  }
  const key = (x: { who: string; what: string }) => `${x.who}:${x.what.toLowerCase()}`;
  const plan = new Set(s.states.filter((x) => sheetIds.has(x.who)).map(key));
  const carried = new Set(
    (s.record?.carried ?? [])
      .filter((c) => c.kind !== 'presence' && c.kind !== 'becomes' && sheetIds.has(c.who))
      .map(key),
  );
  const prevUse = s.prev ? p.item.frame?.plan?.refs.find((x) => x.kind === 'cut' && x.id === s.prev) : undefined;
  // In one colour, a colour an image's line lists as kept exactly that the style lists again, read off the prompt
  // as sent: with the colours said once (S6 row 15) an image's line points to the style's list instead.
  const lines = p.prompt.toLowerCase().split('\n');
  const styleLine = lines.find((l) => l.startsWith('colours:')) ?? '';
  const listedIn = (c: string) =>
    lines.some((l) => /^image \d+:/.test(l) && (l.split('which keeps it exactly: ')[1] ?? '').includes(c));
  const coloursTwice = s.style.oneColour
    ? s.inView
        .filter((e) => e.image && e.turned === null && e.colours.length)
        .flatMap((e) =>
          e.colours
            .filter((c) => styleLine.includes(c.toLowerCase()) && listedIn(c.toLowerCase()))
            .map((c) => `${e.id}: ${c}`),
        )
    : [];
  return {
    inView: {
      sheetOnly: s.record ? setDiff(sheetIds, recIds) : [],
      recordOnly: s.record ? setDiff(recIds, sheetIds) : [],
      treeOnly: s.tree ? setDiff(treeIds, sheetIds) : [],
      notInTree: s.tree ? setDiff(sheetIds, treeIds) : [],
    },
    names,
    kinds,
    looks,
    states: s.record
      ? { planOnly: setDiff(plan, carried), recordOnly: setDiff(carried, plan) }
      : { planOnly: [], recordOnly: [] },
    recordMoved: s.flags.includes('record_moved'),
    toPrev:
      prevUse?.relation && s.relations.toPrev && prevUse.relation !== s.relations.toPrev
        ? `${s.prev}: plan ${prevUse.relation} / sheet ${s.relations.toPrev}`
        : null,
    coloursTwice,
    colourTwoWays: s.style.oneColour ? colourTwoWays(p.prompt, s.style.told) : [],
  };
}

// ── 1. footprints ────────────────────────────────────────────────────────────────────────────────

/** One picture a clean-up acts on: what changes when it is off, and the runs of words it removes and adds today. */
export type FootprintChange = {
  dream: string;
  picture: string;
  kind: 'cut' | 'ghost';
  /** The part of the prompt, the plan field, or 'images'. */
  what: string;
  /** Runs of words that come into the prompt with the clean-up off: what it removes today. */
  removes: string[];
  /** Runs of words that go with it off: what it puts in today. */
  adds: string[];
  diff: string;
};

export type Footprint = {
  name: Cleanup;
  says: string;
  moments: number;
  ghosts: number;
  dreams: number;
  /** Pictures by what changes in them: a part of the prompt, a plan field, the images. */
  by: Record<string, number>;
  changes: FootprintChange[];
};

/** Where one dream's pictures differ with a clean-up off: every change, with the words it removes and adds. */
export function footprintOf(dream: string, today: DumpDream, off: DumpDream): FootprintChange[] {
  const kind = new Map(today.pictures.map((p) => [p.id, p.kind]));
  return atomicChanges(diffDumps({ dreams: { [dream]: today } }, { dreams: { [dream]: off } })).map((c) => {
    const runs = c.kind === 'paragraph' ? wordRuns(c.before, c.after) : { gone: [c.before], added: [c.after] };
    return {
      dream,
      picture: c.picture,
      kind: kind.get(c.picture) ?? 'cut',
      what: c.what,
      removes: runs.added.filter(Boolean),
      adds: runs.gone.filter(Boolean),
      diff: c.kind === 'paragraph' ? wordDiff(c.before, c.after) : `${c.before} -> ${c.after}`,
    };
  });
}

/** A footprint's counts from its changes. */
export function summarise(name: Cleanup, changes: FootprintChange[]): Footprint {
  const pictures = new Map<string, FootprintChange>();
  const by: Record<string, number> = {};
  const seen = new Set<string>();
  for (const c of changes) {
    pictures.set(`${c.dream} ${c.picture}`, c);
    const k = `${c.dream} ${c.picture} ${c.what}`;
    if (seen.has(k)) continue;
    seen.add(k);
    by[c.what] = (by[c.what] ?? 0) + 1;
  }
  const ps = [...pictures.values()];
  return {
    name,
    says: CLEANUPS[name],
    moments: ps.filter((c) => c.kind === 'cut').length,
    ghosts: ps.filter((c) => c.kind === 'ghost').length,
    dreams: new Set(ps.map((c) => c.dream)).size,
    by,
    changes,
  };
}

// ── a dream read ─────────────────────────────────────────────────────────────────────────────────

const refuse = async () => {
  throw new Error('this eval never calls a model');
};

/** A dream with what its moments imply, from the cache only: `missing` where a reading was not there. */
export async function withCachedImplied(s: Session): Promise<{ session: Session; missing: boolean }> {
  try {
    const read = await withImplied(s, { write: refuse as never, jev: refuse as never, jevModel: JEV_MODEL() });
    return read.asked ? { session: s, missing: true } : { session: read.session, missing: false };
  } catch {
    return { session: s, missing: true };
  }
}

/** The readings 2-4 of one rebuilt dream, moment by moment. */
export type MomentReading = {
  dream: string;
  moment: string;
  facts: number;
  twiceOnSheet: { text: string; from: string }[];
  saidTwice: SaidTwice[];
  action: ActionFinding[];
  ids: string[];
  disagree: Disagreement | null;
};

/** Ids standing as words in an in-between picture's prompt (their instruction is named after the moment's words). */
export type GhostIds = { dream: string; picture: string; ids: string[]; colourTwoWays?: string[] };

/** The colours an in-between picture's style keeps exactly, read off its "Colours:" line as sent. */
const keptIn = (prompt: string): string[] =>
  (
    (prompt.split('\n').find((l) => l.startsWith('Colours:')) ?? '').match(
      /keeps it exactly(?:, as said above)?: (.*?)\.(?:\s|$)/,
    )?.[1] ?? ''
  )
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);

export function readDream(id: string, session: Session, r: Rebuilt): { moments: MomentReading[]; ghosts: GhostIds[] } {
  const inputs = recordInputsOf(session);
  let rec: StoryRecord | null = null;
  try {
    rec = storyRecord(r.b, inputs.items, session.draft?.readings, { words: inputs.words, style: session.style }).record;
  } catch {
    rec = null;
  }
  const ids = [
    ...r.b.people.map((x) => x.id),
    ...r.b.places.map((x) => x.id),
    ...r.b.things.map((x) => x.id),
    ...r.b.scenes.flatMap((sc) => sc.moments.map((m) => m.id)),
  ];
  const nameOf = new Map([...r.b.people, ...r.b.places, ...r.b.things].map((x) => [x.id, pictureName(x.name)]));
  const style = session.style as StyleOption;
  const moments = r.pictures.flatMap((p): MomentReading[] => {
    if (p.kind !== 'cut' || !p.sheet) return [];
    const facts = factsOf(p.sheet);
    return [
      {
        dream: id,
        moment: p.id,
        facts: facts.length,
        twiceOnSheet: facts.filter(twoSources).map((f) => ({ text: f.text, from: f.sources.join(' ') })),
        saidTwice: saidTwice(p.prompt, facts),
        action: actionFindings(
          p.prompt,
          p.sheet,
          (p.sheet.record?.gone ?? []).map((g) => ({ id: g, name: nameOf.get(g) ?? g })),
        ),
        ids: idsInWords(p.prompt, ids),
        disagree: disagreementsOf(p, rec, style),
      },
    ];
  });
  // In-between pictures: ids in words, and a colour the dream gives said two ways (S6 row 13).
  const ghosts = r.pictures
    .filter((p) => p.kind === 'ghost')
    .map((p) => ({
      dream: id,
      picture: p.id,
      ids: idsInWords(p.prompt, ids),
      colourTwoWays: colourTwoWays(p.prompt, keptIn(p.prompt)),
    }))
    .filter((g) => g.ids.length || g.colourTwoWays.length);
  return { moments, ghosts };
}

/** Counts over every moment read. */
export function totalsOf(readings: MomentReading[], ghosts: GhostIds[] = []) {
  const count = <T>(xs: T[], key: (x: T) => string) => {
    const out: Record<string, number> = {};
    for (const x of xs) out[key(x)] = (out[key(x)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(out).sort(([, a], [, b]) => b - a));
  };
  const twice = readings.flatMap((m) => m.saidTwice);
  const acts = readings.flatMap((m) => m.action.map((a) => ({ ...a, moment: `${m.dream} ${m.moment}` })));
  const d = readings.map((m) => m.disagree).filter((x): x is Disagreement => !!x);
  const byKind = (k: ReturnType<typeof kindOfTwice>) => ({
    moments: readings.filter((m) => m.saidTwice.some((x) => kindOfTwice(x) === k)).length,
    facts: twice.filter((x) => kindOfTwice(x) === k).length,
  });
  return {
    moments: readings.length,
    facts: readings.reduce((a, m) => a + m.facts, 0),
    saidTwice: {
      moments: readings.filter((m) => m.saidTwice.length).length,
      facts: twice.length,
      outsideShot: {
        moments: readings.filter((m) => m.saidTwice.some(outsideShot)).length,
        facts: twice.filter(outsideShot).length,
      },
      kinds: {
        look: byKind('look'),
        colour: byKind('colour'),
        state: byKind('state'),
        story: byKind('story'),
        shot: byKind('shot'),
      },
      where: count(twice, whereSaid),
      from: count(twice, fromWhat),
    },
    twiceOnSheet: {
      moments: readings.filter((m) => m.twiceOnSheet.length).length,
      facts: readings.reduce((a, m) => a + m.twiceOnSheet.length, 0),
      from: count(
        readings.flatMap((m) => m.twiceOnSheet),
        (x) => [...new Set(x.from.split(' ').map((s) => s.split(':')[0]))].sort().join('+'),
      ),
    },
    action: {
      moments: new Set(acts.filter((a) => a.rule !== 'unnamed').map((a) => a.moment)).size,
      rules: Object.fromEntries(
        (['sequence', 'unseen', 'you', 'story', 'gone_named', 'turned_named', 'unnamed'] as const).map((k) => [
          k,
          new Set(acts.filter((a) => a.rule === k).map((a) => a.moment)).size,
        ]),
      ),
    },
    ids: {
      moments: readings.filter((m) => m.ids.length).length,
      ghosts: ghosts.filter((g) => g.ids.length).length,
      ids: count(
        [...readings, ...ghosts].flatMap((m) => m.ids),
        (x) => x,
      ),
    },
    disagree: {
      inView: {
        record: d.filter((x) => x.inView.sheetOnly.length || x.inView.recordOnly.length).length,
        tree: d.filter((x) => x.inView.treeOnly.length || x.inView.notInTree.length).length,
      },
      names: d.filter((x) => x.names.length).length,
      kinds: d.filter((x) => x.kinds.length).length,
      looks: { moments: d.filter((x) => x.looks.length).length, elements: d.reduce((a, x) => a + x.looks.length, 0) },
      states: d.filter((x) => x.states.planOnly.length || x.states.recordOnly.length).length,
      recordMoved: d.filter((x) => x.recordMoved).length,
      toPrev: d.filter((x) => x.toPrev).length,
      coloursTwice: d.filter((x) => x.coloursTwice.length).length,
      colourTwoWays: d.filter((x) => x.colourTwoWays.length).length,
      colourTwoWaysInBetween: ghosts.filter((g) => g.colourTwoWays?.length).length,
    },
  };
}

export const RUNS = join(DIR, 'runs', 'retire');

if (import.meta.main) {
  const args = process.argv.slice(2);
  const valueOf = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const listOf = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0) return [];
    const out: string[] = [];
    for (const a of args.slice(i + 1)) {
      if (a.startsWith('--')) break;
      out.push(a);
    }
    return out;
  };
  const label = valueOf('--label') ?? 'latest';
  const live = args.includes('--live');
  const only = listOf('--only');
  const unknown = only.filter((x) => !(x in CLEANUPS));
  if (unknown.length) {
    console.error(`no clean-up called ${unknown.join(', ')} (${CLEANUP_NAMES.join(', ')})`);
    process.exit(1);
  }
  const names = (args.includes('--checks') ? [] : only.length ? only : CLEANUP_NAMES) as Cleanup[];
  const wanted = listOf('--dreams');
  const { recordMode } = await import('../record');
  const imply = recordMode() === 'on' && !args.includes('--no-imply');
  const sources: Dream[] = live
    ? liveDreams(dataDir())
        .filter((x) => !wanted.length || wanted.includes(x.id))
        .map(readLive)
    : (wanted.length ? wanted : frozenDreams()).map((id) => loadDream(id, false));

  const changes = new Map<Cleanup, FootprintChange[]>(names.map((n) => [n, []]));
  const readings: MomentReading[] = [];
  const ghostIds: GhostIds[] = [];
  const missing: string[] = [];
  const typedMissing: string[] = [];
  const failed: string[] = [];
  let pictures = 0;
  let momentsN = 0;
  let dreamsN = 0;
  for (const d of sources) {
    if (!d.session.draft?.breakdown || !d.session.style) continue;
    let session = d.session;
    if (imply) {
      const read = await withCachedImplied(session);
      if (read.missing) missing.push(d.id);
      session = read.session;
    }
    // With S6's one prompt builder on, each moment's typed reading, from its cache only.
    if (oneBuilder()) {
      const typed = await withTyped(session);
      typedMissing.push(...typed.missing.map((m) => `${d.id} ${m}`));
      session = typed.session;
    }
    let r: Rebuilt;
    try {
      r = rebuild(session);
    } catch (e) {
      failed.push(`${d.id}: ${String(e instanceof Error ? e.message : e).slice(0, 200)}`);
      continue;
    }
    dreamsN++;
    pictures += r.pictures.length;
    momentsN += r.pictures.filter((p) => p.kind === 'cut').length;
    const read = readDream(d.id, session, r);
    readings.push(...read.moments);
    ghostIds.push(...read.ghosts);
    const today = dumpOf(r);
    for (const n of names) {
      const off = withRetired([n], () => dumpOf(rebuild(session)));
      changes.get(n)?.push(...footprintOf(d.id, today, off));
    }
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  const footprints = Object.fromEntries(names.map((n) => [n, summarise(n, changes.get(n) ?? [])]));
  const totals = totalsOf(readings, ghostIds);
  const run = {
    label,
    at: new Date().toISOString(),
    commit: commitOf(),
    switches: switches(),
    from: live ? 'live' : 'frozen',
    implied: imply ? 'from the cache' : 'none',
    dreams: dreamsN,
    moments: momentsN,
    pictures,
    missing,
    ...(oneBuilder() ? { typedMissing } : {}),
    failed,
    totals,
    footprints,
    readings,
    ghostIds,
  };
  mkdirSync(RUNS, { recursive: true });
  writeFileSync(join(RUNS, `${label}.json`), `${JSON.stringify(run, null, 1)}\n`);
  const lines = [
    `${label}: ${dreamsN} dreams (${run.from}), ${momentsN} moments, ${pictures - momentsN} in-between pictures; switches ${JSON.stringify(run.switches)}; implied readings ${run.implied}${missing.length ? ` (not cached, measured without: ${missing.join(', ')})` : ''}`,
    ...failed.map((f) => `  could not be rebuilt: ${f}`),
    ...(oneBuilder()
      ? [
          `typed readings from the cache (the one prompt builder): ${typedMissing.length ? `not cached, read as no facts: ${typedMissing.join(', ')}` : 'every moment'}`,
        ]
      : []),
    '',
    'Footprints: pictures that change with each clean-up off (moments, in-between pictures, dreams; by part)',
    ...Object.values(footprints).map(
      (f) =>
        `  ${f.name.padEnd(11)} ${String(f.moments).padStart(4)} moments ${String(f.ghosts).padStart(3)} in-between ${String(f.dreams).padStart(3)} dreams  ${Object.entries(
          f.by,
        )
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')}`,
    ),
    '',
    `Each fact once: ${totals.facts} facts over ${totals.moments} moments; said twice or more in ${totals.saidTwice.moments} moments, ${totals.saidTwice.facts} facts (leaving out the shot's words: ${totals.saidTwice.outsideShot.moments} moments, ${totals.saidTwice.outsideShot.facts} facts)`,
    `  by kind (moments, facts): ${Object.entries(totals.saidTwice.kinds)
      .map(([k, v]) => `${k} ${v.moments}/${v.facts}`)
      .join(', ')}`,
    `  where (the most): ${JSON.stringify(Object.fromEntries(Object.entries(totals.saidTwice.where).slice(0, 12)))}`,
    `  from (the most): ${JSON.stringify(Object.fromEntries(Object.entries(totals.saidTwice.from).slice(0, 12)))}`,
    `  carried by two kinds of field of the sheet: ${totals.twiceOnSheet.moments} moments, ${totals.twiceOnSheet.facts} facts: ${JSON.stringify(totals.twiceOnSheet.from)}`,
    `Action: ${totals.action.moments} moments say something no picture shows at one instant: ${JSON.stringify(totals.action.rules)}`,
    `Ids in words: ${totals.ids.moments} moments, ${totals.ids.ghosts} in-between pictures ${JSON.stringify(totals.ids.ids)}`,
    `Two sources disagree (moments): ${JSON.stringify(totals.disagree)}`,
  ];
  const detail = [
    ...Object.values(footprints).flatMap((f) => [
      `\n══ ${f.name}: ${f.says}`,
      ...f.changes.map((c) => `  ${c.dream} ${c.picture} ${c.what}: ${c.diff.replace(/\n/g, ' / ')}`),
    ]),
    '\n══ said twice',
    ...readings.flatMap((m) =>
      m.saidTwice.map(
        (x) =>
          `  ${m.dream} ${m.moment}: "${x.text}" x${x.times} in ${x.sections.join(', ')} (from ${x.sources.join(' ')})`,
      ),
    ),
    '\n══ the action',
    ...readings.flatMap((m) => m.action.map((a) => `  ${m.dream} ${m.moment}: ${a.rule} "${a.said}"`)),
    '\n══ ids in words',
    ...readings.filter((m) => m.ids.length).map((m) => `  ${m.dream} ${m.moment}: ${m.ids.join(', ')}`),
    ...ghostIds.filter((g) => g.ids.length).map((g) => `  ${g.dream} ${g.picture} (in-between): ${g.ids.join(', ')}`),
    '\n══ two sources disagree',
    ...readings.flatMap((m) => (m.disagree ? [`  ${m.dream} ${m.moment}: ${JSON.stringify(m.disagree)}`] : [])),
  ];
  writeFileSync(join(RUNS, `${label}.txt`), `${[...lines, ...detail].join('\n')}\n`);
  console.log(lines.join('\n'));
  console.log(`written ${join(RUNS, `${label}.json`)} and .txt`);
}
