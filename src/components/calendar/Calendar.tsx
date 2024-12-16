import { type FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { useEffect, useState, memo } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { useGoogleAuth } from "../../contexts/GoogleAuthContext";
import { ToolCall } from "../../multimodal-live-types";
import "./calendar.scss";

// Declare the gapi type to help TypeScript understand the global object


interface EventArgs {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  isVirtual?: boolean;
}

// Define a more specific error type for API errors
interface GoogleAPIError extends Error {
  status?: number;
}

const declaration: FunctionDeclaration = {
  name: "book_calendar",
  description: "Books a calendar event. If isVirtual is true, includes a Google Meet link.",
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
      isVirtual: {
        type: SchemaType.BOOLEAN,
        description: "If true, creates a Google Meet video conference link for this event",
      },
    },
    required: ["summary", "startDateTime", "endDateTime"],
  },
};

function CalendarComponent() {
  const [events, setEvents] = useState<gapi.client.calendar.Event[]>([]);
  const { client, setConfig } = useLiveAPIContext();
  const { isSignedIn } = useGoogleAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const initAPI = async () => {
      try {
        // Ensure gapi.client exists before calling init
        if (!window.gapi?.client) {
          await new Promise<void>((resolve, reject) => {
            window.gapi.load('client', { 
              callback: () => resolve(), 
              onerror: (err) => reject(err) 
            });
          });
        }

        // Initialize the client with API key
        await window.gapi.client.init({
          apiKey: process.env.REACT_APP_GOOGLE_API_KEY,
        });

        // Load the calendar service
        await window.gapi.client.load('calendar', 'v3');
        
        listUpcomingEvents();
      } catch (err: unknown) {
        console.error('Error initializing API:', err);
        setError('Error initializing calendar API');
      }
    };

    if (isSignedIn) {
      initAPI();
    }
  }, [isSignedIn]);

  const listUpcomingEvents = async () => {
    try {
      setLoading(true);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      const response = await window.gapi.client.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        showDeleted: false,
        singleEvents: true,
        maxResults: 10,
        orderBy: 'startTime',
      });

      setEvents(response.result.items || []);
      
      if (!response.result.items?.length) {
        await window.gapi.client.calendar.calendars.get({
          calendarId: 'primary'
        });
      }
    } catch (err: unknown) {
      console.error('Error fetching events:', err);
      
      // Type guard to check if err is a GoogleAPIError
      if (err instanceof Error) {
        const apiError = err as GoogleAPIError;
        if ('status' in apiError && apiError.status === 403) {
          setError('Calendar access denied. Please check permissions.');
        } else {
          setError('Error fetching calendar events');
        }
      } else {
        setError('An unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  const createEvent = async (eventDetails: EventArgs) => {
    try {
      setLoading(true);
       // Explicitly set timezone to 'Asia/Karachi'
       const timezone = 'Asia/Karachi';
      const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
       // Parse the dates while preserving the intended local time
       const startDate = new Date(eventDetails.startDateTime);
       const endDate = new Date(eventDetails.endDateTime);


        // Format dates in RFC3339 with the correct timezone
      const formatToRFC3339 = (date: Date) => {
        const pad = (n: number) => n < 10 ? `0${n}` : `${n}`;
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}+05:00`;
      };

      const event = {
        summary: eventDetails.summary,
        description: eventDetails.description,
        start: {
          dateTime: formatToRFC3339(startDate),
          timeZone: timezone,
        },
        end: {
          dateTime: formatToRFC3339(endDate),
          timeZone: timezone,
        },
        ...(eventDetails.isVirtual === true && {
          conferenceData: {
            createRequest: {
              requestId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
              conferenceSolutionKey: {
                type: 'hangoutsMeet'
              }
            }
          }
        }),
        reminders: {
          useDefault: true
        },
      };

      const response = await window.gapi.client.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1
      });

      if (response.status === 200) {
        await listUpcomingEvents();
        return response;
      } else {
        throw new Error(`Failed to create event. Status: ${response.status}`);
      }
    } catch (err: unknown) {
      console.error('Error creating event:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      systemInstruction: {
        parts: [
          {
            text: 'You are my helpful assistant. When I want to schedule something, use the "book_calendar" function. First ask for authentication if not signed in. Only add Google Meet video conferencing when explicitly requested for virtual meetings.',
          },
        ],
      },
      tools: [{ functionDeclarations: [declaration] }],
    });
  }, [setConfig]);

  useEffect(() => {
    const onToolCall = async (toolCall: ToolCall) => {
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
              response: { 
                success: true, 
                eventId: response.result.id,
                meetLink: response.result.conferenceData?.entryPoints?.[0]?.uri || null
              },
              id: fc.id,
            })),
          });
        } catch (err: unknown) {
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

  if (!isSignedIn) {
    return null;
  }

  return (
    <div className="calendar-widget">
      {error ? (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : (
        <div>
          <h3>Upcoming Events</h3>
          {loading ? (
            <div className="loading">Loading events...</div>
          ) : (
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
                  {event.conferenceData?.entryPoints && (
                    <div className="meet-link">
                      <a 
                        href={event.conferenceData.entryPoints[0].uri} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="meet-button"
                      >
                        Join Meet
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const Calendar = memo(CalendarComponent);