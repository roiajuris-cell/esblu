"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  attachChatMessageReference,
  buildChatAttachmentStoragePath,
  getChatErrorMessage,
  isAllowedChatAttachmentMime,
  listCompanyMembersForChat,
  markConversationRead,
  resolveChatEntityCard,
  CHAT_ATTACHMENT_MAX_BYTES,
  type ChatAttachment,
  type ChatConversation,
  type ChatEntityType,
  type ChatMessage,
  type ChatMessageReference,
  type ResolvedEntityCard,
} from "@/lib/chat";
import EntityPickerModal from "./EntityPickerModal";

const PAGE_SIZE = 50;

// Auto-grow composer textarea — v prázdnom/krátkom stave kompaktné (~1-2
// riadky), rastie s obsahom po riadkoch až po ~5-6 riadkov, potom sa zapne
// vnútorný scroll namiesto ďalšieho rastu. Hodnoty v px zodpovedajú
// text-sm (14px, line-height ~21px) + vertikálny padding composera
// (px-3.5 py-2.5 → 2×10px), zaokrúhlené na rozumné minimum/maximum.
const COMPOSER_MIN_HEIGHT_PX = 44;
const COMPOSER_MAX_HEIGHT_PX = 144;

type PendingEntity = { entityType: ChatEntityType; entityId: string; label: string };

export default function ChatMessageView({ conversationId }: { conversationId: string }) {
  const { t, locale } = useLocale();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [title, setTitle] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<
    Record<string, ChatAttachment[]>
  >({});
  const [referencesByMessage, setReferencesByMessage] = useState<
    Record<string, ChatMessageReference[]>
  >({});
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingEntity, setPendingEntity] = useState<PendingEntity | null>(null);
  const [showEntityPicker, setShowEntityPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollBottomRef = useRef<HTMLDivElement | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((m) => m.id));
  }, [messages]);

  // Auto-grow composera podľa obsahu — riadené priamo cez `text` (nie iba
  // cez onChange), takže rovnaká logika zároveň zabezpečí zmenšenie späť na
  // minimálnu výšku po odoslaní správy (sendMessage() volá setText("")).
  // Neriadené (uncontrolled) nastavovanie výšky cez ref — nepridáva žiadny
  // ďalší render. Rovnaký komponent sa používa na /chat/[conversationId] aj
  // vo FloatingChatWidget paneli (desktop aj mobilný bottom-sheet), takže
  // sa správa identicky na oboch miestach bez duplicitnej implementácie.
  useEffect(() => {
    const el = composerTextareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    const nextHeight = Math.min(
      Math.max(el.scrollHeight, COMPOSER_MIN_HEIGHT_PX),
      COMPOSER_MAX_HEIGHT_PX
    );
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [text]);

  // Zámerne PLAIN funkcie (nie useCallback) — pozri odôvodnenie v
  // ChatConversationList.tsx (react-hooks/set-state-in-effect pravidlo
  // nahlasuje useCallback+dependency-array vzor volania async loaderu
  // priamo z bare useEffect ako anti-pattern; plain funkcia + prázdny/úzky
  // dependency array je rovnaký, inde v appke už tolerovaný vzor).
  async function loadAttachmentsAndReferences(messageIds: string[]) {
    if (messageIds.length === 0) return;

    const [{ data: attachments }, { data: references }] = await Promise.all([
      supabase.from("chat_attachments").select("*").in("message_id", messageIds),
      supabase
        .from("chat_message_references")
        .select("*")
        .in("message_id", messageIds),
    ]);

    const attachmentMap: Record<string, ChatAttachment[]> = {};
    (attachments as ChatAttachment[] | null)?.forEach((a) => {
      (attachmentMap[a.message_id] ||= []).push(a);
    });

    const referenceMap: Record<string, ChatMessageReference[]> = {};
    (references as ChatMessageReference[] | null)?.forEach((r) => {
      (referenceMap[r.message_id] ||= []).push(r);
    });

    setAttachmentsByMessage((current) => ({ ...current, ...attachmentMap }));
    setReferencesByMessage((current) => ({ ...current, ...referenceMap }));
  }

  async function loadInitial() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    setLoading(true);
    setNotFound(false);

    try {
      if (!session) {
        setLoading(false);
        return;
      }
      setMyUserId(session.user.id);

      const { data: conversationRow } = await supabase
        .from("chat_conversations")
        .select("*")
        .eq("id", conversationId)
        .maybeSingle();

      if (!conversationRow) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setConversation(conversationRow as ChatConversation);

      if (conversationRow.type === "company") {
        setTitle(t("chat.companyChannel"));
      } else {
        const members = await listCompanyMembersForChat();
        const otherUserId =
          conversationRow.direct_user_low === session.user.id
            ? conversationRow.direct_user_high
            : conversationRow.direct_user_low;
        const other = members.find((m) => m.user_id === otherUserId);
        setTitle(other?.email || t("chat.formerMember"));
      }

      const { data: messageRows } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      const ordered = ((messageRows as ChatMessage[] | null) || []).slice().reverse();
      setMessages(ordered);
      setHasMore((messageRows?.length || 0) === PAGE_SIZE);

      await loadAttachmentsAndReferences(ordered.map((m) => m.id));

      await markConversationRead(conversationId);
      setLoading(false);
    } catch {
      setNotFound(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    // "Načítaj konverzáciu pri mounte / zmene conversationId" — rovnaký
    // vzor ako ChatConversationList.tsx (pozri komentár tam) — react-hooks/
    // set-state-in-effect sa pri overovaní správal nekonzistentne naprieč
    // viac-súborovými lint behmi. Funkčne bezpečné, žiadny cleanup
    // potrebný.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInitial();
  }, [conversationId]);

  useEffect(() => {
    // Scroll na spodok pri prvom načítaní / novej vlastnej správe.
    scrollBottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function loadOlderMessages() {
    if (messages.length === 0) return;

    setLoadingOlder(true);

    try {
      const oldest = messages[0].created_at;

      const { data: olderRows } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .lt("created_at", oldest)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      const ordered = ((olderRows as ChatMessage[] | null) || []).slice().reverse();
      setMessages((current) => [...ordered, ...current]);
      setHasMore((olderRows?.length || 0) === PAGE_SIZE);

      await loadAttachmentsAndReferences(ordered.map((m) => m.id));
    } finally {
      setLoadingOlder(false);
    }
  }

  // Realtime: nové/upravené správy tejto konverzácie + nové prílohy/referencie
  // patriace k už načítaným správam.
  useEffect(() => {
    const channel = supabase
      .channel(`chat-conversation-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const message = payload.new as ChatMessage;

          if (messageIdsRef.current.has(message.id)) return;

          setMessages((current) => [...current, message]);
          await loadAttachmentsAndReferences([message.id]);

          if (message.author_id !== myUserId) {
            markConversationRead(conversationId).catch(() => {});
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const message = payload.new as ChatMessage;
          setMessages((current) =>
            current.map((m) => (m.id === message.id ? message : m))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_attachments" },
        (payload) => {
          const attachment = payload.new as ChatAttachment;
          if (!messageIdsRef.current.has(attachment.message_id)) return;

          setAttachmentsByMessage((current) => ({
            ...current,
            [attachment.message_id]: [
              ...(current[attachment.message_id] || []),
              attachment,
            ],
          }));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_message_references" },
        (payload) => {
          const reference = payload.new as ChatMessageReference;
          if (!messageIdsRef.current.has(reference.message_id)) return;

          setReferencesByMessage((current) => ({
            ...current,
            [reference.message_id]: [
              ...(current[reference.message_id] || []),
              reference,
            ],
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, myUserId]);

  function handleFilePick(file: File | null) {
    setComposerError(null);

    if (!file) {
      setPendingFile(null);
      return;
    }

    if (!isAllowedChatAttachmentMime(file.type)) {
      setComposerError(t("chat.attachments.unsupportedType"));
      return;
    }

    if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
      setComposerError(t("chat.attachments.tooLarge"));
      return;
    }

    setPendingFile(file);
  }

  async function sendMessage() {
    const trimmed = text.trim();

    if (!trimmed && !pendingFile && !pendingEntity) return;
    if (!conversation || !myUserId) return;

    setSending(true);
    setComposerError(null);

    try {
      const { data: inserted, error: insertError } = await supabase
        .from("chat_messages")
        .insert({
          conversation_id: conversationId,
          author_id: myUserId,
          body: trimmed,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;

      const message = inserted as ChatMessage;
      setMessages((current) =>
        messageIdsRef.current.has(message.id) ? current : [...current, message]
      );

      if (pendingFile) {
        const path = buildChatAttachmentStoragePath(
          conversation.company_id,
          conversationId,
          message.id,
          pendingFile.type
        );

        const { error: uploadError } = await supabase.storage
          .from("chat-attachments")
          .upload(path, pendingFile, { contentType: pendingFile.type });

        if (uploadError) throw uploadError;

        const { data: attachmentRow, error: attachmentError } = await supabase
          .from("chat_attachments")
          .insert({
            message_id: message.id,
            storage_bucket: "chat-attachments",
            storage_path: path,
            original_filename: pendingFile.name,
            mime_type: pendingFile.type,
            file_size: pendingFile.size,
          })
          .select("*")
          .single();

        if (attachmentError) throw attachmentError;

        setAttachmentsByMessage((current) => ({
          ...current,
          [message.id]: [
            ...(current[message.id] || []),
            attachmentRow as ChatAttachment,
          ],
        }));
      }

      if (pendingEntity) {
        const reference = await attachChatMessageReference(
          message.id,
          pendingEntity.entityType,
          pendingEntity.entityId
        );

        setReferencesByMessage((current) => ({
          ...current,
          [message.id]: [...(current[message.id] || []), reference],
        }));
      }

      setText("");
      setPendingFile(null);
      setPendingEntity(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setComposerError(getChatErrorMessage(error, t));
    } finally {
      setSending(false);
    }
  }

  function startEdit(message: ChatMessage) {
    setEditingMessageId(message.id);
    setEditText(message.body);
  }

  async function saveEdit(messageId: string) {
    const trimmed = editText.trim();
    if (!trimmed) return;

    const { data, error } = await supabase
      .from("chat_messages")
      .update({ body: trimmed, edited_at: new Date().toISOString() })
      .eq("id", messageId)
      .select("*")
      .single();

    if (!error && data) {
      setMessages((current) =>
        current.map((m) => (m.id === messageId ? (data as ChatMessage) : m))
      );
    }

    setEditingMessageId(null);
    setEditText("");
  }

  async function deleteMessage(messageId: string) {
    const confirmed = window.confirm(t("chat.confirmDeleteMessage"));
    if (!confirmed) return;

    const { data, error } = await supabase
      .from("chat_messages")
      .update({ deleted_at: new Date().toISOString(), body: "" })
      .eq("id", messageId)
      .select("*")
      .single();

    if (!error && data) {
      setMessages((current) =>
        current.map((m) => (m.id === messageId ? (data as ChatMessage) : m))
      );
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-esblu">
        {t("common.buttons.loading")}
      </div>
    );
  }

  if (notFound || !conversation) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-esblu">
        {t("chat.errors.ESBLU_CONVERSATION_NOT_FOUND_OR_FORBIDDEN")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-subtle px-4 py-3.5 sm:px-5">
        <span aria-hidden="true" className="text-lg leading-none">
          {conversation.type === "company" ? "🏢" : "👤"}
        </span>
        <h2 className="min-w-0 truncate text-base font-bold text-primary">
          {title}
        </h2>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
        {hasMore && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={loadOlderMessages}
              disabled={loadingOlder}
              className="btn-secondary rounded-full px-4 py-2 text-xs"
            >
              {loadingOlder ? t("common.buttons.loading") : t("chat.loadOlderMessages")}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-esblu">
            {t("chat.noMessagesYet")}
          </p>
        )}

        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isMine={message.author_id === myUserId}
            attachments={attachmentsByMessage[message.id] || []}
            references={referencesByMessage[message.id] || []}
            editing={editingMessageId === message.id}
            editText={editText}
            onEditTextChange={setEditText}
            onStartEdit={() => startEdit(message)}
            onCancelEdit={() => setEditingMessageId(null)}
            onSaveEdit={() => saveEdit(message.id)}
            onDelete={() => deleteMessage(message.id)}
            locale={locale}
            t={t}
          />
        ))}

        <div ref={scrollBottomRef} />
      </div>

      <div className="border-t border-subtle px-4 py-3 sm:px-5">
        {composerError && (
          <p className="mb-2 text-xs font-semibold text-red-400">{composerError}</p>
        )}

        {pendingFile && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-secondary">
            <span className="min-w-0 flex-1 truncate">{pendingFile.name}</span>
            <button
              type="button"
              onClick={() => handleFilePick(null)}
              className="font-bold text-red-400"
            >
              ✕
            </button>
          </div>
        )}

        {pendingEntity && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-secondary">
            <span className="min-w-0 flex-1 truncate">📎 {pendingEntity.label}</span>
            <button
              type="button"
              onClick={() => setPendingEntity(null)}
              aria-label={t("chat.entityPicker.remove")}
              className="font-bold text-red-400"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => handleFilePick(e.target.files?.[0] || null)}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label={t("chat.attachFile")}
            title={t("chat.attachFile")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-secondary transition hover:text-primary"
          >
            📎
          </button>

          <button
            type="button"
            onClick={() => setShowEntityPicker(true)}
            aria-label={t("chat.attachFromEsblu")}
            title={t("chat.attachFromEsblu")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-secondary transition hover:text-primary"
          >
            🔗
          </button>

          <textarea
            ref={composerTextareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={t("chat.composerPlaceholder")}
            rows={1}
            // Výška riadená JS efektom vyššie (auto-grow podľa obsahu,
            // min ~1-2 riadky až max ~5-6 riadkov, potom vnútorný scroll) —
            // min-h-[44px] ostáva ako CSS fallback pred prvým behom efektu.
            // overflow-x-hidden vylučuje horizontálny scroll aj pri veľmi
            // dlhom jednom "slove" bez medzery (wrap už rieši resize-none
            // textarea samo, toto je len istota).
            className="min-h-[44px] flex-1 resize-none overflow-x-hidden rounded-xl border border-subtle bg-surface-1/60 px-3.5 py-2.5 text-sm text-primary outline-none placeholder:text-muted-esblu"
          />

          <button
            type="button"
            onClick={sendMessage}
            disabled={sending || (!text.trim() && !pendingFile && !pendingEntity)}
            className="flex h-11 shrink-0 items-center justify-center rounded-xl bg-accent-cyan px-4 text-sm font-bold text-[#051221] transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("chat.send")}
          </button>
        </div>
      </div>

      {showEntityPicker && (
        <EntityPickerModal
          onClose={() => setShowEntityPicker(false)}
          onSelect={(entityType, entityId, label) => {
            setPendingEntity({ entityType, entityId, label });
            setShowEntityPicker(false);
          }}
        />
      )}
    </div>
  );
}

function MessageBubble({
  message,
  isMine,
  attachments,
  references,
  editing,
  editText,
  onEditTextChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  locale,
  t,
}: {
  message: ChatMessage;
  isMine: boolean;
  attachments: ChatAttachment[];
  references: ChatMessageReference[];
  editing: boolean;
  editText: string;
  onEditTextChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const isDeleted = message.deleted_at !== null;

  const time = new Date(message.created_at).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-[70%] ${
          isMine
            ? "bg-accent-cyan/16 text-primary"
            : "surface-card-2 text-primary"
        }`}
      >
        {isDeleted ? (
          <p className="text-sm italic text-muted-esblu">{t("chat.messageDeleted")}</p>
        ) : editing ? (
          <div className="space-y-2">
            <textarea
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-subtle bg-surface-1/70 px-2.5 py-2 text-sm text-primary outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancelEdit}
                className="text-xs font-semibold text-secondary"
              >
                {t("common.buttons.cancel")}
              </button>
              <button
                type="button"
                onClick={onSaveEdit}
                className="text-xs font-bold text-accent-cyan"
              >
                {t("common.buttons.save")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {message.body && (
              <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
            )}

            {attachments.map((attachment) => (
              <ChatAttachmentChip key={attachment.id} attachment={attachment} t={t} />
            ))}

            {references.map((reference) => (
              <ChatEntityReferenceCard key={reference.id} reference={reference} t={t} />
            ))}
          </>
        )}

        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-esblu">
          <span>{time}</span>
          {message.edited_at && !isDeleted && <span>· {t("chat.editedLabel")}</span>}
          {isMine && !isDeleted && !editing && (
            <>
              <button type="button" onClick={onStartEdit} className="font-semibold hover:text-primary">
                {t("chat.edit")}
              </button>
              <button type="button" onClick={onDelete} className="font-semibold hover:text-red-400">
                {t("chat.delete")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatAttachmentChip({
  attachment,
  t,
}: {
  attachment: ChatAttachment;
  t: (key: string) => string;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const isImage = attachment.mime_type.startsWith("image/");

  async function openAttachment() {
    if (signedUrl) {
      window.open(signedUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const { data } = await supabase.storage
      .from(attachment.storage_bucket)
      .createSignedUrl(attachment.storage_path, 300);

    if (data?.signedUrl) {
      setSignedUrl(data.signedUrl);
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <button
      type="button"
      onClick={openAttachment}
      className="mt-2 flex items-center gap-2 rounded-lg bg-surface-1/70 px-2.5 py-1.5 text-xs font-semibold text-secondary transition hover:text-primary"
    >
      <span aria-hidden="true">{isImage ? "🖼️" : "📄"}</span>
      <span className="min-w-0 max-w-[180px] truncate">
        {attachment.original_filename || t("chat.entityCard.openOriginal")}
      </span>
    </button>
  );
}

function ChatEntityReferenceCard({
  reference,
  t,
}: {
  reference: ChatMessageReference;
  t: (key: string) => string;
}) {
  const [card, setCard] = useState<ResolvedEntityCard | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;

    resolveChatEntityCard(reference.entity_type, reference.entity_id).then((result) => {
      if (!cancelled) setCard(result);
    });

    return () => {
      cancelled = true;
    };
  }, [reference.entity_type, reference.entity_id]);

  async function handleClick() {
    if (!card || card === "loading") return;

    if (card.href) {
      window.location.href = card.href;
      return;
    }

    if (reference.entity_type === "document") {
      const { data } = await supabase
        .from("documents")
        .select("storage_bucket, storage_path")
        .eq("id", reference.entity_id)
        .maybeSingle();

      if (data) {
        const { data: signed } = await supabase.storage
          .from(data.storage_bucket)
          .createSignedUrl(data.storage_path, 300);

        if (signed?.signedUrl) {
          window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
        }
      }
    }
  }

  if (card === "loading") {
    return (
      <div className="mt-2 rounded-xl border border-subtle bg-surface-1/70 px-3 py-2 text-xs text-muted-esblu">
        {t("common.buttons.loading")}
      </div>
    );
  }

  if (!card) {
    return (
      <div className="mt-2 rounded-xl border border-subtle bg-surface-1/70 px-3 py-2 text-xs text-muted-esblu">
        {t("chat.entityCard.unavailable")}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="surface-card-hover mt-2 flex w-full flex-col items-start gap-0.5 rounded-xl border border-subtle bg-surface-1/70 px-3 py-2 text-left transition"
    >
      <span className="text-sm font-bold text-primary">{card.title}</span>
      {card.subtitle && (
        <span className="text-xs text-muted-esblu">{card.subtitle}</span>
      )}
    </button>
  );
}
