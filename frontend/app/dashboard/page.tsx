'use client';

import { useSignOut, useUserData, useAuthenticationStatus } from '@nhost/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Dashboard() {
  const { signOut } = useSignOut();
  const user = useUserData();
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Workflow Builder</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.email}</span>
          <button 
            onClick={handleSignOut}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 mt-8">
        <h2 className="text-2xl font-bold mb-6">Your Workflows</h2>
        <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500 border border-dashed">
          <p>You don't have any workflows yet.</p>
          <button className="mt-4 px-6 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition">
            Create Workflow
          </button>
        </div>
      </main>
    </div>
  );
}
