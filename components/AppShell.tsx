"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Boxes,
  Clock3,
  LockKeyhole,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  Plus,
  ShoppingBag,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  formatSessionRelativeTime,
  type ChatSession,
} from "@/lib/chat-history";

export type DashboardTab = "assistant" | "products" | "inventory" | "orders";
export type ShopifyConnectionStatus =
  | "checking"
  | "connected"
  | "disconnected";

type AppShellProps = {
  activeTab: DashboardTab;
  counts: Record<DashboardTab, string>;
  connectionStatus: ShopifyConnectionStatus;
  storeDomain: string;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onNavigate: (tab: DashboardTab) => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onLock: () => void;
  children: ReactNode;
};

const navigation: Array<{
  id: DashboardTab;
  label: string;
  icon: typeof Bot;
}> = [
  { id: "assistant", label: "AI Assistant", icon: Bot },
  { id: "products", label: "Product Catalog", icon: Boxes },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "orders", label: "Orders & Insights", icon: TrendingUp },
];

const tabEyebrows: Record<DashboardTab, string> = {
  assistant: "MERCHANT COPILOT",
  products: "YOUR SHOPIFY CATALOG",
  inventory: "STOCK MANAGEMENT",
  orders: "STORE PERFORMANCE",
};

function ConnectionStatus({
  status,
  storeDomain,
  compact = false,
}: {
  status: ShopifyConnectionStatus;
  storeDomain: string;
  compact?: boolean;
}) {
  const statusLabel =
    status === "connected"
      ? "Connected"
      : status === "checking"
        ? "Checking connection"
        : "Connection issue";

  return (
    <div
      role="status"
      aria-live="polite"
      title={storeDomain ? `https://${storeDomain}` : "Shopify store"}
      className={`flex min-w-0 items-center gap-2 rounded-xl ${
        compact
          ? "px-2 py-1.5"
          : "border border-slate-200/80 bg-slate-50 px-3 py-2"
      }`}
    >
      <span className="relative flex size-2 shrink-0">
        {status === "checking" ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-40" />
        ) : null}
        <span
          className={`relative inline-flex size-2 rounded-full ${
            status === "connected"
              ? "bg-emerald-500"
              : status === "checking"
                ? "bg-amber-500"
                : "bg-rose-500"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span
          className={`block truncate text-[11px] font-medium ${
            status === "connected"
              ? "text-emerald-800"
              : status === "checking"
                ? "text-amber-800"
                : "text-rose-700"
          }`}
        >
          {statusLabel}
        </span>
        {!compact ? (
          <span className="block truncate text-[10px] text-slate-500">
            {storeDomain ? `://${storeDomain}` : "://myshopify.com"}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function SidebarContent({
  activeTab,
  counts,
  sessions,
  activeSessionId,
  onNavigate,
  onNewChat,
  onSelectSession,
  onDeleteSession,
}: Omit<AppShellProps, "children" | "connectionStatus" | "storeDomain" | "onLock">) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/80 px-5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-700 text-white">
          <ShoppingBag size={18} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-slate-900">
            ShopifyStore AI
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Merchant workspace
          </p>
        </div>
      </div>

      <div className="shrink-0">
        <nav aria-label="Dashboard navigation" className="mt-6 px-3">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
            Workspace
          </p>
          <div className="space-y-1">
            {navigation.map(({ id, label, icon: Icon }) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate(id)}
                  aria-current={selected ? "page" : undefined}
                  className={`relative isolate flex h-11 w-full items-center gap-3 overflow-hidden rounded-xl px-3 text-left text-sm transition ${
                    selected
                      ? "font-medium text-slate-900"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {selected ? (
                    <motion.span
                      layoutId="shopifystore-active-tab"
                      className="absolute inset-0 -z-10 rounded-xl bg-emerald-50"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 34,
                      }}
                    />
                  ) : null}
                  <Icon
                    size={17}
                    className={selected ? "text-emerald-700" : "text-slate-400"}
                  />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] tabular-nums ${
                      selected
                        ? "bg-white text-emerald-800 ring-1 ring-emerald-100"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {counts[id]}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <section
        aria-label="Chat history"
        className="flex min-h-0 flex-1 flex-col px-3 pt-5"
      >
        <div className="mb-2 flex shrink-0 items-center justify-between px-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
            Chat History
          </h2>
          <span className="text-[10px] tabular-nums text-slate-400">
            {sessions.length}
          </span>
        </div>
        <div className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 pb-3">
          {sessions.length ? (
            sessions.map((session) => {
              const selected = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  className={`group flex min-w-0 items-center gap-1 rounded-xl px-1 transition ${
                    selected
                      ? "bg-emerald-50 ring-1 ring-emerald-100"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSession(session.id)}
                    aria-current={selected ? "page" : undefined}
                    className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-emerald-700"
                  >
                    <span
                      className={`block truncate text-xs ${
                        selected
                          ? "font-semibold text-emerald-900"
                          : "font-medium text-slate-700"
                      }`}
                    >
                      {session.title || "New Chat"}
                    </span>
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                      <Clock3 size={11} aria-hidden="true" />
                      {formatSessionRelativeTime(session.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSession(session.id)}
                    aria-label={`Delete chat: ${session.title || "New Chat"}`}
                    title="Delete chat"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-rose-600 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              );
            })
          ) : (
            <p className="px-3 py-3 text-[11px] leading-5 text-slate-400">
              Your conversations will appear here.
            </p>
          )}
        </div>
      </section>

      <div className="shrink-0 border-t border-slate-200/80 px-4 py-4">
        <button
          type="button"
          onClick={onNewChat}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          <Plus size={16} aria-hidden="true" />
          New Chat
        </button>
      </div>
    </div>
  );
}

export default function AppShell({
  activeTab,
  counts,
  connectionStatus,
  storeDomain,
  sessions,
  activeSessionId,
  onNavigate,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onLock,
  children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const activeLabel =
    navigation.find((item) => item.id === activeTab)?.label ?? "Dashboard";

  useEffect(() => {
    if (!drawerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  const navigate = (tab: DashboardTab) => {
    onNavigate(tab);
    setDrawerOpen(false);
  };

  const lock = () => {
    setDrawerOpen(false);
    onLock();
  };

  const startNewChat = () => {
    setDrawerOpen(false);
    onNewChat();
  };

  const selectSession = (id: string) => {
    setDrawerOpen(false);
    onSelectSession(id);
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#F8F9FA] text-slate-900">
      <motion.aside
        id="desktop-dashboard-sidebar"
        initial={false}
        animate={{
          width: sidebarCollapsed ? 0 : 256,
          borderRightWidth: sidebarCollapsed ? 0 : 1,
        }}
        transition={{ duration: 0.22, ease: "easeInOut" }}
        className="hidden h-full shrink-0 overflow-hidden border-r border-slate-200/80 bg-white lg:flex lg:flex-col"
      >
        <SidebarContent
          activeTab={activeTab}
          counts={counts}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNavigate={navigate}
          onNewChat={startNewChat}
          onSelectSession={selectSession}
          onDeleteSession={onDeleteSession}
        />
      </motion.aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-3 lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open dashboard menu"
              aria-expanded={drawerOpen}
              aria-controls="mobile-dashboard-drawer"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <Menu size={19} />
            </button>
            <h1 className="truncate text-sm font-semibold text-slate-900">
              {activeLabel}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ConnectionStatus
              status={connectionStatus}
              storeDomain={storeDomain}
              compact
            />
            <button
              type="button"
              onClick={lock}
              aria-label="Lock dashboard"
              className="flex size-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-rose-50 hover:text-rose-700"
            >
              <LockKeyhole size={16} />
            </button>
          </div>
        </header>

        <header className="hidden h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-4 lg:flex">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!sidebarCollapsed}
              aria-controls="desktop-dashboard-sidebar"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={18} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={18} aria-hidden="true" />
              )}
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {tabEyebrows[activeTab]}
              </p>
              <h1 className="mt-0.5 text-sm font-semibold text-slate-900">
                {activeLabel}
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={lock}
              aria-label="Lock dashboard"
              title="Lock dashboard"
              className="flex size-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
            >
              <LockKeyhole size={16} aria-hidden="true" />
            </button>
            <ConnectionStatus
              status={connectionStatus}
              storeDomain={storeDomain}
              compact
            />
          </div>
        </header>

        <main className="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {children}
        </main>
      </div>

      <AnimatePresence>
        {drawerOpen ? (
          <motion.div
            className="fixed inset-0 z-50 lg:hidden"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
          >
            <motion.button
              type="button"
              aria-label="Close dashboard menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 h-full w-full cursor-default bg-slate-950/35"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            />
            <motion.aside
              id="mobile-dashboard-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Dashboard navigation"
              className="absolute inset-y-0 left-0 flex h-full w-[min(86vw,300px)] flex-col overflow-hidden shadow-2xl"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 36 }}
            >
              <SidebarContent
                activeTab={activeTab}
                counts={counts}
                sessions={sessions}
                activeSessionId={activeSessionId}
                onNavigate={navigate}
                onNewChat={startNewChat}
                onSelectSession={selectSession}
                onDeleteSession={onDeleteSession}
              />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close dashboard menu"
                className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-lg bg-white/90 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={17} />
              </button>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
