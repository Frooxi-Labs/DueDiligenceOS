import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from './components/Sidebar';
import PageTransition from './components/PageTransition';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'DueDiligenceOS — Multi-Agent Due Diligence',
  description:
    'Specialist AI agents collaborate through Band to evaluate a real-estate deal, surface contradictions, and reach a human-approved decision.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="h-full flex antialiased overflow-hidden" style={{ background: '#040404', fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
        <Suspense fallback={<div style={{ width: 240, flexShrink: 0, background: '#040404' }} />}><Sidebar /></Suspense>
        <main
          className="flex-1 my-[10px] mr-[10px] rounded-[18px] overflow-hidden flex flex-col relative min-w-0"
          style={{ background: '#141414' }}
        >
          <PageTransition>{children}</PageTransition>
        </main>
      </body>
    </html>
  );
}
