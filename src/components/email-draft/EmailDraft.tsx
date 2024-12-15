import React, { useState, useEffect } from 'react';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import './email-draft.scss';
import { FunctionDeclaration, SchemaType } from "@google/generative-ai";

export function EmailDraft() {
  const [draftContent, setDraftContent] = useState('');
  const { client, setConfig } = useLiveAPIContext();

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      systemInstruction: {
        parts: [
          {
            text: 'You are an email drafting assistant. When I ask you to draft an email, use the "draft_email" function.',
          },
        ],
      },
      tools: [{ functionDeclarations: [emailDraftDeclaration] }],
    });
  }, [setConfig]);

  useEffect(() => {
    const onToolCall = async (toolCall: any) => {
      const fc = toolCall.functionCalls.find((fc: any) => fc.name === 'draft_email');
      if (fc && fc.args) {
        setDraftContent(fc.args.content);
        client.sendToolResponse({
          functionResponses: toolCall.functionCalls.map((fc: any) => ({
            response: { success: true },
            id: fc.id,
          })),
        });
      }
    };

    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client]);

  return (
    <div className="email-draft">
      <h3>Email Draft</h3>
      <textarea
        value={draftContent}
        onChange={(e) => setDraftContent(e.target.value)}
        placeholder="Your email draft will appear here..."
        rows={10}
      />
    </div>
  );
}

const emailDraftDeclaration: FunctionDeclaration = {
  name: "draft_email",
  description: "Drafts an email based on the given prompt.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      content: {
        type: SchemaType.STRING,
        description: "The content of the drafted email",
      },
    },
    required: ["content"],
  },
};

