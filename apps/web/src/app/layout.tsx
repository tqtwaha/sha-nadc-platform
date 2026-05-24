import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { AuthSlot } from '@/components/AuthSlot';
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

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// ClerkProvider is only mounted when keys exist. Without it the app
// runs as an unauthenticated demo — middleware.ts has the matching
// gate so /sign-in returns a placeholder and protected routes stay open.

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen">
        {children}
        <AuthSlot />
      </body>
    </html>
  );

  if (clerkConfigured) {
    return (
      <ClerkProvider
        appearance={{
          variables: {
            colorPrimary: '#50C020',
            colorBackground: '#0B0F14',
            colorText: '#FFFFFFF2',
            colorInputBackground: '#161C25',
            colorInputText: '#FFFFFFF2',
            borderRadius: '8px',
            fontFamily: 'Exo 2, system-ui, sans-serif',
          },
        }}
      >
        {body}
      </ClerkProvider>
    );
  }
  return body;
}
