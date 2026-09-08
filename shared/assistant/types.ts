import type { Role } from "@/shared/types";

export type AssistantRole = Role | "public";

export interface AssistantChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantRequestBody {
  role: AssistantRole;
  userId: string | null;
  message: string;
  history: AssistantChatMessage[];
  contextSummary: string;
}

export interface AssistantResponseBody {
  reply: string;
  refused?: boolean;
  error?: string;
}
