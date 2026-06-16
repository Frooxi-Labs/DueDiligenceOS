'use client';

import { usePathname, useRouter } from 'next/navigation';
import Guide, { type GuideStep } from './Guide';

/** Dashboard product tour — auto-runs once, replayable from the floating button. */
const STEPS: GuideStep[] = [
  {
    title: 'Welcome to DueDiligenceOS',
    body: 'A committee of AI agents that runs real-estate due diligence end to end, coordinated through Band. Here’s a 30-second tour.',
  },
  {
    target: 'new-run',
    title: 'Start a run',
    body: 'Paste or upload a deal package — title deed, contract, inspection, disclosures — and the committee convenes automatically.',
  },
  {
    target: 'committee',
    title: 'Meet the committee',
    body: 'Five TypeScript agents plus three Python specialists. Tap any agent to see what it does and how active it’s been.',
  },
  {
    target: 'analytics',
    title: 'Track the work',
    body: 'Committee throughput and a contribution graph of every event — messages, contradictions, recruitments — over time.',
  },
  {
    target: 'sidebar',
    title: 'Your workspace',
    body: 'Every run lives here. Open one to watch the live room, inspect the audit trail, and simulate counterfactual decisions.',
  },
  {
    title: 'You’re set',
    body: 'Start your first run and watch the committee deliberate in real time.',
  },
];

export default function Tour() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname !== '/') return null;
  return (
    <Guide
      storageKey="ddos.tour.v1"
      steps={STEPS}
      trigger
      replay
      replayLabel="Take the tour"
      finalLabel="Start a run →"
      onFinal={() => router.push('/deals/new')}
    />
  );
}
