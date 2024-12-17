import { useState, useEffect } from "react";
import { UseMediaStreamResult } from "./use-media-stream-mux";

export function useWebcam(): UseMediaStreamResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  useEffect(() => {
    const handleStreamEnded = () => {
      setIsStreaming(false);
      setStream(null);
    };
    if (stream) {
      stream
        .getTracks()
        .forEach((track) => track.addEventListener("ended", handleStreamEnded));
      return () => {
        stream
          .getTracks()
          .forEach((track) =>
            track.removeEventListener("ended", handleStreamEnded),
          );
      };
    }
  }, [stream]);

  const start = async () => {
    const constraints = {
      video: {
        facingMode: isFrontCamera ? "user" : "environment"
      }
    };

    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    setStream(mediaStream);
    setIsStreaming(true);
    return mediaStream;
  };

  const stop = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setIsStreaming(false);
    }
  };

  const switchCamera = async () => {
    stop();
    setIsFrontCamera(!isFrontCamera);
    const constraints = {
      video: {
        facingMode: !isFrontCamera ? "user" : "environment"
      }
    };
    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    setStream(mediaStream);
    setIsStreaming(true);
    return mediaStream;
  };

  return {
    type: "webcam" as const,
    start,
    stop,
    isStreaming,
    stream,
    switchCamera
  };
}