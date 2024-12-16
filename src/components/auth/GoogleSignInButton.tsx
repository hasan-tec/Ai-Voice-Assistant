import React from 'react';
import { useGoogleAuth } from '../../contexts/GoogleAuthContext';
import cn from 'classnames';

export const GoogleSignInButton: React.FC<{
  className?: string;
}> = ({ className }) => {
  const { handleAuthClick, isSignedIn, handleSignOut } = useGoogleAuth();

  if (isSignedIn) {
    return (
      <button 
        onClick={handleSignOut} 
        className={cn(
          "text-white px-4 py-2 rounded transition-colors",
          "bg-red-500 hover:bg-red-600",
          className
        )}
      >
        Sign Out
      </button>
    );
  }

  return (
    <button 
      onClick={handleAuthClick} 
      className={cn(
        "text-white px-4 py-2 rounded transition-colors",
        "bg-blue-500 hover:bg-blue-600 flex items-center justify-center",
        className
      )}
    >
      <svg 
        className="w-5 h-5 mr-2" 
        viewBox="0 0 24 24" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path 
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z" 
          fill="#4285F4"
        />
        <path 
          d="M12 23c2.97 0 5.46-1 7.28-2.69l-3.57-2.75c-.99.69-2.26 1.1-3.71 1.1-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" 
          fill="#34A853"
        />
        <path 
          d="M5.84 14.13c-.22-.66-.35-1.36-.35-2.13s.13-1.47.35-2.13V7.03H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.97l2.66-2.84z" 
          fill="#FBBC05"
        />
        <path 
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.03l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" 
          fill="#EA4335"
        />
        <path d="M1 1h22v22H1z" fill="none" />
      </svg>
      Sign in with Google
    </button>
  );
};