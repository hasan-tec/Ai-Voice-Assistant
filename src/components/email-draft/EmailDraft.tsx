import React, { useState, useEffect } from 'react';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import './email-draft.scss';
import { FunctionDeclaration, SchemaType } from "@google/generative-ai";

declare global {
  interface Window {
    google: any;
    gapi: {
      client: {
        load: (api: string, version: string) => Promise<void>;
        init: (config: any) => Promise<void>;
        getToken: () => any;
        gmail: {
          users: {
            drafts: {
              list: (params: { userId: string; maxResults: number }) => Promise<any>;
              get: (params: { userId: string; id: string; format: string }) => Promise<any>;
              create: (params: { userId: string; resource: any }) => Promise<any>;
            };
            messages: {
              send: (params: { userId: string; resource: any }) => Promise<any>;
            };
          };
        };
      };
      load: (api: string, callback: () => void) => void;
    };
  }
}

const emailDraftDeclaration: FunctionDeclaration = {
  name: "draft_email",
  description: "Drafts or sends an email using Gmail",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      to: {
        type: SchemaType.STRING,
        description: "Email address of the recipient"
      },
      subject: {
        type: SchemaType.STRING,
        description: "Subject of the email"
      },
      content: {
        type: SchemaType.STRING,
        description: "Content of the email"
      },
      send: {
        type: SchemaType.BOOLEAN,
        description: "Whether to send the email immediately or save as draft"
      }
    },
    required: ["to", "subject", "content"]
  }
};

interface EmailDraftArgs {
  to: string;
  subject: string;
  content: string;
  send?: boolean;
}

export function EmailDraft() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<any[]>([]);
  const { client, setConfig } = useLiveAPIContext();
  const [tokenClient, setTokenClient] = useState<any>(null);

  useEffect(() => {
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
      });
      
      // Load the Gmail API client library explicitly
      await window.gapi.client.load('gmail', 'v1');

      setTokenClient(
        window.google.accounts.oauth2.initTokenClient({
          client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/gmail.compose',
          callback: '', // defined later
        })
      );
    } catch (err) {
      setError('Error initializing Gmail API');
      console.error('Error initializing GAPI client:', err);
    }
  };

  const handleAuthClick = () => {
    if (!tokenClient) {
      setError('Authentication client not initialized');
      return;
    }

    tokenClient.callback = async (resp: any) => {
      if (resp.error) {
        setError(resp.error);
        return;
      }
      setIsSignedIn(true);
      await listDrafts();
    };

    if (window.gapi.client.getToken() === null) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  };

  const handleSignoutClick = () => {
    const token = window.gapi.client.getToken();
    if (token !== null) {
      window.google.accounts.oauth2.revoke(token.access_token);
      window.gapi.client.setToken(null);
      setIsSignedIn(false);
      setDrafts([]);
    }
  };

  const listDrafts = async () => {
    try {
      const response = await window.gapi.client.gmail.users.drafts.list({
        userId: 'me',
        maxResults: 10
      });
      
      const draftsData = response.result.drafts || [];
      const detailedDrafts = await Promise.all(
        draftsData.map(async (draft: any) => {
          const detailedResponse = await window.gapi.client.gmail.users.drafts.get({
            userId: 'me',
            id: draft.id,
            format: 'full'
          });
          return detailedResponse.result;
        })
      );
      
      setDrafts(detailedDrafts);
    } catch (err) {
      console.error('Error fetching drafts:', err);
      setError('Error fetching email drafts');
    }
  };

  const createDraft = async (emailDetails: EmailDraftArgs) => {
    try {
      const email = [
        `To: ${emailDetails.to}`,
        `Subject: ${emailDetails.subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'MIME-Version: 1.0',
        '',
        emailDetails.content
      ].join('\n');

      const encodedEmail = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      if (emailDetails.send) {
        await window.gapi.client.gmail.users.messages.send({
          userId: 'me',
          resource: {
            raw: encodedEmail
          }
        });
      } else {
        await window.gapi.client.gmail.users.drafts.create({
          userId: 'me',
          resource: {
            message: {
              raw: encodedEmail
            }
          }
        });
      }

      await listDrafts();
      return true;
    } catch (err) {
      console.error('Error creating draft:', err);
      throw err;
    }
  };

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      systemInstruction: {
        parts: [{
          text: 'You are my email assistant. When I ask you to draft or send an email, use the "draft_email" function. Always ask for authentication if not signed in.'
        }]
      },
      tools: [{ functionDeclarations: [emailDraftDeclaration] }]
    });
  }, [setConfig]);

  useEffect(() => {
    const onToolCall = async (toolCall: any) => {
      const fc = toolCall.functionCalls.find((fc: any) => fc.name === 'draft_email');
      if (fc && fc.args) {
        if (!isSignedIn) {
          client.sendToolResponse({
            functionResponses: toolCall.functionCalls.map((fc: any) => ({
              response: { error: "Please sign in to Gmail first" },
              id: fc.id,
            })),
          });
          return;
        }

        try {
          const args = fc.args as EmailDraftArgs;
          await createDraft(args);
          client.sendToolResponse({
            functionResponses: toolCall.functionCalls.map((fc: any) => ({
              response: { success: true },
              id: fc.id,
            })),
          });
        } catch (err) {
          client.sendToolResponse({
            functionResponses: toolCall.functionCalls.map((fc: any) => ({
              response: { error: "Failed to create email draft" },
              id: fc.id,
            })),
          });
        }
      }
    };

    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client, isSignedIn]);

  return (
    <div className="email-draft">
      {error ? (
        <div className="error-message">
          {error}
          <button onClick={() => {
            setError(null);
            window.location.reload();
          }}>
            Dismiss
          </button>
        </div>
      ) : !isSignedIn ? (
        <button onClick={handleAuthClick}>Sign In with Gmail</button>
      ) : (
        <div>
          <button onClick={handleSignoutClick}>Sign Out</button>
          <h3>Recent Drafts</h3>
          <div className="drafts-list">
            {drafts.map((draft) => (
              <div key={draft.id} className="draft-item">
                <h4>{draft.message?.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || 'No Subject'}</h4>
                <p className="draft-recipient">
                  To: {draft.message?.payload?.headers?.find((h: any) => h.name === 'To')?.value || 'No Recipient'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}