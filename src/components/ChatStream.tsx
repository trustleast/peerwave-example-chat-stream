import React, { useEffect, useState } from "react";

const STATIC_MESSAGE = "Hello! Can you tell me a fun fact about cats?";

export const ChatStream: React.FC = () => {
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChatStream = async () => {
    setResponse("");
    setIsLoading(true);
    setError("");
    try {
      await fetchChatStream(STATIC_MESSAGE, (chunk: string) => {
        setResponse((prev) => prev + chunk);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
    setIsLoading(false);
  };

  // We just loaded the page and are authenticated, so let's get a response!
  // If you are handling redirect logic somewhere else, you can disable this.
  useEffect(() => {
    const token = getToken();
    if (token) {
      handleChatStream();
    }
  }, []);

  return (
    <>
      {error && <p>{error}</p>}
      <h3>Question:</h3>
      <p>{STATIC_MESSAGE}</p>
      {response && (
        <>
          <h3>Response:</h3>
          <p>{response}</p>
        </>
      )}
      <button disabled={isLoading} onClick={() => handleChatStream()}>
        {buttonText(response !== "", isLoading)}
      </button>
    </>
  );
};

function buttonText(hasResponse: boolean, isLoading: boolean): string {
  if (hasResponse) {
    return "Try Again";
  }
  return isLoading ? "Getting Response..." : "Send Message";
}

function getToken(): string | null {
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  return hashParams.get("token");
}

async function fetchChatStream(
  message: string,
  onChunk: (chunk: string) => void
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Redirect: window.location.pathname + window.location.search,
  };

  // Add Authorization header if we have a token
  const token = getToken();
  if (token) {
    headers["Authorization"] = token;
  }

  const response = await fetch("https://api.peerwave.ai/api/chat/stream", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "fastest",
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });

  if (!response.ok) {
    // Handle 402 (Payment Required) or other auth-related status codes
    const location = response.headers.get("Location");
    if (location) {
      // Redirect to Peerwave auth
      window.location.href = location;
      throw new Error("Redirecting to Peerwave auth");
    }
    throw new Error(
      `Failed to get chat stream: ${response.status} ${await response.text()}`
    );
  }

  // Handle streaming response
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      let loopDone = false;
      while (!loopDone) {
        const { done, value } = await reader.read();
        if (done) {
          loopDone = true;
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          const cleaned = line.trim();
          if (cleaned === "") {
            continue;
          }
          try {
            const parsedLine = JSON.parse(cleaned);
            const content = parsedLine?.message?.content;
            if (content) {
              onChunk(content);
            }
          } catch {
            // Skip invalid JSON lines
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
