// src/components/auth/GoogleAuth.tsx
import { useGoogleAuth } from '../../contexts/GoogleAuthContext';
import './google-auth.scss';

export function GoogleAuth() {
  const { isSignedIn, handleAuthClick, handleSignOut } = useGoogleAuth();

  if (!isSignedIn) {
    return (
      <div className="google-auth-container">
        <button onClick={handleAuthClick} className="google-auth-button">
          Sign in with Google
        </button>
      </div>
    );
  }

  return null; // Don't show anything when signed in
}