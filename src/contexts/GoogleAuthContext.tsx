// src/contexts/GoogleAuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';

interface GoogleAuthContextType {
  isSignedIn: boolean;
  tokenClient: any;
  handleAuthClick: () => void;
  handleSignOut: () => void;
}

const GoogleAuthContext = createContext<GoogleAuthContextType | undefined>(undefined);

export function GoogleAuthProvider({ children }: { children: React.ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [tokenClient, setTokenClient] = useState<any>(null);

  useEffect(() => {
    // Load Google Identity Services Script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      loadGapiScript();
    };
  }, []);

  const loadGapiScript = () => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      initializeGapiClient();
    };
    document.body.appendChild(script);
  };

  const initializeGapiClient = async () => {
    try {
      await new Promise((resolve, reject) => {
        window.gapi.load('client', { callback: resolve, onerror: reject });
      });

      await window.gapi.client.init({
        apiKey: process.env.REACT_APP_GOOGLE_API_KEY,
        discoveryDocs: [
          'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
          'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest'
        ],
      });

      // Initialize the tokenClient with all required scopes
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
        scope: [
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/calendar.readonly',
          'https://www.googleapis.com/auth/gmail.compose',
          'https://www.googleapis.com/auth/youtube.readonly'
        ].join(' '),
        callback: '', // Will be set in handleAuthClick
      });

      setTokenClient(client);
    } catch (err) {
      console.error('Error initializing Google API client:', err);
    }
  };

  const handleAuthClick = () => {
    if (!tokenClient) {
      console.error('Authentication client not initialized');
      return;
    }

    tokenClient.callback = async (resp: any) => {
      if (resp.error) {
        throw resp;
      }
      setIsSignedIn(true);
    };

    if (window.gapi.client.getToken() === null) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  };

  const handleSignOut = () => {
    const token = window.gapi.client.getToken();
    if (token !== null) {
      window.google.accounts.oauth2.revoke(token.access_token);
      window.gapi.client.setToken(null);
      setIsSignedIn(false);
    }
  };

  return (
    <GoogleAuthContext.Provider value={{
      isSignedIn,
      tokenClient,
      handleAuthClick,
      handleSignOut,
    }}>
      {children}
    </GoogleAuthContext.Provider>
  );
}

export function useGoogleAuth() {
  const context = useContext(GoogleAuthContext);
  if (context === undefined) {
    throw new Error('useGoogleAuth must be used within a GoogleAuthProvider');
  }
  return context;
}