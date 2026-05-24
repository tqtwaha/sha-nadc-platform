import { SignIn } from '@clerk/nextjs';

// Sign-in route. Renders Clerk's hosted form when keys are present.
// Falls back to a friendly notice when keys are missing so the page
// doesn't 500 in demo mode.

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function SignInPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-bg px-4">
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold text-t1">SHA NADC</h1>
        <p className="font-mono text-[11px] text-t3 uppercase tracking-[0.2em] mt-1">
          National Ambulance Dispatch Centre
        </p>
      </div>
      {clerkConfigured ? (
        <SignIn signUpUrl="/sign-up" />
      ) : (
        <div className="max-w-md w-full border border-line rounded-lg bg-bg1 p-6 text-center">
          <p className="text-t2 text-sm">
            Authentication is not yet configured for this deployment.
          </p>
          <p className="font-mono text-[11px] text-t3 mt-2">
            Set <span className="text-t1">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</span> and{' '}
            <span className="text-t1">CLERK_SECRET_KEY</span> in Vercel env to enable sign-in.
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
