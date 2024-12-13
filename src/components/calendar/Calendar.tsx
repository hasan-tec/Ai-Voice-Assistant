// src/components/calendar/Calendar.tsx
import { type FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { useEffect, useState, memo } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { ToolCall } from "../../multimodal-live-types";
import "./calendar.scss";

declare global {
  interface Window {
    google: any;
  }
}

const declaration: FunctionDeclaration = {
  name: "book_calendar",
  description: "Books a calendar event and displays upcoming events.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      summary: {
        type: SchemaType.STRING,
        description: "Title of the event",
      },
      description: {
        type: SchemaType.STRING,
        description: "Description of the event",
      },
      startDateTime: {
        type: SchemaType.STRING,
        description: "Start date and time in ISO format",
      },
      endDateTime: {
        type: SchemaType.STRING,
        description: "End date and time in ISO format",
      },
    },
    required: ["summary", "startDateTime", "endDateTime"],
  },
};

interface EventArgs {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
}

function CalendarComponent() {
  const [events, setEvents] = useState<gapi.client.calendar.Event[]>([]);
  const { client, setConfig } = useLiveAPIContext();
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
      });

      // Initialize the tokenClient
      setTokenClient(
        window.google.accounts.oauth2.initTokenClient({
          client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
          callback: '', // defined later
        })
      );
    } catch (err) {
      setError('Error initializing Google Calendar API');
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
      await listUpcomingEvents();
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
      setEvents([]);
    }
  };

  const listUpcomingEvents = async () => {
    try {
      const now = new Date();
      // Set time to start of day
      now.setHours(0, 0, 0, 0);
      
      console.log('Fetching events from:', now.toISOString());
      
      const response = await window.gapi.client.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        showDeleted: false,
        singleEvents: true,
        maxResults: 10,
        orderBy: 'startTime',
      });

      console.log('Fetched events:', response.result.items);
      setEvents(response.result.items || []);
      
      // If no events are returned, let's check the calendar permissions
      if (!response.result.items?.length) {
        console.log('No events found. Checking calendar permissions...');
        const calendarResponse = await window.gapi.client.calendar.calendars.get({
          calendarId: 'primary'
        });
        console.log('Calendar permissions:', calendarResponse.result);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
      if ((err as any).status === 403) {
        setError('Calendar access denied. Please check permissions.');
      } else {
        setError('Error fetching calendar events');
      }
    }
  };

  const createEvent = async (eventDetails: EventArgs) => {
    try {
      console.log('Creating event with details:', eventDetails);
      
      // Convert timestamps to user's timezone
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startDate = new Date(eventDetails.startDateTime);
      const endDate = new Date(eventDetails.endDateTime);

      const event = {
        summary: eventDetails.summary,
        description: eventDetails.description,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: userTimeZone,
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: userTimeZone,
        },
        reminders: {
          useDefault: true
        },
        visibility: 'default'
      };

      console.log('Sending event to Google Calendar with timezone:', userTimeZone);
      console.log('Event start time in local timezone:', startDate.toLocaleString());
      console.log('Event end time in local timezone:', endDate.toLocaleString());
      
      const response = await window.gapi.client.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });

      if (response.status === 200) {
        console.log('Event created successfully:', response.result);
        // Give a small delay before refreshing the events list
        setTimeout(() => listUpcomingEvents(), 1000);
        return response;
      } else {
        throw new Error(`Failed to create event. Status: ${response.status}`);
      }
    } catch (err) {
      console.error('Error creating event:', err);
      throw err;
    }
  };

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      systemInstruction: {
        parts: [
          {
            text: 'You are my helpful assistant. When I want to schedule something, use the "book_calendar" function. First ask for authentication if not signed in.',
          },
        ],
      },
      tools: [{ functionDeclarations: [declaration] }],
    });
  }, [setConfig]);

  useEffect(() => {
    const onToolCall = async (toolCall: ToolCall) => {
      console.log(`got toolcall`, toolCall);
      const fc = toolCall.functionCalls.find((fc) => fc.name === declaration.name);
      if (fc && fc.args) {
        if (!isSignedIn) {
          client.sendToolResponse({
            functionResponses: toolCall.functionCalls.map((fc) => ({
              response: { error: "Please sign in first" },
              id: fc.id,
            })),
          });
          return;
        }

        try {
          const args = fc.args as EventArgs;
          const response = await createEvent(args);
          client.sendToolResponse({
            functionResponses: toolCall.functionCalls.map((fc) => ({
              response: { success: true, eventId: response.result.id },
              id: fc.id,
            })),
          });
        } catch (err) {
          client.sendToolResponse({
            functionResponses: toolCall.functionCalls.map((fc) => ({
              response: { error: "Failed to create event" },
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
    <div className="calendar-widget">
      {error ? (
        <div className="error-message">
          {error}
          <button 
            onClick={() => {
              setError(null);
              window.location.reload();
            }}
          >
            Dismiss
          </button>
        </div>
      ) : !isSignedIn ? (
        <button onClick={handleAuthClick}>Sign In with Google</button>
      ) : (
        <div>
          <button onClick={handleSignoutClick}>Sign Out</button>
          <h3>Upcoming Events</h3>
          <div className="events-list">
            {events.map((event) => (
              <div key={event.id || 'temp-id'} className="event-item">
                <h4>{event.summary}</h4>
                <p>
                  {event.start?.dateTime ? 
                    `${new Date(event.start.dateTime).toLocaleString()} - ${new Date(event.end?.dateTime || '').toLocaleTimeString()}`
                    : 'No date specified'}
                </p>
                {event.description && <p className="event-description">{event.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const Calendar = memo(CalendarComponent);