import React from 'react';
import { useGoogleAuth } from '../../contexts/GoogleAuthContext';

export const GoogleSignInButton = () => {
  const { handleAuthClick, isSignedIn, handleSignOut } = useGoogleAuth();

  return (
    <div className="google-auth-container fixed top-4 right-4 z-10">
      <div className="p-2 rounded-3xl bg-[#1c1f21]">
        <button 
          onClick={isSignedIn ? handleSignOut : handleAuthClick}
          className="
            min-w-[160px] 
            px-8 py-4 
            rounded-2xl 
            bg-[#232729] 
            text-white 
            font-mono 
            text-base
            hover:bg-[#2a2f31] 
            transition-all 
            duration-200
          "
        >
          {isSignedIn ? 'Sign Out' : 'Sign In'}
        </button>
      </div>
    </div>
  );
};

export default GoogleSignInButton;