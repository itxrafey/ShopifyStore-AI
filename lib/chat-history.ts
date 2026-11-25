export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  // Persist UI messages without narrowing their SDK-specific shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
}

const STORAGE_KEY = "storepilot_chat_sessions";
const NEW_CHAT_TITLE = "New Chat";
const TITLE_LENGTH = 40;

export function formatSessionRelativeTime(
  timestamp: number,
  now = Date.now(),
): string {
  const age = Math.max(0, now - timestamp);
  const minutes = Math.floor(age / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function getStorage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("Chat sessions can only be accessed in a browser.");
  }

  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChatSession(value: unknown): value is ChatSession {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt) &&
    Array.isArray(value.messages)
  );
}

function readSessions(): ChatSession[] {
  const raw = getStorage().getItem(STORAGE_KEY);
  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Saved chat sessions contain invalid JSON.");
  }

  if (!Array.isArray(parsed) || !parsed.every(isChatSession)) {
    throw new Error("Saved chat sessions have an invalid format.");
  }

  return parsed;
}

function textFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";

  const textParts: string[] = [];
  for (const part of parts) {
    if (
      isRecord(part) &&
      part.type === "text" &&
      typeof part.text === "string"
    ) {
      textParts.push(part.text);
    }
  }
  return textParts.join(" ");
}

function getFirstUserPrompt(messages: ChatSession["messages"]): string {
  for (const message of messages) {
    if (!isRecord(message) || message.role !== "user") continue;

    const text =
      typeof message.content === "string"
        ? message.content
        : textFromParts(message.parts) || textFromParts(message.content);
    const prompt = text.replace(/\s+/g, " ").trim();
    if (prompt) return prompt;
  }

  return "";
}

export function getAllSessions(): ChatSession[] {
  return readSessions().sort((first, second) => second.updatedAt - first.updatedAt);
}

export function getSession(id: string): ChatSession | undefined {
  return readSessions().find((session) => session.id === id);
}

export function saveSession(session: ChatSession): void {
  if (!isChatSession(session)) {
    throw new Error("Cannot save an invalid chat session.");
  }

  const sessions = readSessions();
  const savedSession = { ...session };
  if (savedSession.title === NEW_CHAT_TITLE) {
    const prompt = getFirstUserPrompt(savedSession.messages);
    if (prompt) {
      savedSession.title = prompt.slice(0, TITLE_LENGTH).trimEnd();
    }
  }

  const index = sessions.findIndex((item) => item.id === savedSession.id);
  if (index === -1) {
    sessions.push(savedSession);
  } else {
    sessions[index] = savedSession;
  }

  getStorage().setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function createNewSession(): ChatSession {
  const session: ChatSession = {
    id: crypto.randomUUID(),
    title: NEW_CHAT_TITLE,
    updatedAt: Date.now(),
    messages: [],
  };
  saveSession(session);
  return session;
}

export function deleteSession(id: string): void {
  const sessions = readSessions().filter((session) => session.id !== id);
  getStorage().setItem(STORAGE_KEY, JSON.stringify(sessions));
}