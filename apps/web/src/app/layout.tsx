import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SHA NADC — Operations Platform',
  description:
    'SHA National Ambulance Dispatch Centre — real-time emergency coordination platform for the Republic of Kenya.',
};

export const viewport: Viewport = {
  themeColor: '#00519B',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
