"use client";

import { useParams } from "next/navigation";
import ChatMessageView from "@/app/components/chat/ChatMessageView";

export default function ChatConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = params.conversationId;

  if (!conversationId) return null;

  return <ChatMessageView conversationId={conversationId} />;
}
