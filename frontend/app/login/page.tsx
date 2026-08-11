'use client';

import { useSignInEmailPassword } from '@nhost/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [genericError, setGenericError] = useState('');
  
  const { signInEmailPassword, isLoading, isSuccess } = useSignInEmailPassword();
  const router = useRouter();

  const validateEmail = () => {
    if (!email) {
      setEmailError('Email is required');
      return false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Invalid email format');
      return false;
    }
    setEmailError('');
    return true;
  };

  const validatePassword = () => {
    if (!password) {
      setPasswordError('Password is required');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenericError('');
    
    const isEmailValid = validateEmail();
    const isPasswordValid = validatePassword();
    
    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    const result = await signInEmailPassword(email, password);
    if (result.isSuccess) {
      router.push('/dashboard');
    } else {
      // Don't expose detailed security errors
      setGenericError('Invalid email or password');
    }
  };

  if (isSuccess) {
    return <div className="flex h-screen items-center justify-center">Redirecting to dashboard...</div>;
  }

  return (
    <div className="flex h-screen items-center justify-center bg-ink p-4 sm:p-0">
      <div className="w-full max-w-md p-6 sm:p-8 bg-panel rounded-xl shadow-lg border border-trace">
        <h2 className="text-3xl font-bold text-center mb-8 text-paper">Sign In</h2>
        {genericError && <div className="mb-6 p-3 bg-red-50 text-status-error rounded-lg text-sm border border-red-100">{genericError}</div>}
        
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-paper mb-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(''); setGenericError(''); }}
              onBlur={validateEmail}
              className={`w-full px-4 py-2 bg-ink text-paper border rounded-lg focus:ring-2 focus:ring-signal outline-none transition ${emailError ? 'border-status-error' : 'border-trace'}`}
              placeholder="you@example.com"
            />
            {emailError && <p className="mt-1 text-sm text-status-error">{emailError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-paper mb-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(''); setGenericError(''); }}
              onBlur={validatePassword}
              className={`w-full px-4 py-2 bg-ink text-paper border rounded-lg focus:ring-2 focus:ring-signal outline-none transition ${passwordError ? 'border-status-error' : 'border-trace'}`}
              placeholder="••••••••"
            />
            {passwordError && <p className="mt-1 text-sm text-status-error">{passwordError}</p>}
          </div>
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-2.5 mt-2 bg-signal text-white rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        <p className="mt-8 text-center text-sm text-slate">
          Don't have an account? <Link href="/signup" className="text-signal font-medium hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
