import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-full flex items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <p className="text-xs tracking-[0.2em] text-neutral-500 uppercase mb-4">
          Band of Agents · Track 3
        </p>
        <h1 className="text-4xl font-semibold mb-4">DueDiligenceOS</h1>
        <p className="text-neutral-400 leading-relaxed mb-8">
          Five specialist AI agents — market, due-diligence, risk, legal, and financial —
          collaborate through a Band room: they hand off work, surface disagreements, and reach a
          decision you approve.
        </p>
        <Link
          href="/deals/new"
          className="inline-block rounded-lg bg-white text-black font-medium px-6 py-3 hover:bg-neutral-200 transition"
        >
          Start a deal review →
        </Link>
      </div>
    </main>
  );
}
