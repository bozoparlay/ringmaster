import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ringmaster',
  description: 'Direct the circus. Orchestrate your backlog.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="grain">
        <div className="spotlight" />
        {children}
      </body>
    </html>
  );
}
