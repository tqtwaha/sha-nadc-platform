import { SignIn } from '@clerk/nextjs';

// Clerk-hosted sign-in. If Clerk isn't configured this route is never hit
// because the middleware no-ops and other routes stay open.

export default function SignInPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-bg px-4">
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold text-t1">SHA NADC</h1>
        <p className="font-mono text-[11px] text-t3 uppercase tracking-[0.2em] mt-1">
          National Ambulance Dispatch Centre
        </p>
      </div>
      <SignIn signUpUrl="/sign-up" />
    </main>
  );
}
