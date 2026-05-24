import { SignUp } from '@clerk/nextjs';

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function SignUpPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-bg px-4">
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold text-t1">SHA NADC</h1>
        <p className="font-mono text-[11px] text-t3 uppercase tracking-[0.2em] mt-1">
          Request access
        </p>
      </div>
      {clerkConfigured ? (
        <SignUp signInUrl="/sign-in" />
      ) : (
        <div className="max-w-md w-full border border-line rounded-lg bg-bg1 p-6 text-center">
          <p className="text-t2 text-sm">
            Sign-up isn't enabled — Clerk isn't configured for this deployment.
          </p>
          <a
            href="/"
            className="inline-block mt-5 px-4 py-2 rounded-md bg-g/15 hover:bg-g/25 text-g border border-g/40 text-sm font-display font-medium"
          >
            Continue as guest
          </a>
        </div>
      )}
    </main>
  );
}
