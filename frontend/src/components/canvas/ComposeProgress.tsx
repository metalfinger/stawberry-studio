import { useEffect, useRef, useState } from 'react';
import { streamComposeCut, type ComposeStepEvent } from '../../api/client';

const STEP_ORDER = ['bundle', 'pick', 'preprod', 'prompt', 'render', 'critic', 'register'] as const;
type StepName = (typeof STEP_ORDER)[number];

const STEP_LABELS: Record<StepName, string> = {
  bundle: 'Bundle context',
  pick: 'Pick references',
  preprod: 'Pre-production',
  prompt: 'Compile prompt',
  render: 'Render image',
  critic: 'Continuity critic',
  register: 'Register reference',
};

interface Props {
  projectId: string;
  cutId: string;
  running: boolean;
  onDone?: (imageUrl: string | null) => void;
}

export function ComposeProgress({ projectId, cutId, running, onDone }: Props) {
  const [statuses, setStatuses] = useState<Record<string, ComposeStepEvent>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!running) return;
    setStatuses({});
    setDone(false);
    setError(null);
    const ws = streamComposeCut(projectId, cutId, (ev) => {
      if (ev.type === 'compose_step' && ev.step) {
        setStatuses((s) => ({ ...s, [ev.step!]: ev }));
        if (ev.step === 'register' && ev.status === 'ok' && ev.detail) {
          // image_url comes from the render step
        }
      } else if (ev.type === 'compose_done') {
        setDone(true);
        setStatuses((s) => {
          const renderUrl = (s.render?.detail?.image_url as string | undefined) ?? null;
          onDone?.(renderUrl);
          return s;
        });
      } else if (ev.type === 'compose_error') {
        setError(ev.error ?? 'unknown error');
        setDone(true);
        onDone?.(null);
      }
    });
    wsRef.current = ws;
    return () => {
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, projectId, cutId]);

  if (!running && Object.keys(statuses).length === 0) return null;

  return (
    <div className="compose-progress">
      <div className="compose-progress__header">
        {done ? (error ? `Failed: ${error}` : 'Compose complete') : 'Composing cut…'}
      </div>
      <ul className="compose-progress__list">
        {STEP_ORDER.map((step) => {
          const ev = statuses[step];
          const status = ev?.status ?? 'pending';
          const detail = ev?.detail ?? {};
          const summary = summarize(step, status, detail);
          return (
            <li key={step} className={`compose-progress__row compose-progress__row--${status}`}>
              <span className="compose-progress__icon">{iconFor(status)}</span>
              <span className="compose-progress__label">{STEP_LABELS[step]}</span>
              {summary && <span className="compose-progress__summary">{summary}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function iconFor(status: string): string {
  switch (status) {
    case 'ok':
      return '✓';
    case 'error':
      return '✗';
    case 'skip':
      return '↷';
    case 'start':
      return '…';
    default:
      return '·';
  }
}

function summarize(step: StepName, status: string, d: Record<string, unknown>): string {
  if (status === 'pending' || status === 'start') return '';
  if (status === 'error') return String(d.error ?? 'error');
  if (status === 'skip') return String(d.reason ?? 'skipped');
  switch (step) {
    case 'bundle': {
      const stats = d.stats as Record<string, number> | undefined;
      if (!stats) return '';
      return `${stats.siblings_in_scene ?? 0} siblings · ${stats.linked_characters ?? 0} chars`;
    }
    case 'pick':
      return `${d.count ?? 0} refs`;
    case 'preprod':
      return d.filled ? `filled ${d.filled}` : '';
    case 'prompt': {
      const slots = d.slots as string[] | undefined;
      return `${(d.prompt_chars as number) ?? 0} chars · ${slots?.length ?? 0} slots`;
    }
    case 'render':
      return `attempt ${d.attempt ?? 1}`;
    case 'critic': {
      const overall = d.overall as number | undefined;
      const passed = d.passed as boolean | undefined;
      return overall != null ? `${(overall * 100).toFixed(0)}% ${passed ? 'pass' : 'retry'}` : '';
    }
    case 'register':
      return 'indexed';
    default:
      return '';
  }
}
