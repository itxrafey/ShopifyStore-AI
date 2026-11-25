"use client";

import {
  DefaultChatTransport,
  isTextUIPart,
  isToolUIPart,
  type UIMessage,
} from "ai";
import { useChat } from "@ai-sdk/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CornerDownLeft,
  LoaderCircle,
  LockKeyhole,
  Package,
  Send,
  Sparkles,
  Truck,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

const PASSWORD_STORAGE_KEY = "shopify-inventory-admin-password";

export type ChatActivityEvent = {
  id: string;
  label: string;
  time: string;
  failed: boolean;
};

type ToolMutationEvent = {
  label: string;
  failed: boolean;
};

type ChatViewProps = {
  isActive: boolean;
  rightPanelOpen: boolean;
  sessionId: string;
  initialMessages: UIMessage[];
  onMessagesUpdated: (messages: UIMessage[]) => void;
  activityEvents: ChatActivityEvent[];
  productCount: number | null;
  lowStockCount: number | null;
  prefillPrompt: string;
  onPrefillConsumed: () => void;
  onError: (message: string) => void;
  onMutation: (event: ToolMutationEvent) => void;
  onRefreshStoreData: () => Promise<void>;
  onUnauthorized: () => void;
  onLock: () => void;
  onUserMessageSent: () => void;
  onViewInsights: () => void;
};

const starterActions = [
  {
    label: "List all products",
    description: "Browse the complete Shopify catalog",
    prompt:
      "List all products with price, stock, status, storefront visibility, and product ID.",
    icon: Package,
  },
  {
    label: "Create & publish a product",
    description: "Add a product to the live storefront",
    prompt:
      "Create and publish a sample product for $19.99 with a clear title and short description.",
    icon: Sparkles,
  },
  {
    label: "Audit low stock items",
    description: "Find variants that need a restock",
    prompt:
      "Audit low stock items and list every variant with 10 or fewer units available.",
    icon: Activity,
  },
  {
    label: "Show recent orders",
    description: "Review the latest sales and statuses",
    prompt:
      "Show the 15 most recent orders with date, payment and fulfillment status, and total.",
    icon: Truck,
  },
];

const quickActions = [
  { label: "List all products", prompt: starterActions[0].prompt },
  { label: "Audit low stock", prompt: starterActions[2].prompt },
  { label: "Show recent orders", prompt: starterActions[3].prompt },
  { label: "Create a product", prompt: starterActions[1].prompt },
];

const toolLabels: Record<string, string> = {
  listProducts: "products",
  listAllProducts: "products",
  createProduct: "product",
  updateProduct: "product",
  updateInventory: "inventory",
  deleteProduct: "product",
  listOrders: "orders",
  getStoreOverview: "store overview",
};

const mutationToolNames = new Set([
  "createProduct",
  "updateProduct",
  "updateInventory",
  "deleteProduct",
]);

function getToolParts(message: UIMessage) {
  return message.parts.filter(isToolUIPart);
}

type ToolPart = ReturnType<typeof getToolParts>[number];

function getToolName(part: ToolPart): string {
  return part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
}

function isTerminalToolState(part: ToolPart) {
  return (
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied"
  );
}

function getToolSummary(part: ToolPart): string {
  const toolName = getToolName(part);
  if (part.state === "output-error") return `Failed to update ${toolLabels[toolName] ?? "Shopify"}`;
  if (part.state === "output-denied") return `Approval required for ${toolLabels[toolName] ?? "Shopify"}`;
  if (!isTerminalToolState(part)) {
    return `Running ${toolName}...`;
  }

  if (part.state === "output-available") {
    if (
      toolName === "listProducts" ||
      toolName === "listAllProducts" ||
      toolName === "listOrders"
    ) {
      const count = Array.isArray(part.output) ? part.output.length : undefined;
      if (count !== undefined) {
        return `Listed ${count} ${toolLabels[toolName]}`;
      }
    }

    switch (toolName) {
      case "createProduct":
        return "Created product";
      case "updateProduct":
        return "Updated product";
      case "updateInventory":
        return "Updated inventory";
      case "deleteProduct":
        return "Deleted product";
      case "getStoreOverview":
        return "Loaded store overview";
      default:
        return `Completed ${toolName}`;
    }
  }

  return `Completed ${toolName}`;
}

function getToolFailureDetails(part: ToolPart) {
  if (part.state === "output-error") return part.errorText;
  if (part.state === "output-denied") {
    return "This action was denied before it reached Shopify.";
  }
  return undefined;
}

function InlineMarkdown({ text }: { text: string }) {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return tokens.map((token, index) => {
    if (token.startsWith("`") && token.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.88em] text-emerald-900"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith("*") && token.endsWith("*")) {
      return <em key={index}>{token.slice(1, -1)}</em>;
    }
    return token;
  });
}

function parseTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDivider(line: string) {
  return line.includes("-") && /^\s*\|?[\s:|-]+\|?\s*$/.test(line);
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      const fence = trimmed.slice(0, 3);
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(fence)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre
          key={`code-${index}`}
          className="custom-scrollbar my-3 max-w-full overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-6 text-slate-100"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (
      trimmed.includes("|") &&
      index + 1 < lines.length &&
      isTableDivider(lines[index + 1])
    ) {
      const headers = parseTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim().includes("|")) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div
          key={`table-${index}`}
          className="markdown-table-wrapper custom-scrollbar my-3 overflow-x-auto rounded-xl border border-slate-200"
        >
          <table className="w-full min-w-[440px] border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-slate-50">
              <tr>
                {headers.map((header, cellIndex) => (
                  <th
                    key={cellIndex}
                    className="whitespace-nowrap border-b border-slate-200 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:px-4"
                  >
                    <InlineMarkdown text={header} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="align-top">
                  {headers.map((_, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-3 py-2.5 text-slate-700 sm:px-4"
                    >
                      <InlineMarkdown text={row[cellIndex] ?? ""} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push(
        <h3
          key={`heading-${index}`}
          className="mb-2 mt-4 text-sm font-semibold text-slate-900 sm:text-base"
        >
          <InlineMarkdown text={heading[2]} />
        </h3>,
      );
      index += 1;
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      const isNumbered = Boolean(numbered);
      const items: string[] = [];
      while (index < lines.length) {
        const itemLine = lines[index].trim();
        const match = isNumbered
          ? itemLine.match(/^\d+[.)]\s+(.+)$/)
          : itemLine.match(/^[-*+]\s+(.+)$/);
        if (!match) break;
        items.push(match[1]);
        index += 1;
      }
      const ListTag = isNumbered ? "ol" : "ul";
      blocks.push(
        <ListTag
          key={`list-${index}`}
          className={`my-3 space-y-1.5 pl-5 text-sm leading-6 text-slate-700 ${
            isNumbered ? "list-decimal" : "list-disc marker:text-emerald-600"
          }`}
        >
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ListTag>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      const current = lines[index].trim();
      if (
        current.match(/^#{1,3}\s+/) ||
        current.match(/^[-*+]\s+/) ||
        current.match(/^\d+[.)]\s+/) ||
        current.startsWith("```") ||
        current.startsWith("~~~") ||
        (current.includes("|") &&
          index + 1 < lines.length &&
          isTableDivider(lines[index + 1]))
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }

    if (paragraph.length) {
      blocks.push(
        <p
          key={`paragraph-${index}`}
          className="my-2 text-sm leading-6 text-slate-700"
        >
          <InlineMarkdown text={paragraph.join(" ")} />
        </p>,
      );
    } else {
      index += 1;
    }
  }

  return (
    <div className="ai-message-content min-w-0 max-w-full break-words">
      {blocks}
    </div>
  );
}

function ToolStatusPill({ part }: { part: ToolPart }) {
  const [expanded, setExpanded] = useState(false);
  const complete = part.state === "output-available";
  const failed =
    part.state === "output-error" || part.state === "output-denied";
  const running = !isTerminalToolState(part);
  const failureDetails = getToolFailureDetails(part);

  return (
    <div className="max-w-full">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
          failed
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : complete
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-white text-slate-600"
        }`}
      >
        {running ? (
          <LoaderCircle size={13} className="shrink-0 animate-spin" />
        ) : failed ? (
          <CircleAlert size={13} className="shrink-0" />
        ) : (
          <CheckCircle2 size={13} className="shrink-0" />
        )}
        <span className="truncate">{getToolSummary(part)}</span>
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 max-w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
              {failureDetails || "Shopify action completed successfully."}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ToolStatuses({ parts }: { parts: ToolPart[] }) {
  if (!parts.length) return null;

  return (
    <div className="mt-3 flex max-w-full flex-wrap gap-2">
      {parts.map((part) => (
        <ToolStatusPill key={part.toolCallId} part={part} />
      ))}
    </div>
  );
}

function ChatBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const textParts = message.parts.filter(isTextUIPart);
  const toolParts = getToolParts(message);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={isUser ? "flex justify-end" : "flex items-start gap-3"}
    >
      {!isUser ? (
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
          <Bot size={16} />
        </div>
      ) : null}
      <div className={isUser ? "max-w-[88%] sm:max-w-[80%]" : "min-w-0 flex-1"}>
        {!isUser ? (
          <p className="mb-1.5 text-[11px] font-semibold text-slate-600">
            ShopifyStore AI
          </p>
        ) : null}
        <div
          className={
            isUser
              ? "min-w-0 rounded-2xl rounded-br-sm bg-emerald-600 px-4 py-3 text-sm leading-6 text-white shadow-sm sm:px-5"
              : "min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs sm:p-4"
          }
        >
          {textParts.map((part, index) =>
            isUser ? (
              <p key={index} className="whitespace-pre-wrap break-words">
                {part.text}
              </p>
            ) : (
              <MarkdownContent key={index} text={part.text} />
            ),
          )}
        </div>
        <ToolStatuses parts={toolParts} />
      </div>
    </motion.div>
  );
}

function ActivityFeed({ events }: { events: ChatActivityEvent[] }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            Session activity
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Recent store actions
          </p>
        </div>
        <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Activity size={15} />
        </span>
      </div>
      {events.length ? (
        <motion.ul layout className="mt-4 space-y-3">
          <AnimatePresence initial={false}>
            {events.slice(0, 6).map((event) => (
              <motion.li
                key={event.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-start gap-2.5"
              >
                <span
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg ${
                    event.failed
                      ? "bg-rose-50 text-rose-600"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {event.failed ? (
                    <CircleAlert size={13} />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[11px] font-medium leading-4 text-slate-700">
                    {event.label}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {event.time}
                  </p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      ) : (
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-4 text-center text-[11px] leading-5 text-slate-500">
          Completed product and inventory actions will appear here.
        </p>
      )}
    </section>
  );
}

function StoreSnapshot({
  productCount,
  lowStockCount,
  onViewInsights,
}: {
  productCount: number | null;
  lowStockCount: number | null;
  onViewInsights: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
      <p className="text-[11px] font-semibold text-slate-700">Store snapshot</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] text-slate-500">Products</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">
            {productCount === null ? "—" : productCount.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 p-3">
          <p className="text-[10px] text-amber-800">Low stock</p>
          <p className="mt-1 text-lg font-semibold text-amber-900">
            {lowStockCount === null ? "—" : lowStockCount.toLocaleString()}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onViewInsights}
        className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 hover:text-emerald-950"
      >
        View store insights <ArrowUpRight size={13} />
      </button>
    </section>
  );
}

function StoreLockCard({ onLock }: { onLock: () => void }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
      <p className="text-[11px] font-medium text-slate-700">
        Store actions are protected
      </p>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">
        Lock the dashboard whenever you step away.
      </p>
      <button
        type="button"
        onClick={onLock}
        className="mt-3 flex h-10 w-full items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
      >
        <LockKeyhole size={15} aria-hidden="true" />
        Lock Dashboard
      </button>
    </section>
  );
}

export default function ChatView({
  isActive,
  rightPanelOpen,
  sessionId,
  initialMessages,
  onMessagesUpdated,
  activityEvents,
  productCount,
  lowStockCount,
  prefillPrompt,
  onPrefillConsumed,
  onError,
  onMutation,
  onRefreshStoreData,
  onUnauthorized,
  onLock,
  onUserMessageSent,
  onViewInsights,
}: ChatViewProps) {
  const [draft, setDraft] = useState("");
  const messageEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [processedMutationKeys] = useState(() => {
    const keys = new Set<string>();
    for (const message of initialMessages) {
      for (const part of getToolParts(message)) {
        if (mutationToolNames.has(getToolName(part)) && isTerminalToolState(part)) {
          keys.add(`${message.id}:${part.toolCallId}`);
        }
      }
    }
    return keys;
  });
  const savedMessagesRef = useRef<UIMessage[] | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: () => ({
          "x-admin-password":
            window.localStorage.getItem(PASSWORD_STORAGE_KEY) ?? "",
        }),
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (response.status === 401) onUnauthorized();
          return response;
        },
      }),
    [onUnauthorized],
  );

  const {
    messages,
    sendMessage,
    status,
    error,
    regenerate,
    clearError,
    stop,
  } = useChat({
    id: sessionId,
    messages: initialMessages,
    transport,
    onError: (requestError) => onError(requestError.message),
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (isBusy || savedMessagesRef.current === messages) return;
    savedMessagesRef.current = messages;
    onMessagesUpdated(messages);
  }, [isBusy, messages, onMessagesUpdated]);

  useEffect(() => {
    if (!prefillPrompt) return;
    const frame = window.requestAnimationFrame(() => {
      setDraft(prefillPrompt);
      composerRef.current?.focus();
      onPrefillConsumed();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [onPrefillConsumed, prefillPrompt]);

  useEffect(() => {
    if (!isActive) return;
    messageEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [isActive, messages, status]);

  useEffect(() => {
    const events: ToolMutationEvent[] = [];
    for (const message of messages) {
      for (const part of getToolParts(message)) {
        const toolName = getToolName(part);
        if (!mutationToolNames.has(toolName) || !isTerminalToolState(part)) {
          continue;
        }

        const key = `${message.id}:${part.toolCallId}`;
        if (processedMutationKeys.has(key)) continue;
        processedMutationKeys.add(key);
        events.push({
          label: getToolSummary(part),
          failed: part.state === "output-error" || part.state === "output-denied",
        });
      }
    }

    if (events.length) {
      void Promise.resolve().then(async () => {
        events.forEach(onMutation);
        await onRefreshStoreData();
      });
    }
  }, [messages, onMutation, onRefreshStoreData, processedMutationKeys]);

  const submitPrompt = useCallback(
    (prompt: string) => {
      const cleanPrompt = prompt.trim();
      if (!cleanPrompt || isBusy) return;
      clearError();
      sendMessage({ text: cleanPrompt });
      setDraft("");
      if (composerRef.current) composerRef.current.style.height = "48px";
      onUserMessageSent();
    },
    [clearError, isBusy, onUserMessageSent, sendMessage],
  );

  const submitChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitPrompt(draft);
  };

  const handleComposerKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submitPrompt(draft);
    }
  };

  const handleDraftChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const textarea = event.currentTarget;
    setDraft(textarea.value);
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  };

  return (
    <div
      className={
        isActive
          ? `grid h-full min-h-0 transition-[grid-template-columns] duration-300 ease-in-out ${
              rightPanelOpen
                ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px]"
                : "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_0px]"
            }`
          : "hidden"
      }
    >
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6">
          <div className="mx-auto w-full max-w-3xl">
            {error ? (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-800"
              >
                <CircleAlert size={15} className="shrink-0" />
                <span className="min-w-0 flex-1 break-words">
                  {error.message}
                </span>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    clearError();
                    void regenerate();
                  }}
                  className="min-h-9 rounded-lg bg-white px-3 font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:opacity-50"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={clearError}
                  className="min-h-9 rounded-lg px-2 font-medium text-rose-700 transition hover:bg-rose-100"
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            {messages.length === 0 ? (
              <div className="flex min-h-full flex-col justify-center py-4 sm:py-8">
                <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
                  <Sparkles size={13} />
                  Your Shopify operations copilot
                </div>
                <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-8">
                  <h2 className="text-2xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-3xl">
                    Your store, in good hands.
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                    Get clear answers and take confident action across products,
                    inventory, and orders.
                  </p>
                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {starterActions.map(({ label, description, prompt, icon: Icon }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => submitPrompt(prompt)}
                        disabled={isBusy}
                        className="group flex min-h-[76px] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50 disabled:cursor-not-allowed disabled:opacity-50 sm:p-4"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 transition group-hover:bg-emerald-100">
                          <Icon size={17} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-slate-800">
                            {label}
                          </span>
                          <span className="mt-1 block text-[11px] leading-4 text-slate-500">
                            {description}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 pb-3">
                {messages.map((message) => (
                  <ChatBubble key={message.id} message={message} />
                ))}
                {isBusy ? (
                  <div className="flex items-center gap-2 pl-1 text-xs text-slate-500">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <motion.span
                        animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 1.25, repeat: Infinity }}
                      >
                        <Sparkles size={14} />
                      </motion.span>
                    </span>
                    ShopifyStore AI is thinking...
                  </div>
                ) : null}
                <div ref={messageEndRef} />
              </div>
            )}

            <AnimatePresence initial={false}>
              {rightPanelOpen ? (
                <motion.div
                  id="assistant-mobile-panel"
                  initial={{ opacity: 0, height: 0, y: 8 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: 8 }}
                  transition={{ duration: 0.18 }}
                  className="mt-6 space-y-4 overflow-hidden xl:hidden"
                >
                  <ActivityFeed events={activityEvents} />
                  <StoreSnapshot
                    productCount={productCount}
                    lowStockCount={lowStockCount}
                    onViewInsights={onViewInsights}
                  />
                  <StoreLockCard onLock={onLock} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white/90 p-3 backdrop-blur-md sm:p-4">
          <div className="mx-auto w-full max-w-3xl">
            <div className="no-scrollbar mb-3 flex items-center gap-2 overflow-x-auto pb-1">
              {quickActions.map(({ label, prompt }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => submitPrompt(prompt)}
                  disabled={isBusy}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-medium text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 sm:text-[11px]"
                >
                  <Zap size={12} className="text-emerald-700" />
                  {label}
                </button>
              ))}
            </div>
            <form
              onSubmit={submitChat}
              className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm transition focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-50"
            >
              <textarea
                ref={composerRef}
                value={draft}
                onChange={handleDraftChange}
                onKeyDown={handleComposerKeyDown}
                placeholder="Ask your inventory assistant..."
                aria-label="Message ShopifyStore AI"
                rows={1}
                className="max-h-40 min-h-12 w-full resize-none overflow-y-auto bg-transparent px-3 py-3 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400"
              />
              <div className="flex items-center justify-between gap-3 px-1 pb-0.5">
                <span className="min-w-0 truncate pl-2 text-[10px] text-slate-400">
                  <span className="hidden sm:inline">
                    Enter to send · Shift + Enter for a new line
                  </span>
                  <span className="sm:hidden">ShopifyStore AI</span>
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden items-center gap-1 text-[10px] text-slate-400 sm:inline-flex">
                    <CornerDownLeft size={12} />
                    Send
                  </span>
                  {isBusy ? (
                    <button
                      type="button"
                      onClick={stop}
                      aria-label="Stop response"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <span className="size-2.5 rounded-[3px] bg-current" />
                      Stop
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!draft.trim()}
                      aria-label="Send message"
                      className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      <Send size={15} />
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      </section>

      <aside
        id="assistant-insights-panel"
        aria-hidden={!rightPanelOpen}
        inert={!rightPanelOpen}
        className={`custom-scrollbar hidden min-h-0 min-w-0 flex-col gap-4 bg-slate-50/70 transition-opacity duration-200 xl:flex ${
          rightPanelOpen
            ? "overflow-y-auto border-l border-slate-200/80 p-5 opacity-100"
            : "overflow-hidden border-l-0 p-0 opacity-0"
        }`}
      >
        <ActivityFeed events={activityEvents} />
        <StoreSnapshot
          productCount={productCount}
          lowStockCount={lowStockCount}
          onViewInsights={onViewInsights}
        />
        <div className="mt-auto">
          <StoreLockCard onLock={onLock} />
        </div>
      </aside>
    </div>
  );
}
