import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'DueDiligenceOS — Multi-Agent Investment Committee',
  description:
    'Specialist AI agents collaborate through Band to evaluate, negotiate, and reach a human-approved decision on real-estate deals.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body
        className="h-full antialiased"
        style={{ background: '#040404', fontFamily: 'var(--font-inter), system-ui, sans-serif' }}
      >
        {children}
      </body>
    </html>
  );
}
