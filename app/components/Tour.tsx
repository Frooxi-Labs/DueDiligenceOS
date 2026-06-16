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
    title: 'The committee',
    body: 'Five TypeScript agents handle intake, regulatory, legal, financial and synthesis, and they recruit three Python quantitative specialists when a deal needs them.',
  },
  {
    target: 'how',
    title: 'How they work',
    body: 'Agents read each other through Band, reconcile contradictions, delegate tasks, then hand you a Red / Yellow / Green memo with conditions.',
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
