// OnboardingTour — first-run guided overlay.
// Five concise steps explaining the three-pillar UX (Canvas + Console +
// ContextPanel + Library). Stored as a single localStorage flag so it
// never reappears for a returning user. Skippable at any step.
import { useEffect, useState } from 'react'
import './OnboardingTour.css'

const FLAG = 'strawberry.onboarding.v1.done'

interface Step {
  title: string
  body: string
  hint?: string
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Strawberry Studio',
    body: 'A storyboard tool that gets better the more you use it. Talk to agents, approve plans, build a reusable visual library.',
  },
  {
    title: 'The Console drives everything',
    body: 'Type a message in the floating Console to talk to an agent. Agents propose plans — you approve, modify, or cancel. Double-click the header to collapse it.',
    hint: '⌘+Enter to send',
  },
  {
    title: 'Drag references anywhere',
    body: 'Drag any image from the Library or Console into the chat input or onto a cut node. References thread through generations to keep characters and locations consistent.',
  },
  {
    title: 'Library is your visual memory',
    body: 'Every generated image lives in the left rail forever. Search, filter, favorite, set a project-wide style anchor. The agent reuses cached references when it can to save money.',
    hint: '⌘L to open',
  },
  {
    title: 'Click 🔧 to see the agent’s work',
    body: 'The wrench icon in the Console header toggles tool-call traces — useful when you want to see exactly what the agent did under the hood.',
    hint: '⌘K opens the command palette',
  },
]

export function OnboardingTour() {
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!localStorage.getItem(FLAG)) setOpen(true)
  }, [])

  if (!open) return null
  const finish = () => {
    localStorage.setItem(FLAG, '1')
    setOpen(false)
  }

  const s = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="onboarding" role="dialog" aria-label="Onboarding">
      <div className="onboarding__card">
        <div className="onboarding__progress">
          {STEPS.map((_, i) => (
            <span key={i} className={`onboarding__dot ${i === step ? 'onboarding__dot--active' : ''} ${i < step ? 'onboarding__dot--done' : ''}`} />
          ))}
        </div>
        <h2 className="onboarding__title">{s.title}</h2>
        <p className="onboarding__body">{s.body}</p>
        {s.hint && <div className="onboarding__hint">{s.hint}</div>}
        <div className="onboarding__actions">
          <button className="onboarding__skip" onClick={finish}>Skip</button>
          <div style={{ flex: 1 }} />
          {step > 0 && (
            <button className="onboarding__btn" onClick={() => setStep(s => s - 1)}>Back</button>
          )}
          {!isLast ? (
            <button className="onboarding__btn onboarding__btn--primary" onClick={() => setStep(s => s + 1)}>Next</button>
          ) : (
            <button className="onboarding__btn onboarding__btn--primary" onClick={finish}>Get started</button>
          )}
        </div>
      </div>
    </div>
  )
}
