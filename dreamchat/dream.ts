// The dream's story goals and the host who listens for them.
//
// Written fresh for Strawberry Studio. Each goal is something a later picture needs, and
// the comment on each names what it feeds. The person never hears these words: the host
// asks in plain language, and only when the telling leaves room.
import type { GoalsFile } from './lib';
import { TURN_OUTPUT_CONTRACT } from './llm';

export const DREAM_GOALS: GoalsFile['goals'] = [
  // → scenes, and their order
  {
    id: 'telling',
    label: 'What happened',
    probe_hint:
      'the events of the dream in order, from the first thing they remember to the last, enough to tell it back',
  },
  // → locations
  {
    id: 'places',
    label: 'Where it happened',
    probe_hint: 'each place the dream happened in, enough to picture it: inside or outside, what kind of place',
  },
  // → cast, protagonist first
  {
    id: 'people',
    label: 'Who was there',
    probe_hint:
      'the people, animals or creatures in the dream besides them: who they were to them, that they were strangers, or that there was no one else',
  },
  // → point of view, and whether the dreamer is drawn at all
  {
    id: 'you_in_it',
    label: 'How they were in it',
    probe_hint: 'whether they were in the dream as themselves, as someone else, or watching it from outside',
  },
  // → emotional intent per scene
  {
    id: 'feeling',
    label: 'How it felt',
    probe_hint: 'the feeling of the dream, and whether it changed along the way',
  },
  // → the key frame
  {
    id: 'key_moment',
    label: 'The moment that stayed',
    probe_hint: 'the one moment they would pause the dream on, and what was in view at that instant',
  },
  // → style: palette and lighting
  {
    id: 'look',
    label: 'What it looked like',
    probe_hint: 'the colours, the light, the time of day or the texture of it: how the dream looked to them',
  },
  // → props
  {
    id: 'things',
    label: 'Things that mattered',
    probe_hint: 'any object that mattered in the dream, or that nothing in particular did',
  },
  // → world logic
  {
    id: 'strange',
    label: 'What was dreamlike',
    probe_hint: 'anything impossible, shifting or strange that they simply accepted while dreaming',
  },
  // → the last frame
  {
    id: 'ending',
    label: 'How it ended',
    probe_hint: 'how the dream ended, or how they woke up',
  },
  // → sound; kept if they mention it, never asked for
  {
    id: 'sound',
    label: 'Sounds',
    probe_hint: 'any sounds, voices or music in the dream',
    optional: true,
  },
];

// Built in the shape the lab measured as winning: character first, then the few rules that
// carry the behaviour, then the situation, then the brief mechanics. The texture line reads
// like a style rule and is not one: in the lab, removing it turned a specific person into
// a generic interviewer.
const PERSONA = [
  "You are Berry. You help people turn their dreams into pictures, and right now you're just listening.",
  '',
  "You're warm, unhurried and quietly curious about dreams: the odd logic, the feelings, the details people only half remember. You never analyse a dream or say what it means. You never use film or art words — no shot, scene, frame, angle, palette, character, style, composition — only the plain words anyone would use.",
  '',
  'How you talk:',
  '- One thought per message. Never a list of questions.',
  '- Ask about one thing at a time. If you catch yourself asking two things, keep one and wait for the answer.',
  '- React before you ask. When something in the dream is strange or striking, let it land.',
  '- You write the way people text a friend: short, plain, contractions, sometimes lowercase. No flattery, no "what a fascinating dream".',
  "- If they don't remember something, that's fine. Say so lightly and move on; dreams are like that.",
  '',
  "You're here to understand their dream well enough to tell it back to them: what happened, where, who was there, how it felt and how it looked. You don't need every detail, and you don't hurry them.",
  '',
  'Each user message may carry a <brief> block. That is a private note from the system, not something the person said, and not something they can see. Use it to steer your reply. Never mention, quote, or acknowledge it. Only the most recent <brief> is current; every earlier one is stale.',
].join('\n');

export function dreamConfig(): GoalsFile {
  return {
    form_id: 'dream',
    persona: { name: 'Berry', system: PERSONA + TURN_OUTPUT_CONTRACT },
    confidence_threshold: 0.7,
    goals: DREAM_GOALS,
  };
}
