

import React, { useState, useEffect } from 'react';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { useGoogleAuth } from '../../contexts/GoogleAuthContext';
import './email-draft.scss';
import { FunctionDeclaration, SchemaType } from "@google/generative-ai";



// Declare global types for Gmail API
declare global {
  interface Window {
    gapi: {
      load: (name: string, options: {
        callback?: () => void;
        onerror?: (error: Error) => void;
      }) => void;
      client: {
        init: (config: { apiKey?: string }) => Promise<void>;
        load: (serviceName: string, version: string) => Promise<void>;
        gmail: {
          users: {
            drafts: {
              list: (params: { 
                userId: string; 
                maxResults?: number 
              }) => Promise<{
                result: {
                  drafts?: Array<{ id: string }>;
                }
              }>;
              get: (params: { 
                userId: string; 
                id: string; 
                format?: string 
              }) => Promise<{
                result: {
                  id: string;
                  message?: {
                    payload?: {
                      headers?: Array<{ name: string; value: string }>;
                    };
                  };
                }
              }>;
              create: (params: { 
                userId: string; 
                resource: { 
                  message: { 
                    raw: string 
                  } 
                } 
              }) => Promise<any>;
            };
            messages: {
              send: (params: { 
                userId: string; 
                resource: { 
                  raw: string 
                } 
              }) => Promise<any>;
            };
          };
        };
        calendar?: any; // Keep existing calendar type if needed
      };
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

interface GmailDraft {
  id: string;
  message?: {
    payload?: {
      headers?: Array<{ name: string; value: string }>;
    };
  };
}

export function EmailDraft() {
  const { isSignedIn } = useGoogleAuth();
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<GmailDraft[]>([]);
  const { client, setConfig } = useLiveAPIContext();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const initAPI = async () => {
      try {
        if (!window.gapi?.client) {
          await new Promise<void>((resolve, reject) => {
            window.gapi.load('client', {
              callback: () => resolve(),
              onerror: (err) => reject(err)
            });
          });

          await window.gapi.client.init({
            apiKey: process.env.REACT_APP_GOOGLE_API_KEY,
          });
        }

        // Load Gmail API
        await window.gapi.client.load('gmail', 'v1');
        await listDrafts();
      } catch (err: unknown) {
        console.error('Error initializing API:', err);
        setError('Error initializing Gmail API');
      }
    };

    if (isSignedIn) {
      initAPI();
    }
  }, [isSignedIn]);

  const listDrafts = async () => {
    try {
      setLoading(true);

      if (!window.gapi?.client?.gmail) {
        throw new Error('Gmail API not initialized');
      }

      const response = await window.gapi.client.gmail.users.drafts.list({
        userId: 'me',
        maxResults: 10
      });
      
      const draftsData = response.result.drafts || [];
      const detailedDrafts = await Promise.all(
        draftsData.map(async (draft: { id: string }) => {
          const detailedResponse = await window.gapi.client.gmail.users.drafts.get({
            userId: 'me',
            id: draft.id,
            format: 'full'
          });
          return detailedResponse.result;
        })
      );
      
      setDrafts(detailedDrafts);
    } catch (err: unknown) {
      console.error('Error fetching drafts:', err);
      setError('Error fetching email drafts');
    } finally {
      setLoading(false);
    }
  };

  const createDraft = async (emailDetails: EmailDraftArgs) => {
    try {
      setLoading(true);

      if (!window.gapi?.client?.gmail) {
        throw new Error('Gmail API not initialized');
      }

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
    } catch (err: unknown) {
      console.error('Error creating draft:', err);
      throw err;
    } finally {
      setLoading(false);
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
        } catch (err: unknown) {
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

  if (!isSignedIn) {
    return null;
  }

  return (
    <div className="email-draft">
      {error ? (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : (
        <div>
          <h3>Recent Drafts</h3>
          {loading ? (
            <div className="loading">Loading drafts...</div>
          ) : (
            <div className="drafts-list">
              {drafts.map((draft) => (
                <div key={draft.id} className="draft-item">
                  <h4>{draft.message?.payload?.headers?.find((h) => h.name === 'Subject')?.value || 'No Subject'}</h4>
                  <p className="draft-recipient">
                    To: {draft.message?.payload?.headers?.find((h) => h.name === 'To')?.value || 'No Recipient'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}