import React, { useState, useEffect } from 'react';
import { FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';

const youtubeSearchDeclaration: FunctionDeclaration = {
  name: "search_youtube",
  description: "Searches for YouTube videos based on a query.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: "Search query for YouTube videos"
      },
      maxResults: {
        type: SchemaType.NUMBER,
        description: "Maximum number of results to return (default: 5)"
      }
    },
    required: ["query"]
  }
};

interface VideoResult {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
}

export function YouTubeSuggestions() {
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { client, setConfig } = useLiveAPIContext();

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      systemInstruction: {
        parts: [{
          text: 'You are a YouTube video recommendation assistant. When users ask for video suggestions, use the search_youtube function to find relevant videos. Understand their intent and create appropriate search queries. For example, if someone asks for "python full stack tutorial", you might search for "python full stack web development tutorial step by step". Always explain why you chose certain search terms.'
        }]
      },
      tools: [{ functionDeclarations: [youtubeSearchDeclaration] }]
    });
  }, [setConfig]);

  const searchYouTube = async (query: string, maxResults: number = 5) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `https://youtube.googleapis.com/youtube/v3/search?part=snippet&maxResults=${maxResults}&q=${encodeURIComponent(query)}&type=video&key=${process.env.REACT_APP_GOOGLE_API_KEY}`,
        {
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch videos');
      }

      const data = await response.json();
      
      const formattedVideos: VideoResult[] = data.items.map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.medium.url,
        channelTitle: item.snippet.channelTitle,
        publishedAt: new Date(item.snippet.publishedAt).toLocaleDateString()
      }));

      setVideos(formattedVideos);
      return formattedVideos;
    } catch (err) {
      console.error('Error fetching videos:', err);
      setError('Failed to fetch YouTube videos');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onToolCall = async (toolCall: any) => {
      const fc = toolCall.functionCalls.find((fc: any) => fc.name === 'search_youtube');
      if (fc && fc.args) {
        try {
          const { query, maxResults = 5 } = fc.args;
          const videos = await searchYouTube(query, maxResults);
          client.sendToolResponse({
            functionResponses: toolCall.functionCalls.map((fc: any) => ({
              response: { success: true, videos },
              id: fc.id,
            })),
          });
        } catch (err) {
          client.sendToolResponse({
            functionResponses: toolCall.functionCalls.map((fc: any) => ({
              response: { error: "Failed to fetch videos" },
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
  }, [client]);

  return (
    <div className="youtube-suggestions">
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      
      {loading && (
        <div className="loading">Loading videos...</div>
      )}

      <div className="videos-grid">
        {videos.map(video => (
          <div key={video.id} className="video-card">
            <a 
              href={`https://www.youtube.com/watch?v=${video.id}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="video-link"
            >
              <img 
                src={video.thumbnail} 
                alt={video.title} 
                className="video-thumbnail"
              />
              <div className="video-info">
                <h3 className="video-title">{video.title}</h3>
                <p className="channel-title">{video.channelTitle}</p>
                <p className="publish-date">{video.publishedAt}</p>
              </div>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}