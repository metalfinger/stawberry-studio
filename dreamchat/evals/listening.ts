// The listening test (HARNESS_PLAN.md, step S8): every reply Berry sent in a simulated conversation,
// scored against the move and brief code gave it, the questions it asked and the details it brought in,
// the facts the conversation then recorded as said, and the flow around the retelling, the ways of
// drawing it and the profiles. Nothing is drawn and no conversation is changed: they are only read.
//
//   bun --env-file=$HOME/.config/strawberry/dreamchat.env run evals/listening.ts --label before \
//     --data evals/listening-before --summary evals/listening-before-scores.json
//   bun run evals/listening.ts --label s8 --data <folder> --against evals/listening-before-scores.json
//   bun run evals/listening.ts --label fresh runs/sim-<stamp>-<dreams>-low.json   (a simulate.ts report)
//   bun run evals/listening.ts --audit        (the hand-labelled replies, evals/listening-audit.json)
//
// The before (26 Sep): the 20 dreams with a simulated conversation, simulated twice each at the base the
// step starts from, with nothing paid for, frozen in evals/listening-before/ (--freeze) and scored into
// evals/listening-before-scores.json. The same for the step's own conversations:
//
//   DREAMCHAT_PROVIDER=fake DREAMCHAT_JUDGE=off bun --env-file=$HOME/.config/strawberry/dreamchat.env \
//     run simulate.ts dreams/<a>.md dreams/<b>.md … --max 30
//   bun run evals/listening.ts --freeze runs/listening-after runs/sim-<stamp>-<dreams>-low.json
//   bun run evals/listening.ts --label after --data runs/listening-after --against evals/listening-before-scores.json
//
// (--max 30 reaches the style offer, the retelling and the profiles; profiles need the Strawberry engine,
// STRAWBERRY_PYTHON, and a DREAMCHAT_STRAWBERRY_HOME of their own.)
//
// Which conversations: --data names a folder of conversations (frozen, or a dreamchat folder with state/
// and its fake-picture replays under runs/); without it, the saved conversations (DREAMCHAT_DATA, this
// checkout's state/, or another worktree's; see evals/saved.ts). Arguments narrow it: session ids,
// session files, folders, simulate.ts reports, or dreams (dreams/<name>.md or a name). Only simulated
// conversations are read. A replay repeats its source word for word up to the choice of how it looks:
// those replies are marked copied and never counted; replays are shown apart from the headline.
//
// What is scored:
// 1. Move compliance: one yes-or-no question to Jev per reply, shaped by its move. The target is on the
//    listening turns; the rest are shown. A thread older than the message the reply answers passes on the
//    thread or on the newest message: answering what was just said is not a fault of the reply.
// 2. On every listening reply: whether it leads (Jev, the whole reply: a detail the person had not given,
//    asked or stated), whether it asks an either/or question (Jev), how many questions it asks; and on
//    every reply, questions before and after the one-question repair, and where the brief said to ask none.
// 3. Facts: every clause the breakdown or a sketch's profile marks said (a moment's action whole), asked
//    against everything the person said, one fact per question, said of what it is about (never a field's
//    stem, which changed the claim); also against the dream file, and whether the person agreed to it.
//    Coverage: the facts pictures need that each dream file holds (evals/listening-facts.json), whether
//    the person told each, if not whether Berry asked, and if told whether the conversation kept it as said.
// 4. Flow: the ways of drawing it kept; the retelling, and whether it ends with a list covering every
//    moment of the breakdown; every answer to a profile or a retelling, clear or not, against the reading
//    the turn recorded; how many conversations reached the retelling, the style offer and the profiles.
//
// Jev is asked by one model by name (JEV_EVAL_MODEL, pinned as the prompt cases pin it); questions over
// one state go in one call; answers are kept by the hash of the model, the question and its state
// (runs/listening/jev-cache.json). --no-ask asks nothing new. Results: runs/listening/<label>.json, with the
// data folder, the hash of every conversation and of the question wordings; --summary <path> writes the
// counts alone; --against <label or file> compares dream by dream; --flags lists every remaining flag.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import type { Answer, JevFn, Question } from '../jev';
import { type Move, moveKey } from '../lib';
import { type Breakdown, type Detail, VAGUE } from '../producer';
import type { Entry, Session, TurnRecord } from '../session';
import { commitOf, DIR, dataDir, sha256, switches } from './saved';

// ── the conversation, reply by reply ─────────────────────────────────────────────────────────────

/** Which part of the conversation a move belongs to. */
export type Group = 'listen' | 'retell' | 'offer' | 'style' | 'build' | 'pictures' | 'close';
export const GROUPS: readonly Group[] = ['listen', 'retell', 'offer', 'style', 'build', 'pictures', 'close'];
/** The conversation before the pictures, shown beside the listening target. */
export const S8_GROUPS: readonly Group[] = ['listen', 'retell', 'offer', 'style', 'build'];

export function groupOf(kind: Move['kind']): Group {
  switch (kind) {
    case 'open_ended':
    case 'follow':
    case 'explore_thread':
    case 'circle_back':
    case 'probe_goal':
    case 'acknowledge':
      return 'listen';
    case 'retell':
    case 'retell_check':
    case 'take_correction':
      return 'retell';
    case 'offer_visualize':
    case 'offer_later':
    case 'keep':
      return 'offer';
    case 'choose_style':
    case 'style_help':
      return 'style';
    case 'start':
    case 'confirm_profile':
    case 'profile_check':
    case 'build_done':
      return 'build';
    case 'while_drawing':
    case 'frames_drawing':
    case 'sheets_done':
    case 'all_done':
    case 'ask_which':
      return 'pictures';
    case 'wrap':
      return 'close';
  }
}

/** One reply and everything it was given. */
export type Reply = {
  turn: number;
  move: Move;
  /** The move as the conversation keys it ("probe_goal:look"). */
  key: string;
  rule: string;
  /** The phase the move left the conversation in. */
  phase: string;
  brief: string;
  group: Group;
  /** What the person read, after the one-question repair. */
  text: string;
  /** What the host wrote before the repair, where the turn's detail is kept. */
  raw: string | null;
  /** Everything the person had said when it was written, the message it answers last. */
  said: string[];
  /** The message it answers (none for the opening). */
  last: string | null;
  /** A replay's reply that is its source conversation's, word for word. */
  copied: boolean;
};

/** The host's words before the repair, from the raw JSON it returned. */
export function rawText(hostRaw: string | null | undefined): string | null {
  if (!hostRaw) return null;
  try {
    const v = JSON.parse(hostRaw) as unknown;
    const list = Array.isArray(v) ? v : (v as { response?: unknown } | null)?.response;
    if (Array.isArray(list)) return list.filter((x): x is string => typeof x === 'string').join('\n\n');
    if (typeof list === 'string') return list;
  } catch {
    // Not JSON: the host's text as it came.
  }
  return hostRaw;
}

/**
 * Every reply of a conversation, with the move and brief it was given. The assistant's messages line
 * up one to one with the turn records, the opening first (as simulate.ts reports them); turn t
 * answers the person's t-th message.
 */
export function repliesOf(s: Session, raw: (turn: number) => string | null, source?: Session | null): Reply[] {
  const assistant = s.transcript.filter((e) => e.role === 'assistant').map((e) => e.content);
  const person = s.transcript.filter((e) => e.role === 'user').map((e) => e.content);
  const theirs = source ? source.transcript.filter((e) => e.role === 'assistant').map((e) => e.content) : [];
  return s.turns.map((t, i) => ({
    turn: t.turn,
    move: t.move,
    key: moveKey(t.move),
    rule: t.rule,
    phase: t.phase,
    brief: t.brief ?? s.briefs?.[t.turn] ?? '',
    group: groupOf(t.move.kind),
    text: assistant[i] ?? '',
    raw: raw(t.turn),
    said: person.slice(0, t.turn),
    last: t.turn > 0 ? (person[t.turn - 1] ?? null) : null,
    copied: !!source && theirs[i] !== undefined && theirs[i] === assistant[i],
  }));
}

// ── code checks ──────────────────────────────────────────────────────────────────────────────────

/** The questions a reply asks: every sentence that ends in a question mark. */
export function questionsOf(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((x) => x.trim())
    .filter((x) => /\?["'”’)\]]*$/.test(x));
}

/** The ways of drawing it a choose_style brief offers: each one's name and its line. */
export function offeredStyles(brief: string): { name: string; line: string }[] {
  const lead = "whether they'd describe their own: ";
  const at = brief.indexOf(lead);
  if (at < 0) return [];
  const list = brief.slice(at + lead.length).split('\n')[0];
  return [...list.matchAll(/(?:^|;\s)[a-z]\)\s([^:]+?):\s(.*?)(?=;\s[a-z]\)\s|$)/g)].map((m) => ({
    name: m[1].trim(),
    line: m[2].replace(/\.+$/, '').trim(),
  }));
}

const NAME_STOP = new Set(
  'a an the of in on to as and or with like it its is was be at by for from that this'.split(' '),
);
const nameWords = (x: string) =>
  x
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !NAME_STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));

/** Whether a reply names a way of drawing it by the name's own words: a cross-check beside Jev's reading. */
export function mentions(reply: string, name: string): boolean {
  const want = nameWords(name);
  if (!want.length) return false;
  const have = new Set(nameWords(reply));
  return want.filter((w) => have.has(w)).length / want.length >= 0.6;
}

/** A line that is an item of a list: "- …", "• …", "1. …", "2) …", "a) …". */
const ITEM = /^\s*(?:[-*•–]|\d{1,2}[.)]|[a-z][.)])\s+\S/;

/**
 * The list a message ends with, its closing question aside: items on separate lines, or numbered on one
 * line. Fewer than `min` items is no list.
 */
export function endingList(text: string, min = 3): string[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  while (lines.length && (lines.at(-1) ?? '').includes('?') && !ITEM.test(lines.at(-1) ?? '')) lines.pop();
  const items: string[] = [];
  for (let i = lines.length - 1; i >= 0 && ITEM.test(lines[i]); i--)
    items.unshift(lines[i].replace(ITEM, (m) => m.slice(-1)));
  if (items.length >= min) return items.map((x) => x.trim());
  const last = lines.at(-1) ?? '';
  const inline = last.split(/(?:^|\s)\d{1,2}[.)]\s+/).slice(1);
  return inline.length >= min ? inline.map((x) => x.trim()) : [];
}

/** Whether a message ends with a list of at least `min` items. */
export const endsWithList = (text: string, min = 3) => endingList(text, min).length > 0;

/** A brief that says to ask nothing. */
const NO_ASK = /Don't ask anything|No question needed|no question needed|Do not ask another question/;

/** A person's answer that only agrees: what a leading question gets. */
const AGREES = /^\s*(?:yes|yeah|yep|yup|yea|mm+|uh[- ]huh|i think so|probably|maybe|sure|right)\b/i;

/** How a turn read its message: the profile reply, or the answer to a retelling. */
export function readingOf(kind: 'profile' | 'retell', t: Pick<TurnRecord, 'rule'>, signals?: Record<string, unknown>) {
  if (kind === 'profile') {
    const v = signals?.profile_reply;
    if (typeof v === 'string') return v;
    if (/^B2:/.test(t.rule)) return 'unclear';
    return t.rule.match(/profile (confirmed|changes|you_choose|unclear)/)?.[1] ?? 'unknown';
  }
  if (/^R4:/.test(t.rule)) return 'goes_on';
  if (/^R3:/.test(t.rule)) return 'unclear';
  if (/^R1:/.test(t.rule)) return 'confirmed';
  if (/corrected/.test(t.rule)) return 'corrected';
  if (/added more/.test(t.rule)) return 'added_more';
  const v = signals?.retell_reply;
  return typeof v === 'string' ? v : 'unknown';
}

/** The chance the saved choice gave to any answer that settles the question: everything but "unclear". */
export function settledOf(a: Answer | undefined | null): number | null {
  if (!a || a.type !== 'choice') return null;
  return 1 - (a.probabilities.unclear ?? 0);
}

/** Whether an explore_thread move names a message older than the one its reply answers (message 2t-1). */
export function staleThread(move: Move, turn: number): boolean | undefined {
  if (move.kind !== 'explore_thread') return undefined;
  const idx = Number(move.threadId.match(/^msg_(\d+)$/)?.[1] ?? Number.NaN);
  return Number.isFinite(idx) && idx < 2 * turn - 1;
}

// ── facts ────────────────────────────────────────────────────────────────────────────────────────

/** A piece of a look that ends on a word describing what comes next: "short, dark hair" is one. */
const ADJ_END =
  /(?:^|\s)(?:large|small|little|big|tiny|huge|vast|short|long|tall|thin|round|smooth|rough|soft|dark|pale|bright|slender|wide|narrow|flat|low|high|heavy|square|old|young|warm|cold|deep|plain|simple|curly|straight|shiny|broad)$/i;

/** A value cut into the clauses it claims, each one fact. */
export function clausesOf(text: string): string[] {
  const out: string[] = [];
  let open = '';
  for (const piece of text.split(/(\s*;\s*|,\s+|\.\s+|:\s+)/)) {
    if (/^(?:\s*;\s*|,\s+|\.\s+|:\s+)$/.test(piece)) {
      if (open && ADJ_END.test(open.trim()) && piece.trim() === ',') open += ', ';
      else if (open) {
        out.push(open);
        open = '';
      }
      continue;
    }
    open += piece;
  }
  if (open) out.push(open);
  return out
    .map((x) =>
      x
        .replace(/[.\s]+$/, '')
        .replace(/^(?:and|or|but)\s+/i, '')
        .trim(),
    )
    .filter((x) => x && !VAGUE.test(x) && !/^(?:the dreamer|you|themselves|themself|the person)$/i.test(x));
}

/**
 * A clause marked said: what it says, what it is said of, and every field it is in. It is asked as said
 * of its subject, never inside a field's stem: "the light in the tiny lift is stuffy" was a claim nobody
 * made about "stuffy", said of the lift (review, 26 Sep).
 */
export type SaidFact = { about: string; claim: string; statement: string; from: string[] };

const LOOK_ABOUT: Record<string, string> = {
  colours: 'the colours of their dream',
  light: 'the light in their dream',
  texture: 'how their dream looked',
};

/** Where a said fact comes from: the breakdown's look, a person, place or thing, a moment, or a sketch's profile. */
export const sourceOf = (from: string) => from.split(':')[0];

/**
 * Every clause the conversation marks as said: the breakdown's details, its moments (each action whole,
 * one thing that happened), and the profiles the sketches were drawn from (a correction's revision marks
 * all it changed as said). One claim about one subject once, with every field it came from.
 */
export function saidFacts(s: Pick<Session, 'draft' | 'build'>): SaidFact[] {
  const found = new Map<string, SaidFact>();
  const put = (about: string, claim: string, from: string) => {
    const statement = `${about}: ${claim}`;
    const k = statement.toLowerCase();
    const f = found.get(k) ?? { about, claim, statement, from: [] };
    if (!f.from.includes(from)) f.from.push(from);
    found.set(k, f);
  };
  const add = (about: string, d: Detail | undefined, from: string) => {
    if (!d?.said || typeof d.value !== 'string') return;
    for (const c of clausesOf(d.value)) put(about, c, from);
  };
  const b: Breakdown | undefined = s.draft?.breakdown;
  if (b) {
    for (const [k, d] of Object.entries(b.look ?? {})) add(LOOK_ABOUT[k] ?? `their dream's ${k}`, d, `look:${k}`);
    for (const p of b.people ?? []) {
      const name = p.is_dreamer ? 'the dreamer themselves' : p.name;
      for (const [k, d] of Object.entries(p.fields ?? {})) add(name, d, `person:${p.id}.${k}`);
    }
    for (const l of b.places ?? [])
      for (const [k, d] of Object.entries(l.fields ?? {})) add(l.name, d, `place:${l.id}.${k}`);
    for (const t of b.things ?? [])
      for (const [k, d] of Object.entries(t.fields ?? {})) add(t.name, d, `thing:${t.id}.${k}`);
    for (const sc of b.scenes ?? [])
      for (const m of sc.moments ?? [])
        if (m.said !== false && m.action?.trim())
          put('what happened in their dream', m.action.trim().replace(/\.$/, ''), `moment:${m.id}`);
  }
  for (const it of s.build?.items ?? []) {
    if (it.kind === 'cut' || it.kind === 'ghost') continue;
    const name = it.isDreamer ? 'the dreamer themselves' : it.name;
    for (const [k, d] of Object.entries(it.fields ?? {})) add(name, d, `sketch:${it.id}.${k}`);
  }
  return [...found.values()];
}

/** The breakdown's moments, in order: what a retelling's closing list must cover. */
export const momentsOf = (s: Pick<Session, 'draft'>) =>
  (s.draft?.breakdown?.scenes ?? []).flatMap((sc) => sc.moments ?? []).filter((m) => m.action?.trim());

/** The facts a dream file holds that pictures need, written by hand (evals/listening-facts.json). */
export type DreamFact = { id: string; kind: 'who' | 'where' | 'look' | 'light' | 'size' | 'position'; fact: string };
export type FactsFile = { about: string; dreams: Record<string, DreamFact[]> };
export const FACTS_FILE = join(import.meta.dir, 'listening-facts.json');
export const loadFacts = (): FactsFile => JSON.parse(readFileSync(FACTS_FILE, 'utf8')) as FactsFile;

/** What a dream file tells the simulated dreamer: its title and source lines left out, as simulate.ts gives it. */
export function dreamFileText(name: string): string | null {
  const path = join(DIR, 'dreams', `${name}.md`);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8')
    .replace(/^#.*\n/, '')
    .replace(/^Source:.*\n/m, '')
    .trim();
}

// ── the questions Jev answers ────────────────────────────────────────────────────────────────────

const yesNo = (instructions: string, yes: string, no: string): Question => ({
  type: 'noul',
  instructions,
  criteria: { true: yes, false: no },
});

/** What each goal asks about, in the words a question to Jev can carry. */
export const TOPIC: Record<string, string> = {
  telling: 'what happened in the dream: its events, or what happened next',
  places: 'where the dream happened: what kind of place it was',
  people: 'who was in the dream besides them: people, animals or creatures, or who someone was to them',
  you_in_it: 'how they themselves were in the dream: as themselves, as someone else, or watching from outside',
  feeling: 'how the dream felt to them',
  key_moment: 'the one moment of the dream that stayed with them, the one they would pause it on',
  look: 'how the dream looked: its colours, its light, the time of day or its texture',
  things: 'whether any object or thing in the dream mattered to them',
  strange: 'something strange, impossible or dreamlike in it that they simply accepted',
  beginning: 'how the dream began: the first thing they remember, or where they were at the start',
  ending: 'how the dream ended, or how they woke up',
  sound: 'sounds, voices or music in the dream',
};

// Every question's criteria say what counts, never "the reply does that": with the generic pair, "would you
// like to see it drawn?" read 0.49 and 0.45 as asking whether they would like to see it drawn (audit, 26 Sep).

/** The profile a start or confirm_profile brief puts to them: its name, or the dreamer asked how to be drawn. */
function profileAsked(brief: string): { name: string } | { dreamer: true } | null {
  if (/ask gently how they'd like to be drawn/.test(brief)) return { dreamer: true };
  const m = brief.match(/describe how you picture (.+?) on their own/);
  return m ? { name: m[1] } : null;
}

/** The message a thread is: its move names it msg_<index into the transcript>. */
function threadText(s: Pick<Session, 'transcript'>, threadId: string, brief: string): string {
  const idx = Number(threadId.match(/^msg_(\d+)$/)?.[1] ?? Number.NaN);
  const msg = Number.isFinite(idx) ? s.transcript[idx]?.content : undefined;
  if (msg) return msg.slice(0, 400);
  return brief.match(/→ (.+?)\. (?:Be curious|Return to it)/)?.[1] ?? brief.match(/"([^"]+)" earlier/)?.[1] ?? threadId;
}

/** The one thing a picture turn's brief asks for, as a question about the reply. */
function picturesQuestion(brief: string): Question {
  let m = brief.match(/Ask them now, in one short question about (.+?), and don't say/);
  if (m)
    return yesNo(
      `Does \`listener_reply\` ask the person one short question about how ${m[1]} looks?`,
      'it asks how that looks',
      'it asks nothing about it, or says it is on its way',
    );
  if (/The moment they said they'd pause on is up on the right now/.test(brief))
    return yesNo(
      'Does `listener_reply` tell the person that the moment they said they would pause on is up now, and ask whether that is how they saw it?',
      'it says that moment is up and asks whether it is how they saw it',
      'it does not say that moment is up, or does not ask about it',
    );
  if (/More of the dream is up on the right \(/.test(brief))
    return yesNo(
      'Does `listener_reply` tell the person that more of the dream is up now, and ask whether it looks the way they remember?',
      'it says more pictures are up and asks whether they look right',
      'it does not say more is up, or does not ask about it',
    );
  m = brief.match(/(?:\. |^|\n|while_drawing\. )([^.\n]+?) (?:is|are) up on the right now: ask if it looks/);
  if (m)
    return yesNo(
      `Does \`listener_reply\` tell the person that ${m[1]} is up now, and ask whether it looks the way they remember?`,
      'it says that is up and asks whether it looks right',
      'it does not say that is up, or does not ask about it',
    );
  m = brief.match(/Say you're redrawing (.+?) with their change/);
  if (m)
    return yesNo(
      `Does \`listener_reply\` say that ${m[1]} is being drawn again with their change?`,
      'it says that is being drawn again',
      'it does not say that is being drawn again',
    );
  return yesNo(
    'Does `listener_reply` tell the person that the pictures are still on their way, without asking them about the dream?',
    'it says the pictures are still coming, and asks nothing about the dream',
    'it asks about the dream, or says nothing about the pictures coming',
  );
}

/** The one yes-or-no question that says whether a reply did its move. */
export function complianceQuestion(r: Reply, s: Pick<Session, 'transcript'>): Question {
  const m = r.move;
  switch (m.kind) {
    case 'open_ended':
      return r.rule === 'opening' || r.turn === 0
        ? yesNo(
            'Is `listener_reply` a greeting that invites the person to tell their dream however it comes back to them, without asking about any particular detail of it?',
            'it invites them to tell the dream, openly',
            'it asks about a particular detail, or does not invite the telling',
          )
        : yesNo(
            'Does `listener_reply` leave it to the person to go on however they like, without asking about a particular detail?',
            'it invites them to carry on in their own way',
            'it asks about a particular detail, or closes the telling',
          );
    case 'follow':
      return /You told the dream back, and they say it went on/.test(r.brief)
        ? yesNo(
            'Does `listener_reply` simply ask what happened next in the dream, without telling the dream back?',
            'it asks what happened next, and tells nothing back',
            'it tells the dream back, or asks about something else',
          )
        : // Asked only whether it invited the next part, a guess at it ("did you turn it?") read 0.54.
          yesNo(
            'Does `listener_reply` ask the person, openly, what happened next in their dream, without suggesting what it was?',
            'it asks what happened next, or invites them to carry on, without guessing what it was',
            'it asks about a detail of something already told (how it looked, who it was, how it felt), puts forward its own guess of what happened next ("did you go in?"), or asks nothing',
          );
    case 'explore_thread': {
      const thread = threadText(s, m.threadId, r.brief);
      // A thread older than the message just answered: the reply that follows the newest message is not
      // wrong, the move is (135 of 326 explore_thread moves, baseline 26 Sep).
      return staleThread(m, r.turn) && r.last
        ? yesNo(
            `Does \`listener_reply\` ask the person about something they raised, either in this earlier message of theirs: "${thread}", or in their latest one: "${r.last.slice(0, 400)}"?`,
            'its question is about something in one of those messages',
            'its question is about something else, or it asks nothing',
          )
        : yesNo(
            `Does \`listener_reply\` ask the person about something they raised in this message of theirs: "${thread}"?`,
            'its question is about something in that message',
            'its question is about something else, or it asks nothing',
          );
    }
    case 'circle_back':
      return yesNo(
        `Does \`listener_reply\` come back to something the person said earlier, in this message of theirs: "${threadText(s, m.threadId, r.brief)}", and ask about it?`,
        'it returns to that and asks about it',
        'it asks about something else, or asks nothing',
      );
    case 'probe_goal':
      return yesNo(
        `Does \`listener_reply\` ask the person about ${TOPIC[m.goalId] ?? m.goalId.replace(/_/g, ' ')}?`,
        'its question asks about that',
        'its question asks about something else, or it asks nothing',
      );
    case 'acknowledge':
      return yesNo(
        'Does `listener_reply` react warmly to what the person said and leave at most a light, easy-to-ignore opening, without probing for a detail?',
        'it reacts warmly and asks at most a light, easy-to-ignore question',
        'it probes for a detail, or does not react to what they said',
      );
    case 'retell':
      return yesNo(
        "Does `listener_reply` tell the person's dream back to them, as a summary of what happened?",
        'it recounts the dream: what happened, where, who was there',
        'it is a greeting, a question, a reaction or a goodbye rather than a retelling',
      );
    case 'retell_check':
      return yesNo(
        'Does `listener_reply` ask the person whether the dream, as it was told back to them, is right, or whether anything should change?',
        'it asks whether the dream as told back is right',
        'it asks something else, or asks nothing',
      );
    case 'take_correction':
      return yesNo(
        'Does `listener_reply` tell back only the part of the dream the person just changed or added, and check that it is right now, without retelling the whole dream?',
        'it tells back just that part and checks it',
        'it retells the whole dream, leaves the change out, or does not check it',
      );
    case 'offer_visualize':
      return yesNo(
        'The listener has heard a dream. Is `listener_reply` an offer to draw the dream for the person, asked as a question?',
        'it offers to draw it, or asks whether they would like to see it drawn',
        'it does not offer to draw it',
      );
    case 'offer_later':
      return yesNo(
        'The listener has heard a dream, and the person has not yet said they want it drawn. Does `listener_reply` ask them lightly, without pressing, whether they would like to see it drawn now?',
        'it asks, lightly, whether they would like it drawn now',
        'it does not ask that, or presses them',
      );
    case 'keep':
      return yesNo(
        'Does `listener_reply` thank the person for sharing their dream, without asking them anything?',
        'it thanks them and asks nothing',
        'it asks something, or does not thank them',
      );
    case 'choose_style':
      return yesNo(
        'Does `listener_reply` offer the person several ways their dream could be drawn, naming each of them, and ask which feels closest?',
        'it names the ways it could be drawn and asks which feels closest',
        'it names none of them, or only one, or does not ask',
      );
    case 'style_help':
      return yesNo(
        'Does `listener_reply` suggest one way the dream could be drawn and ask whether that feels right?',
        'it suggests one way of drawing it and asks whether that feels right',
        'it suggests none, or does not ask',
      );
    case 'start':
    case 'confirm_profile': {
      const p = profileAsked(r.brief);
      if (!p)
        return yesNo(
          "Does `listener_reply` tell the person that the pictures will appear as they're ready, without asking them anything?",
          'it says the pictures will appear, and asks nothing',
          'it asks something, or says nothing about the pictures',
        );
      if ('dreamer' in p)
        return yesNo(
          'Does `listener_reply` ask the person how they would like to be drawn themselves: as they are, or however the listener imagines them?',
          'it asks how they would like to be drawn',
          'it does not ask that',
        );
      return yesNo(
        `Does \`listener_reply\` describe how the listener pictures ${p.name}, and ask the person whether anything is different or whether they would leave it to the listener?`,
        'it describes them and asks that',
        'it does not describe them, or does not ask',
      );
    }
    case 'profile_check': {
      const name = r.brief.match(/It isn't clear whether (.+?) is right as you described/)?.[1] ?? 'what it described';
      return yesNo(
        `Does \`listener_reply\` ask the person simply whether its picture of ${name} is right, or whether anything is different?`,
        `it asks whether its picture of ${name} is right`,
        'it asks something else, or asks nothing',
      );
    }
    case 'build_done':
      return yesNo(
        'Does `listener_reply` tell the person that the sketches are being drawn and will appear, without asking a question?',
        'it says the sketches are coming, and asks nothing',
        'it asks a question, or says nothing about the sketches',
      );
    case 'while_drawing':
    case 'frames_drawing':
      return picturesQuestion(r.brief);
    case 'sheets_done':
      return yesNo(
        'Does `listener_reply` tell the person that the moments of the dream will be drawn next, in order?',
        'it says the moments will be drawn next',
        'it does not say that',
      );
    case 'all_done':
      return /couldn't be drawn/.test(r.brief)
        ? yesNo(
            'Does `listener_reply` thank the person and say plainly that some moments of their dream could not be drawn, without asking anything?',
            'it thanks them, says some could not be drawn, and asks nothing',
            'it asks something, or does not say that some could not be drawn',
          )
        : yesNo(
            'Does `listener_reply` thank the person and tell them their dream is drawn, on the right, without asking anything?',
            'it thanks them, says the pictures are there, and asks nothing',
            'it asks something, or does not say the pictures are there',
          );
    case 'ask_which':
      return yesNo(
        'Does `listener_reply` ask the person which picture they mean?',
        'it asks which picture they mean',
        'it does not ask that',
      );
    case 'wrap':
      return yesNo(
        'Does `listener_reply` bring the conversation to a close without asking another question?',
        'it closes the conversation and asks nothing',
        'it asks another question, or does not close',
      );
  }
}

export const Q = {
  // A reply leads when its question puts forward an answer, or when it states as the dream's a detail nobody
  // gave: "a guy with curly hair … juggling, just for you" (review, 26 Sep). Asked as one question of the
  // whole reply, both kinds read near the bar (7 of 12 hand labels); asked apart, 11 of 12.
  leading: yesNo(
    "Does the listener's question in `listener_questions` put forward a possible answer of its own: a detail (a thing, a place, an event, a feeling, a look, or something the person did) that the person has not said anywhere in `person_said_before`, for them to agree or disagree with?",
    'it names a detail of its own for them to agree or disagree with, such as "did you go through it?" when they never said they went through anything, or "was it cold?" when they never said how it felt',
    'it asks openly ("what happened next?", "how did it feel?"), or names only details the person already gave',
  ),
  invents: yesNo(
    'Does `listener_reply` say that something was in the dream, or happened in it, that nothing in `person_said_before` says? Only what it states as the dream\'s facts counts: its own impressions and feelings about it ("that sounds calm", "that\'s strange") and its questions do not.',
    'it states a fact of the dream nobody gave, such as "a guy juggling, just for you" when they never said who it was for, or "the knife sliding through the soft white cake" when they never said the cake was white',
    'every fact of the dream it states, the person gave; it only reflects, reacts or asks',
  ),
  eitherOr: yesNo(
    'Look at the question the listener asks in `listener_questions`. Does it offer the person a choice between two or more specific answers ("was it this or that?"), rather than leaving the answer open?',
    'it names two or more specific possibilities for them to pick from',
    'it asks openly, names only one possibility, or ends on an open "or something else"',
  ),
  offers: (name: string, line: string) =>
    yesNo(
      `Does \`listener_reply\` offer this way the dream could be drawn, in these words or its own: "${name}" (${line})?`,
      'the reply offers that way of drawing it',
      'the reply does not offer it',
    ),
  momentsList: yesNo(
    "Does `listener_reply` end with the dream's moments listed one by one, as separate short items, before any closing question?",
    'after the telling, the moments are listed as separate items',
    'it is told as running prose, with no list of the moments at its end',
  ),
  inList: (action: string) =>
    yesNo(
      `Does \`retelling_list\` include this moment of the dream, in these words or its own: "${action}"?`,
      'an item of the list is that moment',
      'no item is that moment',
    ),
  told: (claim: string, about = 'their dream') =>
    yesNo(
      `Did the person say this about ${about}, in their own words or plainly in other words: "${claim}"?`,
      'a message in `person_said` says it, or plainly means it',
      'no message says it: it is only implied, filled in, or not there at all',
    ),
  inDream: (claim: string, about = 'the dream') =>
    yesNo(
      `Does this account of the dream say this about ${about}, or plainly mean it: "${claim}"?`,
      'the account says it, or plainly means it',
      'the account does not say it, leaves it open, or says otherwise',
    ),
  confirmed: (claim: string, about: string) =>
    yesNo(
      `In \`conversation\`, did the listener say this about ${about} to the person, and did the person then say it was right: "${claim}"?`,
      'the listener said it and the person agreed that it was right or fitted',
      'the listener never said it, or the person only left it to the listener, corrected it, or did not answer',
    ),
  carried: (fact: string) =>
    yesNo(
      `\`kept_as_said\` is what a conversation recorded as the person's own words about their dream. Does any of it say this, in those words or others: "${fact}"?`,
      'something in the list says it, or plainly means it',
      'nothing in the list says it',
    ),
  asked: (fact: string) =>
    yesNo(
      `Does any of the listener's questions in \`listener_questions\` ask about this, or ask something this answers: "${fact}"?`,
      'a question asks about it, or would be answered by it',
      'none of the questions asks about it',
    ),
  goal: (goalId: string) =>
    yesNo(
      `\`message\` is one message from a person telling their dream. Does it tell ${TOPIC[goalId] ?? goalId}?`,
      'the message itself tells it',
      'the message does not tell it, or only glances off it',
    ),
  profileClear: yesNo(
    "The listener described how they picture someone or something from the person's dream and asked whether anything is different (`listener_asked`). Does `person_answer` answer that: saying it is right, changing or adding something, or leaving it to the listener?",
    'it does one of those, however briefly',
    'it does not answer that question: it talks about something else, or only asks something back',
  ),
  retellClear: yesNo(
    "The listener told the person's dream back to them and asked whether it was right (`listener_asked`). Does `person_answer` say whether it was right: confirming it, correcting it, adding to it, or saying the dream went on after it?",
    'it does one of those, however briefly',
    'it does not answer that question: it talks about something else, or only asks something back',
  ),
};

/**
 * The hash of every question's wording, as a run asks it: runs whose hashes differ asked in other words,
 * and their numbers are not the same measure. Built from each move's question on a fixed reply and each
 * fixed question with fixed arguments.
 */
export function questionsHash(): string {
  const kinds: Move['kind'][] = [
    'open_ended',
    'follow',
    'explore_thread',
    'circle_back',
    'probe_goal',
    'acknowledge',
    'retell',
    'retell_check',
    'take_correction',
    'offer_visualize',
    'offer_later',
    'choose_style',
    'style_help',
    'start',
    'confirm_profile',
    'profile_check',
    'build_done',
    'while_drawing',
    'ask_which',
    'sheets_done',
    'frames_drawing',
    'all_done',
    'keep',
    'wrap',
  ];
  const briefs = [
    'Move: x.',
    "Move: follow. You told the dream back, and they say it went on. describe how you picture X on their own. It isn't clear whether X is right as you described. couldn't be drawn",
    "Move: start. ask gently how they'd like to be drawn. Ask them now, in one short question about X, and don't say. The moment they said they'd pause on is up on the right now",
    "Move: frames_drawing. More of the dream is up on the right (X). X is up on the right now: ask if it looks. Say you're redrawing X with their change",
  ];
  const s = { transcript: [{ role: 'user', content: 'M' }] as Entry[] };
  const out: unknown[] = [];
  for (const kind of kinds)
    for (const brief of briefs)
      for (const turn of [0, 3]) {
        const move = { kind, goalId: 'look', threadId: 'msg_0', itemId: 'p1', styleId: 'a' } as unknown as Move;
        const r: Reply = {
          turn,
          move,
          key: kind,
          rule: '',
          phase: 'listen',
          brief,
          group: groupOf(kind),
          text: 'T',
          raw: null,
          said: ['M'],
          last: 'L',
          copied: false,
        };
        out.push(complianceQuestion(r, s));
      }
  for (const [k, v] of Object.entries(Q))
    out.push([k, typeof v === 'function' ? (v as (...a: string[]) => Question)('A', 'B') : v]);
  return sha256(JSON.stringify(out)).slice(0, 16);
}

// ── asking Jev ───────────────────────────────────────────────────────────────────────────────────

/** The Jev model the evals ask, by name (as evals/prompt-cases.ts pins it). */
export const JEV_MODEL = () => process.env.JEV_EVAL_MODEL ?? 'jev-1.13.0';

/** One question over one state. */
export type Ask = { state: string; question: Question };
/** Jev's answers so far, by the hash of the model, the question as asked and its state. */
export type JevCache = Record<string, { p: number; model: string; served?: string; at: string }>;
export const askKey = (a: Ask, model = JEV_MODEL()) => sha256(`${model}\n${JSON.stringify(a.question)}\n\n${a.state}`);

/** Above this, Jev's answer is yes. */
export const YES = 0.5;
/** Within this of the bar an answer is close (the same question asked again moved by up to 0.06). */
export const CLOSE = 0.1;
/** A said fact Jev finds at or above this, though under the bar, is near the bar and listed apart. */
export const NEAR = 0.3;

/**
 * Asks Jev every question not already answered. Questions over the same state go in one call (they
 * are answered apart and cannot see each other's answers), at most `perCall` to a call. Answers land
 * in the cache; failures, and answers from another model than the one named, are returned.
 */
export async function askAll(
  asks: Ask[],
  jev: JevFn,
  cache: JevCache,
  opts: { model?: string; perCall?: number; concurrency?: number; progress?: (done: number, of: number) => void } = {},
): Promise<string[]> {
  const model = opts.model ?? JEV_MODEL();
  const perCall = opts.perCall ?? 30;
  const todo = new Map<string, Ask>();
  for (const a of asks) {
    const k = askKey(a, model);
    if (!cache[k] && !todo.has(k)) todo.set(k, a);
  }
  const byState = new Map<string, [string, Ask][]>();
  for (const [k, a] of todo) byState.set(a.state, [...(byState.get(a.state) ?? []), [k, a]]);
  const batches: { state: string; items: [string, Ask][] }[] = [];
  for (const [state, items] of byState)
    for (let i = 0; i < items.length; i += perCall) batches.push({ state, items: items.slice(i, i + perCall) });
  const errors: string[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < batches.length) {
      const b = batches[next++];
      const questions = Object.fromEntries(b.items.map(([, a], i) => [`q${i}`, a.question]));
      let call = await jev(b.state, questions);
      for (let tries = 1; !call.answers && tries < 3; tries++) {
        await Bun.sleep(1500 * tries);
        call = await jev(b.state, questions);
      }
      if (call.model && call.model !== model) errors.push(`answered by ${call.model}, not ${model}`);
      b.items.forEach(([k], i) => {
        const a = call.answers?.[`q${i}`];
        if (a?.type !== 'noul') {
          errors.push(call.error?.slice(0, 200) ?? 'no answer');
          return;
        }
        cache[k] = { p: a.noul, model, ...(call.model ? { served: call.model } : {}), at: new Date().toISOString() };
      });
      opts.progress?.(++done, batches.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 8, batches.length) }, worker));
  return [...new Set(errors)];
}

// ── scoring one conversation ─────────────────────────────────────────────────────────────────────

/** What the test reads of a turn's saved detail (turn-<n>.json beside the conversation, or frozen with it). */
export type TurnDetail = {
  hostRaw?: string;
  jevAnswers?: Record<string, Answer> | null;
  stateAfter?: { signals?: Record<string, unknown>; goals?: Record<string, { confidence: number; evidence: string }> };
};

/** A conversation as read. */
export type Loaded = {
  /** Its id, or where it is when it is not in a state folder ("runs/replay-fake/car-park/state/dream-…"). */
  key: string;
  path: string;
  session: Session;
  hash: string;
  /** The dream file the simulated dreamer knew. */
  dream: string | null;
  origin: 'simulated' | 'replay';
  /** A replay's source conversation. */
  source: Session | null;
  sourceId: string | null;
  /** A frozen conversation's turn details, kept with it. */
  details?: Record<string, TurnDetail>;
};

/** What a conversation's name says: its dream, and for a replay the conversation it replays. */
export function nameOf(name: string): { dream: string; origin: Loaded['origin']; source: string | null } | null {
  const sim = name.match(/^simulated: (\S+)/);
  if (sim) return { dream: sim[1], origin: 'simulated', source: null };
  const rep = name.match(/^replayed \([^)]*\): (\S+) from (dream-[\w-]+)/);
  if (rep) return { dream: rep[1], origin: 'replay', source: rep[2] };
  return null;
}

type Frac = [number, number];

export type ReplyScore = {
  turn: number;
  move: string;
  group: Group;
  rule: string;
  copied: boolean;
  /** The question Jev was asked, and its probability of yes (null: unanswered). */
  question: string;
  p: number | null;
  pass: boolean | null;
  close: boolean;
  /** Questions after and before the one-question repair. */
  questions: number;
  rawQuestions: number | null;
  askedWhenTold: boolean;
  /**
   * A listening reply: whether it leads (the higher of its question putting forward an answer and its
   * statements bringing in a detail), each of the two, and whether its question is either/or.
   */
  eitherOr?: number | null;
  leading?: number | null;
  leadingAsked?: number | null;
  invents?: number | null;
  /** The person's next message only agreed, after a reply Jev read as leading. */
  agreed?: boolean;
  /** An explore_thread move whose thread is a message before the one this reply answers. */
  staleThread?: boolean;
  /** A retelling: Jev's reading of a closing list, the list code finds, and the breakdown's moments it covers. */
  momentsList?: number | null;
  listItems?: number;
  listCovers?: [number, number] | null;
  /**
   * A choose_style reply: the ways its brief offered, how many the reply offers (Jev, one question a
   * way), how many the host's own words offered before the repair, and how many the reply names by
   * their words (code).
   */
  offered?: number;
  kept?: number | null;
  rawKept?: number | null;
  keptCode?: number;
  text: string;
};

export type FactScore = SaidFact & { told: number | null; inDream: number | null; confirmed?: number | null };

export type CoverageScore = {
  id: string;
  kind: DreamFact['kind'];
  fact: string;
  told: number | null;
  asked?: number | null;
  /** Told, and kept by the conversation among what it records as said. */
  carried?: number | null;
};
export type GoalScore = { goal: string; evidence: string; backed: number | null };
export type AnswerScore = {
  kind: 'profile' | 'retell';
  turn: number;
  answer: string;
  reading: string;
  /** The saved choice's chance of any settling answer. */
  settled: number | null;
  clear: number | null;
  /**
   * Whether the reply it answers asked the question (its move's answer from Jev): "bright from outside,
   * or softer because of the snow?" was put in place of "is Dele right?", and its answer is no answer
   * about Dele, whatever Jev finds it answers.
   */
  asked: number | null;
};

export type AnswerSums = {
  n: number;
  clear: number;
  readUnclear: number;
  /** Read unclear, though it answered a reply that asked the question, and the test found it clear. */
  clearReadUnclear: number;
  /** Read as settling it (right, changed, left to us), though the test found it no answer to the question asked. */
  unclearReadSettled: number;
  /** Read unclear after a reply that never asked the question. */
  unasked: number;
  settledReadUnclear: number;
};

export type Sums = {
  conversations: number;
  /** Conversations that reached the retelling, the style offer, and a profile put to them. */
  stages: { retelling: number; style: number; profile: number };
  replies: number;
  compliance: Record<Group, Frac>;
  s8: Frac;
  probe: Frac;
  probeByGoal: Record<string, Frac>;
  /** Move compliance by kind of move. */
  byMove: Record<string, Frac>;
  questions: { replies: number; total: number; multi: number; rawMulti: number; askedWhenTold: number };
  /** Listening replies: how many, their questions, those asking one; either/or among those; leading among all. */
  listening: {
    replies: number;
    questions: number;
    asking: number;
    eitherOr: number;
    leading: number;
    /** Of the leading: by its question, and by what it states. */
    leadingAsked: number;
    invents: number;
    both: number;
    agreed: number;
  };
  facts: {
    said: number;
    told: number;
    notTold: number;
    /** Not told, Jev under NEAR: the count S8 must bring to 0. */
    notToldFirm: number;
    /** Not told, Jev between NEAR and the bar: listed apart, hand-checked. */
    notToldNear: number;
    confirmed: number;
    notToldInDream: number;
    notToldNotInDream: number;
    toldNotInDream: number;
    bySource: Record<string, Frac>;
  };
  coverage: {
    facts: number;
    told: number;
    askedNotTold: number;
    never: number;
    /** Told facts the conversation kept among what it records as said. */
    carried: number;
    byKind: Record<string, Frac>;
  };
  goals: { covered: number; backed: number; byGoal: Record<string, Frac> };
  /** explore_thread moves, those naming a message before the one just answered, and how many of each did their move. */
  threads: { explore: number; stale: number; staleDid: number; freshDid: number };
  styles: {
    offers: number;
    options: number;
    kept: number;
    rawKept: number;
    keptCode: number;
    allKept: number;
    noneKept: number;
  };
  /** Retellings: those Jev reads as ending on a list, those code finds a list in, and lists covering every moment. */
  retell: { retellings: number; endsWithMoments: number; endsWithMomentsCode: number; coversAll: number };
  answers: { profile: AnswerSums; retell: AnswerSums };
  unanswered: number;
  close: number;
};

export type SessionScore = {
  key: string;
  id: string;
  name: string;
  dream: string | null;
  origin: Loaded['origin'];
  source: string | null;
  hash: string;
  replies: ReplyScore[];
  facts: FactScore[];
  coverage: CoverageScore[];
  goals: GoalScore[];
  answers: AnswerScore[];
  sums: Sums;
};

const yes = (p: number | null | undefined) => p !== null && p !== undefined && p >= YES;
/** A reply leads when either its question or its statements do; unanswered while either is. */
const leadingOf = (asked: number | null | undefined, invents: number | null | undefined) =>
  asked === null || invents === null || invents === undefined ? null : Math.max(asked ?? 0, invents);
const no = (p: number | null | undefined) => p !== null && p !== undefined && p < YES;
const isClose = (p: number | null | undefined) => p !== null && p !== undefined && Math.abs(p - YES) < CLOSE;
const json = (x: unknown) => JSON.stringify(x, null, 1);

/** Everything the scorer needs besides the conversation: the dream files and their facts, and each turn's saved detail. */
export type Env = {
  facts: FactsFile;
  dreamText: (name: string) => string | null;
  detail: (l: Loaded, turn: number) => TurnDetail | null;
};

/**
 * The questions one reply is scored on: its move; for a listening reply, whether it states a detail nobody
 * gave, and, where it asks, whether its question leads and whether it is either/or.
 */
export function replyAsks(
  r: Reply,
  s: Pick<Session, 'transcript'>,
): { move: Ask; leading?: Ask; invents?: Ask; eitherOr?: Ask; questions: string[] } {
  const qs = questionsOf(r.text);
  const listening = r.group === 'listen';
  const state = json({
    person_said_before: listening ? r.said : r.said.slice(-1),
    listener_reply: r.text,
    listener_questions: qs,
  });
  return {
    move: { state, question: complianceQuestion(r, s) },
    ...(listening && r.turn > 0 ? { invents: { state, question: Q.invents } } : {}),
    ...(listening && r.turn > 0 && qs.length ? { leading: { state, question: Q.leading } } : {}),
    ...(listening && qs.length ? { eitherOr: { state, question: Q.eitherOr } } : {}),
    questions: qs,
  };
}

/**
 * Scores one conversation. `get` gives Jev's answer to a question, or null when it has none yet: the
 * run asks what the scorer needed and scores again, so questions that depend on an earlier answer (was
 * a fact the person did not say agreed to? was a fact they never told asked about?) are asked second.
 */
export function scoreSession(l: Loaded, env: Env, get: (a: Ask) => number | null): SessionScore {
  const s = l.session;
  const replies = repliesOf(s, (t) => rawText(env.detail(l, t)?.hostRaw), l.source);
  const person = s.transcript.filter((e) => e.role === 'user').map((e) => e.content);
  const moments = momentsOf(s);

  // 1 and 2: each reply against its move, what it brings in, and its questions.
  const scored: ReplyScore[] = replies.map((r) => {
    const asks = replyAsks(r, s);
    const base: ReplyScore = {
      turn: r.turn,
      move: r.key,
      group: r.group,
      rule: r.rule,
      copied: r.copied,
      question: asks.move.question.instructions,
      p: null,
      pass: null,
      close: false,
      questions: asks.questions.length,
      rawQuestions: r.raw === null ? null : questionsOf(r.raw).length,
      askedWhenTold: NO_ASK.test(r.brief) && asks.questions.length > 0,
      text: r.text,
    };
    const stale = staleThread(r.move, r.turn);
    if (stale !== undefined) base.staleThread = stale;
    const ways = r.move.kind === 'choose_style' ? offeredStyles(r.brief) : [];
    if (ways.length) {
      base.offered = ways.length;
      base.keptCode = ways.filter((w) => mentions(r.text, w.name)).length;
    }
    const items = r.move.kind === 'retell' ? endingList(r.text) : [];
    if (r.move.kind === 'retell') base.listItems = items.length;
    if (r.copied) return base;
    if (ways.length) {
      // Each way asked of Jev apart: the host words them its own way ("a light pencil drawing" for
      // "delicate pencil sketch"), and a match on the name's words missed a third of those kept.
      const keptIn = (text: string) => {
        const ps = ways.map((w) => get({ state: json({ listener_reply: text }), question: Q.offers(w.name, w.line) }));
        return ps.some((p) => p === null) ? null : ps.filter(yes).length;
      };
      base.kept = keptIn(r.text);
      base.rawKept = r.raw === null || r.raw === r.text ? base.kept : keptIn(r.raw);
    }
    base.p = get(asks.move);
    base.pass = base.p === null ? null : yes(base.p);
    base.close = isClose(base.p);
    if (asks.invents) {
      base.invents = get(asks.invents);
      base.leadingAsked = asks.leading ? get(asks.leading) : undefined;
      base.leading = leadingOf(base.leadingAsked, base.invents);
      const next = person[r.turn];
      base.agreed = yes(base.leading) && next !== undefined && AGREES.test(next);
    }
    if (asks.eitherOr) base.eitherOr = get(asks.eitherOr);
    if (r.move.kind === 'retell') {
      base.momentsList = get({ state: asks.move.state, question: Q.momentsList });
      // A closing list is held to the breakdown's moments: every one of them in it.
      if (items.length && moments.length) {
        const ps = moments.map((m) => get({ state: json({ retelling_list: items }), question: Q.inList(m.action) }));
        base.listCovers = ps.some((p) => p === null) ? null : [ps.filter(yes).length, moments.length];
      }
    }
    return base;
  });

  // 4: answers to a profile or a retelling, against how the turn read them.
  const answers: AnswerScore[] = [];
  for (let i = 1; i < replies.length; i++) {
    const prev = replies[i - 1];
    const cur = replies[i];
    const kind =
      prev.phase === 'build' && ['start', 'confirm_profile', 'profile_check'].includes(prev.move.kind)
        ? 'profile'
        : prev.phase === 'retell' && ['retell', 'retell_check', 'take_correction'].includes(prev.move.kind)
          ? 'retell'
          : null;
    if (!kind || cur.copied || cur.last === null) continue;
    const d = env.detail(l, cur.turn);
    const state = json({ listener_asked: prev.text, person_answer: cur.last });
    answers.push({
      kind,
      turn: cur.turn,
      answer: cur.last,
      reading: readingOf(kind, s.turns[i], d?.stateAfter?.signals),
      settled: settledOf(d?.jevAnswers?.[kind === 'profile' ? 'profile_reply' : 'retell_reply']),
      clear: get({ state, question: kind === 'profile' ? Q.profileClear : Q.retellClear }),
      asked: scored[i - 1]?.p ?? null,
    });
  }

  // 3: every claim marked said, against their words, the dream file, and what they agreed to.
  const saidState = json({ person_said: person });
  const dream = l.dream ? env.dreamText(l.dream) : null;
  const dreamState = dream ? json({ dream }) : null;
  const convState = json({
    conversation: s.transcript.map((e) => `${e.role === 'user' ? 'Person' : 'Listener'}: ${e.content}`),
  });
  const said = saidFacts(s);
  const facts: FactScore[] = said.map((f) => {
    const told = get({ state: saidState, question: Q.told(f.claim, f.about) });
    const out: FactScore = {
      ...f,
      told,
      inDream: dreamState ? get({ state: dreamState, question: Q.inDream(f.claim, f.about) }) : null,
    };
    if (no(told)) out.confirmed = get({ state: convState, question: Q.confirmed(f.claim, f.about) });
    return out;
  });

  // Coverage and goal readings: a replay's are its source's, counted there.
  const coverage: CoverageScore[] = [];
  const goals: GoalScore[] = [];
  if (l.origin === 'simulated') {
    const asked = json({
      listener_questions: replies.filter((r) => S8_GROUPS.includes(r.group)).flatMap((r) => questionsOf(r.text)),
    });
    const kept = json({ kept_as_said: said.map((f) => f.statement) });
    for (const f of (l.dream && env.facts.dreams[l.dream]) || []) {
      const told = get({ state: saidState, question: Q.told(f.fact) });
      const c: CoverageScore = { id: f.id, kind: f.kind, fact: f.fact, told };
      if (no(told)) c.asked = get({ state: asked, question: Q.asked(f.fact) });
      if (yes(told)) c.carried = get({ state: kept, question: Q.carried(f.fact) });
      coverage.push(c);
    }
    // The goals as they stood when the dream was first told back: what listening had settled, and so
    // never asked. A later reading can move a goal's evidence to a better message.
    const retold = s.turns.find((t) => t.move.kind === 'retell' && t.phase === 'retell');
    const settled = (retold && env.detail(l, retold.turn)?.stateAfter?.goals) || s.state?.goals || {};
    for (const [g, st] of Object.entries(settled)) {
      if (st.confidence < 0.7 || !st.evidence) continue;
      goals.push({
        goal: g,
        evidence: st.evidence,
        backed: get({ state: json({ message: st.evidence }), question: Q.goal(g) }),
      });
    }
  }

  const out: SessionScore = {
    key: l.key,
    id: basename(l.path, '.json'),
    name: s.name,
    dream: l.dream,
    origin: l.origin,
    source: l.sourceId,
    hash: l.hash,
    replies: scored,
    facts,
    coverage,
    goals,
    answers,
    sums: emptySums(),
  };
  out.sums = sumsOf(out, stagesOf(s));
  return out;
}

/** Which parts a conversation reached: the retelling, the style offer, a profile put to them. */
export function stagesOf(s: Pick<Session, 'turns'>): Sums['stages'] {
  const has = (ok: (t: TurnRecord) => boolean) => (s.turns.some(ok) ? 1 : 0);
  return {
    retelling: has((t) => t.move.kind === 'retell'),
    style: has((t) => t.move.kind === 'choose_style'),
    profile: has(
      (t) =>
        (t.move.kind === 'start' || t.move.kind === 'confirm_profile') &&
        profileAsked((t.brief ?? '').slice((t.brief ?? '').indexOf('Move:'))) !== null,
    ),
  };
}

const emptyAnswers = (): AnswerSums => ({
  n: 0,
  clear: 0,
  readUnclear: 0,
  clearReadUnclear: 0,
  unclearReadSettled: 0,
  unasked: 0,
  settledReadUnclear: 0,
});
export function emptySums(): Sums {
  return {
    conversations: 0,
    stages: { retelling: 0, style: 0, profile: 0 },
    replies: 0,
    compliance: Object.fromEntries(GROUPS.map((g) => [g, [0, 0]])) as unknown as Record<Group, Frac>,
    s8: [0, 0],
    probe: [0, 0],
    probeByGoal: {},
    byMove: {},
    questions: { replies: 0, total: 0, multi: 0, rawMulti: 0, askedWhenTold: 0 },
    listening: {
      replies: 0,
      questions: 0,
      asking: 0,
      eitherOr: 0,
      leading: 0,
      leadingAsked: 0,
      invents: 0,
      both: 0,
      agreed: 0,
    },
    facts: {
      said: 0,
      told: 0,
      notTold: 0,
      notToldFirm: 0,
      notToldNear: 0,
      confirmed: 0,
      notToldInDream: 0,
      notToldNotInDream: 0,
      toldNotInDream: 0,
      bySource: {},
    },
    coverage: { facts: 0, told: 0, askedNotTold: 0, never: 0, carried: 0, byKind: {} },
    goals: { covered: 0, backed: 0, byGoal: {} },
    threads: { explore: 0, stale: 0, staleDid: 0, freshDid: 0 },
    styles: { offers: 0, options: 0, kept: 0, rawKept: 0, keptCode: 0, allKept: 0, noneKept: 0 },
    retell: { retellings: 0, endsWithMoments: 0, endsWithMomentsCode: 0, coversAll: 0 },
    answers: { profile: emptyAnswers(), retell: emptyAnswers() },
    unanswered: 0,
    close: 0,
  };
}

const bump = (f: Frac, ok: boolean) => {
  f[0] += ok ? 1 : 0;
  f[1] += 1;
};

/** A conversation's counts. Unanswered questions are counted apart and never as a pass or a fail. */
export function sumsOf(
  x: Pick<SessionScore, 'replies' | 'facts' | 'coverage' | 'goals' | 'answers' | 'origin'>,
  stages: Sums['stages'] = { retelling: 0, style: 0, profile: 0 },
): Sums {
  const t = emptySums();
  const note = (p: number | null | undefined) => {
    if (p === null) t.unanswered += 1;
    else if (isClose(p)) t.close += 1;
  };
  // A replay's conversation up to the look is its source's, and is counted there.
  if (x.origin === 'simulated') {
    t.conversations = 1;
    t.stages = { ...stages };
  }
  for (const r of x.replies.filter((r) => !r.copied)) {
    t.replies += 1;
    note(r.p);
    t.questions.replies += 1;
    t.questions.total += r.questions;
    if (r.questions > 1) t.questions.multi += 1;
    if ((r.rawQuestions ?? 0) > 1) t.questions.rawMulti += 1;
    if (r.askedWhenTold) t.questions.askedWhenTold += 1;
    if (r.p !== null) {
      bump(t.compliance[r.group], yes(r.p));
      if (S8_GROUPS.includes(r.group)) bump(t.s8, yes(r.p));
      bump((t.byMove[r.move.split(':')[0]] ??= [0, 0]), yes(r.p));
      if (r.move.startsWith('probe_goal:')) {
        bump(t.probe, yes(r.p));
        bump((t.probeByGoal[r.move.slice('probe_goal:'.length)] ??= [0, 0]), yes(r.p));
      }
    }
    if (r.staleThread !== undefined && r.p !== null) {
      t.threads.explore += 1;
      if (r.staleThread) {
        t.threads.stale += 1;
        if (yes(r.p)) t.threads.staleDid += 1;
      } else if (yes(r.p)) t.threads.freshDid += 1;
    }
    if (r.group === 'listen' && r.turn > 0) {
      note(r.invents);
      if (r.leadingAsked !== undefined) note(r.leadingAsked);
      if (r.eitherOr !== undefined) note(r.eitherOr);
      if (r.leading !== null && r.leading !== undefined && r.eitherOr !== null) {
        t.listening.replies += 1;
        t.listening.questions += r.questions;
        if (yes(r.leading)) t.listening.leading += 1;
        if (yes(r.leadingAsked)) t.listening.leadingAsked += 1;
        if (yes(r.invents)) t.listening.invents += 1;
        if (r.agreed) t.listening.agreed += 1;
        if (r.eitherOr !== undefined) {
          t.listening.asking += 1;
          if (yes(r.eitherOr)) t.listening.eitherOr += 1;
          if (yes(r.eitherOr) && yes(r.leading)) t.listening.both += 1;
        }
      }
    }
    if (r.move === 'retell' && yes(r.p)) {
      note(r.momentsList);
      t.retell.retellings += 1;
      if (yes(r.momentsList)) t.retell.endsWithMoments += 1;
      if ((r.listItems ?? 0) > 0) t.retell.endsWithMomentsCode += 1;
      if (yes(r.momentsList) && r.listCovers && r.listCovers[0] === r.listCovers[1]) t.retell.coversAll += 1;
    }
    if (r.offered !== undefined && r.offered > 0) {
      if (r.kept === null || r.kept === undefined) t.unanswered += 1;
      else {
        t.styles.offers += 1;
        t.styles.options += r.offered;
        t.styles.kept += r.kept;
        t.styles.rawKept += r.rawKept ?? 0;
        t.styles.keptCode += r.keptCode ?? 0;
        if (r.kept === r.offered) t.styles.allKept += 1;
        if (r.kept === 0) t.styles.noneKept += 1;
      }
    }
  }
  for (const f of x.facts) {
    note(f.told);
    note(f.inDream);
    if (f.told === null) continue;
    t.facts.said += 1;
    for (const src of new Set(f.from.map(sourceOf))) bump((t.facts.bySource[src] ??= [0, 0]), yes(f.told));
    if (yes(f.told)) {
      t.facts.told += 1;
      if (no(f.inDream)) t.facts.toldNotInDream += 1;
    } else {
      t.facts.notTold += 1;
      if (f.told < NEAR) t.facts.notToldFirm += 1;
      else t.facts.notToldNear += 1;
      note(f.confirmed);
      if (yes(f.confirmed)) t.facts.confirmed += 1;
      if (yes(f.inDream)) t.facts.notToldInDream += 1;
      if (no(f.inDream)) t.facts.notToldNotInDream += 1;
    }
  }
  for (const c of x.coverage) {
    note(c.told);
    if (c.told === null) continue;
    t.coverage.facts += 1;
    bump((t.coverage.byKind[c.kind] ??= [0, 0]), yes(c.told));
    if (yes(c.told)) {
      t.coverage.told += 1;
      if (yes(c.carried)) t.coverage.carried += 1;
    } else if (yes(c.asked)) t.coverage.askedNotTold += 1;
    else t.coverage.never += 1;
  }
  for (const g of x.goals) {
    note(g.backed);
    if (g.backed === null) continue;
    t.goals.covered += 1;
    if (yes(g.backed)) t.goals.backed += 1;
    bump((t.goals.byGoal[g.goal] ??= [0, 0]), yes(g.backed));
  }
  for (const a of x.answers) {
    note(a.clear);
    if (a.clear === null) continue;
    const s = t.answers[a.kind];
    s.n += 1;
    if (yes(a.clear)) s.clear += 1;
    if (a.reading === 'unclear') {
      s.readUnclear += 1;
      if (no(a.asked)) s.unasked += 1;
      else if (yes(a.clear)) s.clearReadUnclear += 1;
      if ((a.settled ?? 0) >= YES) s.settledReadUnclear += 1;
    } else if (a.reading !== 'unknown' && no(a.clear) && !no(a.asked)) s.unclearReadSettled += 1;
  }
  return t;
}

/** Every conversation's counts added up. */
export function addSums(all: Sums[]): Sums {
  const t = emptySums();
  const addFrac = (a: Frac, b: Frac) => {
    a[0] += b[0];
    a[1] += b[1];
  };
  const addMap = (a: Record<string, Frac>, b: Record<string, Frac>) => {
    for (const [k, f] of Object.entries(b)) addFrac((a[k] ??= [0, 0]), f);
  };
  const addNums = <T extends object>(a: T, b: T) => {
    const x = a as unknown as Record<string, number>;
    for (const [k, v] of Object.entries(b as unknown as Record<string, unknown>)) if (typeof v === 'number') x[k] += v;
  };
  for (const s of all) {
    t.conversations += s.conversations;
    addNums(t.stages, s.stages);
    t.replies += s.replies;
    for (const g of GROUPS) addFrac(t.compliance[g], s.compliance[g]);
    addFrac(t.s8, s.s8);
    addFrac(t.probe, s.probe);
    addMap(t.probeByGoal, s.probeByGoal);
    addMap(t.byMove, s.byMove);
    addNums(t.questions, s.questions);
    addNums(t.listening, s.listening);
    addNums(t.facts, s.facts);
    addMap(t.facts.bySource, s.facts.bySource);
    addNums(t.coverage, s.coverage);
    addMap(t.coverage.byKind, s.coverage.byKind);
    addNums(t.goals, s.goals);
    addMap(t.goals.byGoal, s.goals.byGoal);
    addNums(t.threads, s.threads);
    addNums(t.styles, s.styles);
    addNums(t.retell, s.retell);
    addNums(t.answers.profile, s.answers.profile);
    addNums(t.answers.retell, s.answers.retell);
    t.unanswered += s.unanswered;
    t.close += s.close;
  }
  return t;
}

// ── the headline numbers ─────────────────────────────────────────────────────────────────────────

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');
const frac = (f: Frac) => `${f[0]}/${f[1]} (${pct(f[0], f[1])})`;
const rate = (a: number, b: number) => (b ? a / b : null);

/** The floors: numbers S8 must not push down (or, for "never asked nor told", up) to meet its targets. */
export function floors(t: Sums) {
  return {
    questionsPerListeningReply: rate(t.listening.questions, t.listening.replies),
    toldOrAsked: rate(t.coverage.told + t.coverage.askedNotTold, t.coverage.facts),
    neverAskedNorTold: rate(t.coverage.never, t.coverage.facts),
    toldCarriedAsSaid: rate(t.coverage.carried, t.coverage.told),
  };
}

export type Headline = { name: string; value: string; target: string; met: boolean | null };

/**
 * The S8 targets, each as a number and whether it is met; with the run before, the floors too. A target
 * of 0 is met when nothing is flagged; what is flagged near the bar is listed apart and hand-checked.
 */
export function headline(t: Sums, before?: Sums | null): Headline[] {
  const listen = rate(t.compliance.listen[0], t.compliance.listen[1]);
  const eo = rate(t.listening.eitherOr, t.listening.asking);
  const out: Headline[] = [
    {
      name: 'conversations reaching the retelling, the style offer, a profile',
      value: `${t.stages.retelling}, ${t.stages.style}, ${t.stages.profile} of ${t.conversations}`,
      target: '(shown)',
      met: null,
    },
    {
      name: 'move compliance, listening turns',
      value: `${frac(t.compliance.listen)}; goal questions ${frac(t.probe)}; before the pictures ${frac(t.s8)}`,
      target: '>= 90%',
      met: listen === null ? null : listen >= 0.9,
    },
    {
      name: 'either/or among listening questions',
      value: `${t.listening.eitherOr}/${t.listening.asking} (${pct(t.listening.eitherOr, t.listening.asking)})`,
      target: '< 5%',
      met: eo === null ? null : eo < 0.05,
    },
    {
      name: 'listening replies bringing in a detail not given (leading)',
      value: `${t.listening.leading}/${t.listening.replies} (${pct(t.listening.leading, t.listening.replies)}): by its question ${t.listening.leadingAsked}, by what it states ${t.listening.invents}; also either/or ${t.listening.both}; answered only "yeah" ${t.listening.agreed}`,
      target: '0',
      met: t.listening.replies ? t.listening.leading === 0 : null,
    },
    {
      name: 'said but not in their words',
      value: `${t.facts.notToldFirm}/${t.facts.said} (${pct(t.facts.notToldFirm, t.facts.said)}); near the bar ${t.facts.notToldNear} more; agreed to ${t.facts.confirmed}; in the dream file ${t.facts.notToldInDream}`,
      target: '0 (near-bar hand-checked)',
      met: t.facts.said ? t.facts.notToldFirm === 0 : null,
    },
    {
      name: 'style offers that kept every way',
      value: `${t.styles.allKept}/${t.styles.offers}; none kept ${t.styles.noneKept}; ways ${t.styles.kept}/${t.styles.options} (the host wrote ${t.styles.rawKept} before the repair)`,
      target: 'all',
      met: t.styles.offers ? t.styles.allKept === t.styles.offers : null,
    },
    {
      name: 'retellings ending with a list of every breakdown moment',
      value: `${t.retell.coversAll}/${t.retell.retellings}; ending on a list ${t.retell.endsWithMoments} (code ${t.retell.endsWithMomentsCode})`,
      target: 'all',
      met: t.retell.retellings ? t.retell.coversAll === t.retell.retellings : null,
    },
    {
      name: 'answers misread',
      value: `clear read unclear: profile ${t.answers.profile.clearReadUnclear}, retelling ${t.answers.retell.clearReadUnclear}; no answer read as settled: profile ${t.answers.profile.unclearReadSettled}, retelling ${t.answers.retell.unclearReadSettled} (of ${t.answers.profile.n} and ${t.answers.retell.n})`,
      target: '0',
      met:
        t.answers.profile.n + t.answers.retell.n
          ? t.answers.profile.clearReadUnclear +
              t.answers.retell.clearReadUnclear +
              t.answers.profile.unclearReadSettled +
              t.answers.retell.unclearReadSettled ===
            0
          : null,
    },
  ];
  const now = floors(t);
  const was = before ? floors(before) : null;
  const f2 = (x: number | null) => (x === null ? '—' : x.toFixed(2));
  const floor = (name: string, k: keyof ReturnType<typeof floors>, up: boolean) => {
    const a = now[k];
    const b = was?.[k] ?? null;
    out.push({
      name: `floor: ${name}`,
      value: `${f2(a)}${was ? ` (before ${f2(b)})` : ''}`,
      target: was ? `${up ? '>=' : '<='} before` : '(needs --against)',
      met: a === null || b === null ? null : up ? a >= b - 1e-9 : a <= b + 1e-9,
    });
  };
  floor('questions per listening reply', 'questionsPerListeningReply', true);
  floor('dream-file facts told or asked', 'toldOrAsked', true);
  floor('dream-file facts never asked nor told', 'neverAskedNorTold', false);
  floor('told dream-file facts kept as said', 'toldCarriedAsSaid', true);
  return out;
}

/** The rest of the totals, in lines. */
export function detailLines(t: Sums): string[] {
  const byMap = (m: Record<string, Frac>) =>
    Object.entries(m)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, f]) => `${k} ${f[0]}/${f[1]}`)
      .join(', ');
  return [
    `replies scored ${t.replies}; by part: ${GROUPS.map((g) => `${g} ${frac(t.compliance[g])}`).join(', ')}`,
    `by move: ${byMap(t.byMove)}`,
    `goal questions by goal: ${byMap(t.probeByGoal)}`,
    `questions per reply ${t.questions.replies ? (t.questions.total / t.questions.replies).toFixed(2) : '—'}; replies with more than one ${t.questions.multi} (the host wrote ${t.questions.rawMulti} before the repair); asked where told to ask nothing ${t.questions.askedWhenTold}`,
    `said facts in their words, by where they are: ${byMap(t.facts.bySource)}; told but not in the dream file ${t.facts.toldNotInDream}`,
    `dream-file facts the person told: ${t.coverage.told}/${t.coverage.facts}, kept as said ${t.coverage.carried}; asked but not told ${t.coverage.askedNotTold}; never asked nor told ${t.coverage.never}; by kind: ${byMap(t.coverage.byKind)}`,
    `goals read as told when the dream was first told back, that their message tells: ${t.goals.backed}/${t.goals.covered}; by goal: ${byMap(t.goals.byGoal)}`,
    `explore_thread moves naming a message before the one just answered: ${t.threads.stale}/${t.threads.explore}, of them done ${t.threads.staleDid}; the rest done ${t.threads.freshDid}/${t.threads.explore - t.threads.stale}`,
    `answers the test found clear: profile ${t.answers.profile.clear}/${t.answers.profile.n}, retelling ${t.answers.retell.clear}/${t.answers.retell.n}; read unclear after a reply that never asked: ${t.answers.profile.unasked + t.answers.retell.unasked}`,
    `Jev: ${t.unanswered} questions unanswered, ${t.close} answers within ${CLOSE} of the bar`,
  ];
}

/** One line per conversation. */
export function sessionLine(s: SessionScore): string {
  const t = s.sums;
  const shown = s.origin === 'replay' ? s.key.replace(/^runs\//, '').replace(/\/state\/dream-[\w-]+$/, '') : s.key;
  const cells = [
    shown.padEnd(26),
    (s.dream ?? '?').padEnd(16),
    s.origin === 'replay' ? 'replay' : 'sim   ',
    `n ${String(t.replies).padStart(2)}`,
    `listen ${frac(t.compliance.listen).padEnd(13)}`,
    `goal ${`${t.probe[0]}/${t.probe[1]}`.padEnd(5)}`,
    `e/o ${`${t.listening.eitherOr}/${t.listening.asking}`.padEnd(5)}`,
    `lead ${`${t.listening.leading}/${t.listening.replies}`.padEnd(5)}`,
    `unsaid ${`${t.facts.notToldFirm}+${t.facts.notToldNear}/${t.facts.said}`.padEnd(8)}`,
    `told ${`${t.coverage.told}/${t.coverage.facts}`.padEnd(5)}`,
    `ways ${t.styles.offers ? `${t.styles.kept}/${t.styles.options}` : '—'}`.padEnd(9),
    `list ${t.retell.retellings ? `${t.retell.coversAll}/${t.retell.retellings}` : '—'}`.padEnd(8),
    `misread ${t.answers.profile.clearReadUnclear + t.answers.retell.clearReadUnclear + t.answers.profile.unclearReadSettled + t.answers.retell.unclearReadSettled}`,
  ];
  return cells.join('  ');
}

// ── a run, and two runs compared ─────────────────────────────────────────────────────────────────

export type Inputs = {
  /** The folder the conversations were read from, relative to this dreamchat folder where it is inside it. */
  data: string;
  sessions: Record<string, string>;
  facts: string;
  dreams: Record<string, string>;
  /** The hash of every question's wording (questionsHash). */
  questions: string;
};

/** A run's counts, without the replies: what --summary writes and --against reads. */
export type Summary = {
  label: string;
  at: string;
  commit: string | null;
  switches: Record<string, string>;
  jevModel: string;
  inputs: Inputs;
  /** The headline: the simulated conversations only. */
  totals: Sums;
  /** The same counts over what the replays said anew. */
  replays: Sums;
  /** The simulated conversations' counts, dream by dream. */
  byDream: Record<string, Sums>;
  sessions: { key: string; dream: string | null; origin: Loaded['origin']; hash: string; sums: Sums }[];
  /** Every remaining flag of a 0 target, for a hand check: said facts (firm, and near the bar) and leading replies. */
  flags: {
    unsaid: { key: string; statement: string; told: number; from: string[] }[];
    near: { key: string; statement: string; told: number; from: string[] }[];
    leading: { key: string; turn: number; p: number; text: string }[];
  };
};
export type RunFile = Summary & { sessions: (Summary['sessions'][number] & Partial<SessionScore>)[] };

/** A run's counts and flags, from its scored conversations. */
export function summarize(
  head: Omit<Summary, 'totals' | 'replays' | 'byDream' | 'sessions' | 'flags'>,
  scores: SessionScore[],
): Summary {
  const sims = scores.filter((s) => s.origin === 'simulated');
  const byDream: Record<string, Sums> = {};
  for (const d of [...new Set(sims.map((s) => s.dream ?? '?'))].sort())
    byDream[d] = addSums(sims.filter((s) => (s.dream ?? '?') === d).map((s) => s.sums));
  const flagged = (lo: number, hi: number) =>
    sims.flatMap((s) =>
      s.facts
        .filter((f) => f.told !== null && f.told >= lo && f.told < hi)
        .map((f) => ({ key: s.key, statement: f.statement, told: f.told as number, from: f.from })),
    );
  return {
    ...head,
    totals: addSums(sims.map((s) => s.sums)),
    replays: addSums(scores.filter((s) => s.origin === 'replay').map((s) => s.sums)),
    byDream,
    sessions: scores.map((s) => ({ key: s.key, dream: s.dream, origin: s.origin, hash: s.hash, sums: s.sums })),
    flags: {
      unsaid: flagged(0, NEAR),
      near: flagged(NEAR, YES),
      leading: sims.flatMap((s) =>
        s.replies
          .filter((r) => !r.copied && yes(r.leading))
          .map((r) => ({ key: s.key, turn: r.turn, p: r.leading as number, text: r.text.slice(0, 400) })),
      ),
    },
  };
}

/** One dream's row of the comparison table. */
function dreamRow(t: Sums | undefined): string[] {
  if (!t) return ['—', '—', '—', '—', '—', '—', '—'];
  const r = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');
  return [
    String(t.conversations),
    r(t.compliance.listen[0], t.compliance.listen[1]),
    r(t.listening.eitherOr, t.listening.asking),
    r(t.listening.leading, t.listening.replies),
    r(t.facts.notToldFirm, t.facts.said),
    r(t.coverage.told + t.coverage.askedNotTold, t.coverage.facts),
    `${t.stages.retelling}/${t.stages.style}/${t.stages.profile}`,
  ];
}

/**
 * What moved between two runs: the headline numbers and floors, and a table dream by dream (fresh
 * conversations are new every run, so they pair by dream, never by conversation). Replies are compared
 * one by one only where a conversation is the very same file in both.
 */
export function compare(before: Summary | RunFile, now: Summary | RunFile): string[] {
  const lines: string[] = [`\n${before.label} -> ${now.label}`];
  if (before.inputs.facts !== now.inputs.facts) lines.push('the dream facts file changed');
  if (before.inputs.questions !== now.inputs.questions) lines.push('the questions are worded differently');
  if (before.jevModel !== now.jevModel) lines.push(`Jev model ${before.jevModel} -> ${now.jevModel}`);
  const a = headline(before.totals);
  const b = headline(now.totals, before.totals);
  for (let i = 0; i < b.length; i++)
    lines.push(
      `  ${b[i].met === null ? ' ' : b[i].met ? '✓' : '✗'} ${b[i].name}: ${a[i]?.value ?? '—'}  ->  ${b[i].value}`,
    );
  const head = ['dream', 'convs', 'listen', 'either/or', 'leading', 'unsaid', 'told/asked', 'ret/style/prof'];
  lines.push('', `  ${head.map((h, i) => h.padEnd(i ? 11 : 17)).join('')}`);
  for (const d of [...new Set([...Object.keys(before.byDream), ...Object.keys(now.byDream)])].sort()) {
    const x = dreamRow(before.byDream[d]);
    const y = dreamRow(now.byDream[d]);
    lines.push(`  ${d.padEnd(17)}${x.map((v, i) => `${v}${v === y[i] ? '' : `>${y[i]}`}`.padEnd(11)).join('')}`);
  }
  const same = new Map(before.sessions.map((s) => [`${s.key}#${s.hash}`, s]));
  for (const s of now.sessions as Partial<SessionScore>[]) {
    const p = same.get(`${s.key}#${s.hash}`) as Partial<SessionScore> | undefined;
    if (!p?.replies || !s.replies) continue;
    for (const r of s.replies) {
      const o = p.replies.find((x) => x.turn === r.turn && x.move === r.move);
      if (o && o.pass !== r.pass && r.pass !== null && o.pass !== null)
        lines.push(
          `  ${s.key} turn ${r.turn} ${r.move}: ${o.pass ? 'did' : 'missed'} (${o.p?.toFixed(2)}) -> ${r.pass ? 'did' : 'missed'} (${r.p?.toFixed(2)})`,
        );
    }
  }
  return lines;
}

// ── the hand-labelled replies ────────────────────────────────────────────────────────────────────

/** A reply read by hand, kept whole so its questions can be asked anywhere (evals/listening-audit.json). */
export type AuditItem = {
  id: string;
  session: string;
  dream: string;
  turn: number;
  move: Move;
  rule: string;
  phase: string;
  /** Its brief, from the move on. */
  brief: string;
  /** The conversation up to and including the reply. */
  transcript: { role: 'user' | 'assistant'; content: string }[];
  /** What the hand read found: the reply did its move, asked an either/or question, brought in a detail. */
  labels: { move: boolean; eitherOr?: boolean; leading?: boolean };
  note?: string;
};
export const AUDIT_FILE = join(import.meta.dir, 'listening-audit.json');

/** An audited reply as the scorer sees it. */
export function auditReply(a: AuditItem): Reply {
  const person = a.transcript.filter((e) => e.role === 'user').map((e) => e.content);
  return {
    turn: a.turn,
    move: a.move,
    key: moveKey(a.move),
    rule: a.rule,
    phase: a.phase,
    brief: a.brief,
    group: groupOf(a.move.kind),
    text: a.transcript.at(-1)?.content ?? '',
    raw: null,
    said: person.slice(0, a.turn),
    last: a.turn > 0 ? (person[a.turn - 1] ?? null) : null,
    copied: false,
  };
}

/** Each label against Jev's answer: agreed, and the ones that did not. */
export function auditAgreement(items: AuditItem[], get: (a: Ask) => number | null) {
  const out: Record<'move' | 'eitherOr' | 'leading', { agree: number; of: number; missed: string[] }> = {
    move: { agree: 0, of: 0, missed: [] },
    eitherOr: { agree: 0, of: 0, missed: [] },
    leading: { agree: 0, of: 0, missed: [] },
  };
  for (const it of items) {
    const asks = replyAsks(auditReply(it), { transcript: it.transcript as Entry[] });
    for (const k of ['move', 'eitherOr', 'leading'] as const) {
      const want = it.labels[k];
      if (want === undefined) continue;
      const p =
        k === 'leading'
          ? asks.invents
            ? leadingOf(asks.leading ? get(asks.leading) : undefined, get(asks.invents))
            : null
          : asks[k]
            ? get(asks[k] as Ask)
            : null;
      if (p === null) continue;
      out[k].of += 1;
      if (yes(p) === want) out[k].agree += 1;
      else out[k].missed.push(`${it.id} (${p.toFixed(2)}, hand ${want ? 'yes' : 'no'})`);
    }
  }
  return out;
}

// ── finding and freezing the conversations ───────────────────────────────────────────────────────

/** Every folder of conversations under a data folder: its state/ and fake-picture runs, or the folder itself. */
export function stateDirs(data: string): string[] {
  if (!existsSync(join(data, 'state'))) return existsSync(data) && sessionFiles(data).length ? [data] : [];
  const out = [join(data, 'state')];
  const runs = join(data, 'runs');
  const walk = (d: string, depth: number) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (!statSync(p).isDirectory() || /^(?:home-|judge-img$|media$|fixtures$)/.test(e)) continue;
      if (e === 'state') out.push(p);
      else if (depth > 0) walk(p, depth - 1);
    }
  };
  if (existsSync(runs))
    for (const e of readdirSync(runs).sort())
      if (/^(?:replay-fake|record-fake)/.test(e) && statSync(join(runs, e)).isDirectory()) walk(join(runs, e), 3);
  return out;
}

const sessionFiles = (dir: string) =>
  readdirSync(dir)
    .filter((f) => /^dream-.*\.json$/.test(f))
    .sort()
    .map((f) => join(dir, f));

/** A frozen conversation: what the test reads, with its turn details kept inside it. */
type Frozen = Session & { listening_details?: Record<string, TurnDetail> };

/** Reads a conversation, with its dream and a replay's source; null when it is not a simulated one. */
export function load(path: string, data: string, sources: Map<string, string>): Loaded | null {
  const text = readFileSync(path, 'utf8');
  const session = JSON.parse(text) as Frozen;
  const named = nameOf(session.name ?? '');
  if (!named) return null;
  const rel = relative(data, path);
  const key =
    rel.startsWith('..') || /^state\//.test(rel) || !rel.includes('/')
      ? basename(path, '.json')
      : rel.replace(/\.json$/, '');
  const sp = named.source ? sources.get(named.source) : undefined;
  return {
    key,
    path,
    session,
    hash: sha256(text),
    dream: named.dream,
    origin: named.origin,
    source: sp ? (JSON.parse(readFileSync(sp, 'utf8')) as Session) : null,
    sourceId: named.source,
    ...(session.listening_details ? { details: session.listening_details } : {}),
  };
}

/** A conversation's turn detail: frozen with it, or turn-<n>.json beside it. */
export function readDetail(l: Pick<Loaded, 'path' | 'details'>, turn: number): TurnDetail | null {
  if (l.details) return l.details[String(turn)] ?? null;
  const p = join(l.path.replace(/\.json$/, ''), `turn-${turn}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as TurnDetail;
  } catch {
    return null;
  }
}

/** A brief from its move on: all the test reads of it. */
const fromMove = (brief: string) => (brief.includes('Move:') ? brief.slice(brief.indexOf('Move:')) : brief);

/**
 * A conversation cut to what the listening test reads, its turn details inside it, so a set can be kept
 * in the repository and scored on any machine: the transcript, each turn's move and brief from the move
 * on, the goals, the breakdown's looks, people, places, things and moments, the sketches' profiles; per
 * turn, the host's words where the repair changed them, the readings of profile and retelling answers,
 * and the goals when the dream was first told back.
 */
export function freeze(l: Loaded, detail: (turn: number) => TurnDetail | null): Frozen {
  const s = l.session;
  const b = s.draft?.breakdown;
  const assistant = s.transcript.filter((e) => e.role === 'assistant').map((e) => e.content);
  const details: Record<string, TurnDetail> = {};
  const retold = s.turns.find((t) => t.move.kind === 'retell' && t.phase === 'retell')?.turn;
  s.turns.forEach((t, i) => {
    const d = detail(t.turn);
    if (!d) return;
    const out: TurnDetail = {};
    const raw = rawText(d.hostRaw);
    if (d.hostRaw && raw !== assistant[i]) out.hostRaw = d.hostRaw;
    const sig = d.stateAfter?.signals ?? {};
    const signals = Object.fromEntries(
      ['profile_reply', 'retell_reply'].filter((k) => sig[k] !== undefined && sig[k] !== null).map((k) => [k, sig[k]]),
    );
    if (Object.keys(signals).length || (t.turn === retold && d.stateAfter?.goals))
      out.stateAfter = {
        ...(Object.keys(signals).length ? { signals } : {}),
        ...(t.turn === retold && d.stateAfter?.goals ? { goals: d.stateAfter.goals } : {}),
      };
    const ans = Object.fromEntries(
      ['profile_reply', 'retell_reply'].filter((k) => d.jevAnswers?.[k]).map((k) => [k, d.jevAnswers?.[k] as Answer]),
    );
    if (Object.keys(ans).length) out.jevAnswers = ans;
    if (Object.keys(out).length) details[String(t.turn)] = out;
  });
  return {
    id: s.id,
    name: s.name,
    phase: s.phase,
    transcript: s.transcript.map((e) => ({ role: e.role, content: e.content })),
    turns: s.turns.map((t) => ({
      turn: t.turn,
      move: t.move,
      rule: t.rule,
      phase: t.phase,
      brief: fromMove(t.brief ?? ''),
    })),
    state: { goals: s.state?.goals },
    ...(b
      ? {
          draft: {
            status: s.draft?.status,
            breakdown: {
              look: b.look,
              people: b.people.map((p) => ({ id: p.id, name: p.name, is_dreamer: p.is_dreamer, fields: p.fields })),
              places: b.places.map((p) => ({ id: p.id, name: p.name, fields: p.fields })),
              things: b.things.map((p) => ({ id: p.id, name: p.name, fields: p.fields })),
              scenes: b.scenes.map((sc) => ({
                id: sc.id,
                moments: sc.moments.map((m) => ({ id: m.id, action: m.action, said: m.said, key: m.key })),
              })),
            },
          },
        }
      : {}),
    ...(s.build
      ? {
          build: {
            items: s.build.items.map((i) => ({
              id: i.id,
              kind: i.kind,
              name: i.name,
              fields: i.fields,
              ...(i.isDreamer ? { isDreamer: true } : {}),
            })),
          },
        }
      : {}),
    listening_details: details,
  } as unknown as Frozen;
}

/**
 * The conversations the arguments name: session ids, session files, folders of them, simulate.ts
 * reports (their conversations by id) and dreams (every simulated conversation of one). None: all.
 */
export function resolveArgs(args: string[], data: string): { paths: string[]; dreams: string[]; unknown: string[] } {
  const dirs = [...new Set([join(DIR, 'state'), ...stateDirs(data)].filter((d) => existsSync(d)))];
  const byId = new Map<string, string>();
  for (const d of dirs)
    for (const f of sessionFiles(d)) if (!byId.has(basename(f, '.json'))) byId.set(basename(f, '.json'), f);
  const paths: string[] = [];
  const dreams: string[] = [];
  const unknown: string[] = [];
  const dreamNames = new Set(
    readdirSync(join(DIR, 'dreams'))
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((f) => f.slice(0, -3)),
  );
  for (const a of args) {
    const p = resolve(a);
    if (/^dream-\d{4}-\d{6}-[0-9a-f]{4}$/.test(a)) {
      const f = byId.get(a);
      if (f) paths.push(f);
      else unknown.push(a);
    } else if (a.endsWith('.md') || dreamNames.has(a)) {
      const name = basename(a, '.md');
      if (dreamNames.has(name)) dreams.push(name);
      else unknown.push(a);
    } else if (existsSync(p) && statSync(p).isDirectory()) paths.push(...sessionFiles(p));
    else if (existsSync(p) && p.endsWith('.json')) {
      const v = JSON.parse(readFileSync(p, 'utf8')) as unknown;
      if (Array.isArray(v))
        for (const r of v as { id?: string }[]) {
          const f = r.id ? byId.get(r.id) : undefined;
          if (f) paths.push(f);
          else unknown.push(`${a}: ${r.id ?? '(no id)'}`);
        }
      else paths.push(p);
    } else unknown.push(a);
  }
  if (!paths.length) for (const d of stateDirs(data)) paths.push(...sessionFiles(d));
  return { paths: [...new Set(paths)], dreams, unknown };
}

export const RUNS = join(DIR, 'runs', 'listening');

// ── the command ──────────────────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const { jevAvailable, jevWithModel } = await import('../jev');
  const args = process.argv.slice(2);
  const valued = new Set(['--label', '--against', '--data', '--summary', '--freeze']);
  const valueOf = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const label = valueOf('--label') ?? 'latest';
  const against = valueOf('--against');
  const noAsk = args.includes('--no-ask');
  const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && valued.has(args[i - 1])));
  const data = valueOf('--data') ? resolve(valueOf('--data') as string) : dataDir();

  mkdirSync(RUNS, { recursive: true });
  const cacheFile = join(RUNS, 'jev-cache.json');
  const cache: JevCache = existsSync(cacheFile) ? (JSON.parse(readFileSync(cacheFile, 'utf8')) as JevCache) : {};
  const model = JEV_MODEL();
  const canAsk = !noAsk && jevAvailable();
  const jev = jevWithModel(model);
  /** Scores until nothing more can be asked: `score` is given Jev's answers so far and collects what it lacks. */
  const scoreAll = async <T>(score: (get: (a: Ask) => number | null) => T): Promise<T> => {
    let out = score(() => null);
    for (let round = 0; round < 5; round++) {
      const need: Ask[] = [];
      out = score((a) => {
        const hit = cache[askKey(a, model)];
        if (hit) return hit.p;
        need.push(a);
        return null;
      });
      if (!need.length || !canAsk) break;
      const before = Object.keys(cache).length;
      let last = 0;
      const errors = await askAll(need, jev, cache, {
        model,
        progress: (done, of) => {
          if (done - last >= 50 || done === of) {
            last = done;
            console.log(`  Jev: ${done}/${of} calls`);
            writeFileSync(cacheFile, `${JSON.stringify(cache)}\n`);
          }
        },
      });
      writeFileSync(cacheFile, `${JSON.stringify(cache)}\n`);
      console.log(`Jev (${model}), round ${round + 1}: ${Object.keys(cache).length - before} questions asked`);
      for (const e of errors.slice(0, 5)) console.log(`Jev: ${e}`);
      if (Object.keys(cache).length === before) break;
    }
    if (!canAsk)
      console.log(
        noAsk
          ? '--no-ask: questions not in the cache are left unanswered'
          : 'no JEV_API_KEY: questions not in the cache are left unanswered (run with --env-file)',
      );
    return out;
  };

  if (args.includes('--audit')) {
    const items = (JSON.parse(readFileSync(AUDIT_FILE, 'utf8')) as { items: AuditItem[] }).items;
    const agreement = await scoreAll((get) => auditAgreement(items, get));
    console.log(`\nhand-labelled replies (${AUDIT_FILE}), Jev ${model}, questions ${questionsHash()}:`);
    for (const [k, v] of Object.entries(agreement))
      console.log(`  ${k}: ${v.agree}/${v.of} agree${v.missed.length ? `; not: ${v.missed.join(', ')}` : ''}`);
    process.exit(0);
  }

  const { paths, dreams, unknown } = resolveArgs(positional, data);
  if (unknown.length) {
    console.error(`not found: ${unknown.join(', ')}`);
    process.exit(1);
  }
  const sources = new Map<string, string>();
  for (const d of [join(data, 'state'), join(DIR, 'state')])
    if (existsSync(d)) for (const f of sessionFiles(d)) sources.set(basename(f, '.json'), f);
  const loaded = paths
    .map((p) => load(p, data, sources))
    .filter((l): l is Loaded => l !== null && (!dreams.length || (l.dream !== null && dreams.includes(l.dream))));
  if (!loaded.length) {
    console.error('no simulated conversations to score');
    process.exit(1);
  }

  const freezeTo = valueOf('--freeze');
  if (freezeTo) {
    const out = resolve(freezeTo);
    mkdirSync(out, { recursive: true });
    for (const l of loaded.filter((x) => x.origin === 'simulated'))
      writeFileSync(join(out, `${basename(l.path)}`), `${JSON.stringify(freeze(l, (t) => readDetail(l, t)))}\n`);
    console.log(`frozen ${loaded.filter((x) => x.origin === 'simulated').length} conversations into ${out}`);
    process.exit(0);
  }

  const texts = new Map<string, string | null>();
  const env: Env = {
    facts: loadFacts(),
    dreamText: (n) => {
      if (!texts.has(n)) texts.set(n, dreamFileText(n));
      return texts.get(n) ?? null;
    },
    detail: readDetail,
  };
  const scores = await scoreAll((get) => loaded.map((l) => scoreSession(l, env, get)));

  const rel = relative(DIR, data);
  const head = {
    label,
    at: new Date().toISOString(),
    commit: commitOf(),
    switches: switches(),
    jevModel: model,
    inputs: {
      data: rel.startsWith('..') ? data : rel || '.',
      sessions: Object.fromEntries(loaded.map((l) => [l.key, l.hash])),
      facts: sha256(readFileSync(FACTS_FILE, 'utf8')),
      dreams: Object.fromEntries(
        [...new Set(loaded.map((l) => l.dream).filter((d): d is string => !!d))].map((d) => [
          d,
          sha256(env.dreamText(d) ?? ''),
        ]),
      ),
      questions: questionsHash(),
    },
  };
  const summary = summarize(head, scores);
  const run: RunFile = {
    ...summary,
    sessions: scores.map((s) => ({ ...s, key: s.key, dream: s.dream, origin: s.origin, hash: s.hash, sums: s.sums })),
  };

  if (args.includes('--flags')) {
    console.log('\nsaid, not in their words (Jev under 0.3):');
    for (const f of summary.flags.unsaid)
      console.log(`  ${f.told.toFixed(2)} ${f.key} ${f.statement} [${f.from.join(', ')}]`);
    console.log(`\nnear the bar (${NEAR}-${YES}):`);
    for (const f of summary.flags.near)
      console.log(`  ${f.told.toFixed(2)} ${f.key} ${f.statement} [${f.from.join(', ')}]`);
    console.log('\nleading replies:');
    for (const f of summary.flags.leading)
      console.log(`  ${f.p.toFixed(2)} ${f.key} turn ${f.turn}: ${f.text.replace(/\n+/g, ' / ')}`);
  }
  const sims = loaded.filter((l) => l.origin === 'simulated').length;
  console.log(
    `\n${label}: ${scores.length} conversations (${sims} simulated, ${loaded.length - sims} replays), read from ${head.inputs.data}; questions ${head.inputs.questions}`,
  );
  for (const s of scores) console.log(`  ${sessionLine(s)}`);

  // Read before this run is written: --against its own label compares with the run it replaces.
  const againstPath = against ? (existsSync(against) ? resolve(against) : join(RUNS, `${against}.json`)) : null;
  const before =
    againstPath && existsSync(againstPath) ? (JSON.parse(readFileSync(againstPath, 'utf8')) as Summary) : null;
  console.log('\nSimulated conversations (the headline):');
  for (const h of headline(summary.totals, before?.totals))
    console.log(`  ${h.met === null ? ' ' : h.met ? '✓' : '✗'} ${h.name}: ${h.value}  [target ${h.target}]`);
  for (const l of detailLines(summary.totals)) console.log(`    ${l}`);
  if (summary.replays.replies) {
    console.log('\nWhat the replays said anew (shown, not the headline):');
    for (const h of headline(summary.replays).filter((x) => !x.name.startsWith('floor')))
      console.log(`    ${h.name}: ${h.value}`);
  }
  const file = join(RUNS, `${label}.json`);
  writeFileSync(file, `${JSON.stringify(run, null, 1)}\n`);
  console.log(`\nwritten ${file}`);
  const summaryTo = valueOf('--summary');
  if (summaryTo) {
    writeFileSync(resolve(summaryTo), `${JSON.stringify(summary, null, 1)}\n`);
    console.log(`written ${resolve(summaryTo)}`);
  }
  if (against) {
    if (!before) console.log(`no run labelled ${against} (${againstPath})`);
    else for (const l of compare(before, run)) console.log(l);
  }
}
