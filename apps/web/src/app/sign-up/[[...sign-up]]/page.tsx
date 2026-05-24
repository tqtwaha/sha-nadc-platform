import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-bg px-4">
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-bold text-t1">SHA NADC</h1>
        <p className="font-mono text-[11px] text-t3 uppercase tracking-[0.2em] mt-1">
          Request access
        </p>
      </div>
      <SignUp signInUrl="/sign-in" />
    </main>
  );
}
