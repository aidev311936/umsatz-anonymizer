import { sessionScopedStorageAdapter } from "./sessionScopedStorage";

const SESSION_CHANNEL_NAME = "umsatz-anonymizer-session";
const SESSION_TERMINATED_MESSAGE = "session-terminated";

type Cleanup = () => void;

type MessageHandler = (event: MessageEvent) => void;

type TerminationHandler = () => void;

export function startSession(): Cleanup {
  if (typeof window === "undefined") {
    return () => {};
  }

  let isTerminating = false;
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(SESSION_CHANNEL_NAME)
      : null;

  const handleTermination: TerminationHandler = () => {
    if (isTerminating) {
      return;
    }
    isTerminating = true;
    sessionScopedStorageAdapter.clearAll();
    channel?.postMessage(SESSION_TERMINATED_MESSAGE);
  };

  const handleMessage: MessageHandler = (event) => {
    if (typeof event.data !== "string") {
      return;
    }
    if (event.data === SESSION_TERMINATED_MESSAGE) {
      sessionScopedStorageAdapter.clearAll();
    }
  };

  window.addEventListener("pagehide", handleTermination);
  window.addEventListener("beforeunload", handleTermination);
  channel?.addEventListener("message", handleMessage);

  let cleanedUp = false;

  return () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    window.removeEventListener("pagehide", handleTermination);
    window.removeEventListener("beforeunload", handleTermination);
    channel?.removeEventListener("message", handleMessage);
    channel?.close();
  };
}
