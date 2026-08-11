'use client';

import { useAuthenticationStatus } from '@nhost/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-paper bg-ink">Loading...</div>;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24 bg-ink text-paper">
      <h1 className="text-5xl font-bold mb-8">AI Agent Workflow Builder</h1>
      <p className="text-xl mb-12 text-slate text-center max-w-2xl">
        A powerful platform to build, automate, and trigger intelligent AI workflows across your organization.
      </p>
      
      <div className="flex gap-4">
        <Link 
          href="/login" 
          className="px-6 py-3 rounded-lg bg-signal text-white font-medium hover:opacity-90 transition"
        >
          Sign In
        </Link>
        <Link 
          href="/signup" 
          className="px-6 py-3 rounded-lg border border-trace bg-panel font-medium hover:opacity-80 transition"
        >
          Create Account
        </Link>
      </div>
    </div>
  );
}
