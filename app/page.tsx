"use client";

import { AnimatePresence, motion } from "framer-motion";
import AppShell, {
  type DashboardTab,
  type ShopifyConnectionStatus,
} from "@/components/AppShell";
import ChatView from "@/components/ChatView";
import {
  CatalogView,
  InventoryView,
  OrdersView,
} from "@/components/StoreViews";
import {
  createNewSession,
  deleteSession,
  getAllSessions,
  getSession,
  saveSession,
  type ChatSession,
} from "@/lib/chat-history";
import PasswordLockScreen from "@/components/PasswordLockScreen";
import ToastViewport, {
  type ToastNotification,
} from "@/components/ToastViewport";
import type { UIMessage } from "ai";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import type {
  ShopifyOrder,
  ShopifyProduct,
  ShopifyStoreOverview,
} from "@/lib/shopify-admin";

const PASSWORD_STORAGE_KEY = "shopify-inventory-admin-password";
const PASSWORD_CHANGE_EVENT = "shopify-admin-password-change";

function subscribeToPassword(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PASSWORD_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PASSWORD_CHANGE_EVENT, onChange);
  };
}

function getSavedPassword() {
  return window.localStorage.getItem(PASSWORD_STORAGE_KEY) ?? "";
}

function notifyPasswordChange() {
  window.dispatchEvent(new Event(PASSWORD_CHANGE_EVENT));
}

function savePassword(password: string) {
  window.localStorage.setItem(PASSWORD_STORAGE_KEY, password);
  notifyPasswordChange();
}

function clearSavedPassword() {
  window.localStorage.removeItem(PASSWORD_STORAGE_KEY);
  notifyPasswordChange();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function statusLabel(status: string | null | undefined) {
  if (!status) return "Unknown";
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function Home() {
  const [passwordInput, setPasswordInput] = useState("");
  const [lockError, setLockError] = useState("");
  const [prefillPrompt, setPrefillPrompt] = useState("");
  const [assistantMessageCount, setAssistantMessageCount] = useState(0);
  const [activeTab, setActiveTab] = useState<DashboardTab>("assistant");
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [overview, setOverview] = useState<ShopifyStoreOverview | null>(null);
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const toastTimerRef = useRef<number | null>(null);
  const activeChatSessionRef = useRef<ChatSession | null>(null);
  const [shopifyConnectionStatus, setShopifyConnectionStatus] =
    useState<ShopifyConnectionStatus>("checking");
  const [shopDomain, setShopDomain] = useState("");
  const savedPassword = useSyncExternalStore(
    subscribeToPassword,
    getSavedPassword,
    () => "",
  );
  const isUnlocked = Boolean(savedPassword);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback(
    (kind: ToastNotification["kind"], message: string) => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      setToast({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        message,
      });
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 4000);
    },
    [],
  );

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isUnlocked) {
      activeChatSessionRef.current = null;
      return;
    }

    try {
      const session = getAllSessions()[0] ?? createNewSession();
      const sessions = getAllSessions();
      activeChatSessionRef.current = session;
      // Sync saved browser data into the dashboard after unlock.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChatSessions(sessions);
      setChatSession(session);
    } catch (error) {
      activeChatSessionRef.current = null;
      setChatSessions([]);
      setChatSession(null);
      showToast("error", `Unable to load saved chat history: ${errorMessage(error)}`);
    }
  }, [isUnlocked, showToast]);

  const updateChatMessages = useCallback(
    (sessionId: string, messages: UIMessage[]) => {
      const session = activeChatSessionRef.current;
      if (!session || session.id !== sessionId) return;

      const updatedSession: ChatSession = {
        ...session,
        messages,
        updatedAt: Date.now(),
      };

      try {
        saveSession(updatedSession);
        const savedSession = getSession(session.id) ?? updatedSession;
        activeChatSessionRef.current = savedSession;
        setChatSessions(getAllSessions());
        setChatSession(savedSession);
      } catch (error) {
        showToast("error", `Unable to save chat history: ${errorMessage(error)}`);
      }
    },
    [showToast],
  );

  const activeChatSessionId = chatSession?.id;
  const handleChatMessagesUpdated = useCallback(
    (messages: UIMessage[]) => {
      if (activeChatSessionId) {
        updateChatMessages(activeChatSessionId, messages);
      }
    },
    [activeChatSessionId, updateChatMessages],
  );

  const startNewChat = useCallback(() => {
    try {
      const session = createNewSession();
      activeChatSessionRef.current = session;
      setChatSessions(getAllSessions());
      setChatSession(session);
      setActiveTab("assistant");
    } catch (error) {
      showToast("error", `Unable to create a new chat: ${errorMessage(error)}`);
    }
  }, [showToast]);

  const selectChatSession = useCallback(
    (id: string) => {
      try {
        const session = getSession(id);
        if (!session) {
          setChatSessions(getAllSessions());
          showToast("error", "That saved conversation is no longer available.");
          return;
        }

        activeChatSessionRef.current = session;
        setChatSessions(getAllSessions());
        setChatSession(session);
        setActiveTab("assistant");
      } catch (error) {
        showToast("error", `Unable to load that conversation: ${errorMessage(error)}`);
      }
    },
    [showToast],
  );

  const removeChatSession = useCallback(
    (id: string) => {
      try {
        const session = getSession(id);
        if (!session) {
          setChatSessions(getAllSessions());
          return;
        }

        if (
          !window.confirm(
            `Delete "${session.title || "New Chat"}"? This cannot be undone.`,
          )
        ) {
          return;
        }

        deleteSession(id);
        let sessions = getAllSessions();

        if (activeChatSessionRef.current?.id === id) {
          const nextSession = sessions[0] ?? createNewSession();
          activeChatSessionRef.current = nextSession;
          setChatSession(nextSession);
          sessions = getAllSessions();
        }

        setChatSessions(sessions);
      } catch (error) {
        showToast("error", `Unable to delete that conversation: ${errorMessage(error)}`);
      }
    },
    [showToast],
  );

  const resetAuthorization = useCallback(
    (showError = false) => {
      clearSavedPassword();
      dismissToast();
      activeChatSessionRef.current = null;
      setChatSessions([]);
      setChatSession(null);
      setPasswordInput("");
      setAssistantMessageCount(0);
      setLockError(
        showError
          ? "That password was not accepted. Please enter the correct admin password."
          : "",
      );
    },
    [dismissToast],
  );

  const requestJson = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const password = window.localStorage.getItem(PASSWORD_STORAGE_KEY);
      if (!password) {
        resetAuthorization(true);
        throw new Error("Admin session is locked.");
      }

      const headers = new Headers(init?.headers);
      headers.set("x-admin-password", password);
      const response = await fetch(path, {
        ...init,
        headers,
        cache: "no-store",
      });

      if (response.status === 401) {
        resetAuthorization(true);
        throw new Error("Admin password was rejected.");
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new Error(`The Shopify API returned invalid JSON (${response.status}).`);
      }

      if (!response.ok) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : `Shopify request failed with HTTP ${response.status}.`;
        throw new Error(message);
      }

      return body as T;
    },
    [resetAuthorization],
  );

  const refreshProducts = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const result = await requestJson<ShopifyProduct[]>(
        "/api/shopify?action=products",
      );
      setProducts(result);
      return result;
    } finally {
      setCatalogLoading(false);
    }
  }, [requestJson]);

  const refreshOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const result = await requestJson<ShopifyStoreOverview>(
        "/api/shopify?action=overview",
      );
      setOverview(result);
      return result;
    } finally {
      setOverviewLoading(false);
    }
  }, [requestJson]);

  const refreshOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const result = await requestJson<ShopifyOrder[]>(
        "/api/shopify?action=orders",
      );
      setOrders(result);
      return result;
    } finally {
      setOrdersLoading(false);
    }
  }, [requestJson]);

  const refreshShopifyConnection = useCallback(async () => {
    setShopifyConnectionStatus("checking");
    try {
      const shop = await requestJson<{
        name: string;
        myshopifyDomain: string;
      }>("/api/shopify?action=health");
      setShopDomain(shop.myshopifyDomain);
      setShopifyConnectionStatus("connected");
    } catch (error) {
      setShopifyConnectionStatus("disconnected");
      throw error;
    }
  }, [requestJson]);

  const refreshAllData = useCallback(async () => {
    setRefreshing(true);
    const results = await Promise.allSettled([
      refreshShopifyConnection(),
      refreshProducts(),
      refreshOverview(),
      refreshOrders(),
    ]);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) {
      showToast("error", errorMessage(failure.reason));
    }
    setRefreshing(false);
  }, [
    refreshOrders,
    refreshOverview,
    refreshProducts,
    refreshShopifyConnection,
    showToast,
  ]);

  const consumePrefillPrompt = useCallback(() => {
    setPrefillPrompt("");
  }, []);

  const recordUserMessage = useCallback(() => {
    setAssistantMessageCount((count) => count + 1);
  }, []);

  const handleChatMutation = useCallback(
    ({ label, failed }: { label: string; failed: boolean }) => {
      showToast(failed ? "error" : "success", label);
    },
    [showToast],
  );

  useEffect(() => {
    if (!isUnlocked) return;
    const timer = window.setTimeout(() => {
      void refreshAllData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isUnlocked, refreshAllData]);

  const unlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordInput.trim()) return;
    savePassword(passwordInput);
    setLockError("");
    setPasswordInput("");
    dismissToast();
  };

  const lock = () => {
    resetAuthorization();
    setAssistantMessageCount(0);
  };

  const runRefresh = async (
    loader: () => Promise<unknown>,
    successMessage?: string,
  ) => {
    try {
      await loader();
      if (successMessage) showToast("success", successMessage);
    } catch (error) {
      showToast("error", errorMessage(error));
    }
  };

  const toggleProductStatus = async (product: ShopifyProduct) => {
    setPendingAction(product.id);
    try {
      const result = await requestJson<{ product: ShopifyProduct }>(
        "/api/shopify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "toggleStatus", id: product.id }),
        },
      );
      setProducts((current) =>
        current.map((item) =>
          item.id === product.id ? result.product : item,
        ),
      );
      showToast(
        "success",
        `${result.product.title} set to ${statusLabel(result.product.status)}.`,
      );
      await refreshAllData();
    } catch (error) {
      showToast("error", errorMessage(error));
    } finally {
      setPendingAction(null);
    }
  };

  const removeProduct = async (product: ShopifyProduct) => {
    setPendingAction(product.id);
    try {
      await requestJson<{ deletedProductId: string }>("/api/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteProduct", id: product.id }),
      });
      setProducts((current) => current.filter((item) => item.id !== product.id));
      showToast("success", `${product.title} deleted.`);
      await refreshAllData();
    } catch (error) {
      showToast("error", errorMessage(error));
    } finally {
      setPendingAction(null);
    }
  };

  const saveInventory = async (
    product: ShopifyProduct,
    variant: ShopifyProduct["variants"]["nodes"][number],
    quantityValue: string,
  ) => {
    const quantity = Number(quantityValue);
    if (!Number.isInteger(quantity) || quantity < 0) {
      showToast("error", "Inventory quantity must be a whole number of zero or more.");
      return;
    }

    setPendingAction(variant.id);
    try {
      const result = await requestJson<{ quantityChange: number }>(
        "/api/shopify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "updateInventory",
            inventoryItemId: variant.inventoryItem.id,
            quantity,
          }),
        },
      );
      setProducts((current) =>
        current.map((item) =>
          item.id === product.id
            ? {
                ...item,
                totalInventory: item.totalInventory + result.quantityChange,
                variants: {
                  ...item.variants,
                  nodes: item.variants.nodes.map((itemVariant) =>
                    itemVariant.id === variant.id
                      ? {
                          ...itemVariant,
                          inventoryQuantity:
                            itemVariant.inventoryQuantity +
                            result.quantityChange,
                        }
                      : itemVariant,
                  ),
                },
              }
            : item,
        ),
      );
      setQuantityDrafts((current) => {
        const updated = { ...current };
        delete updated[variant.id];
        return updated;
      });
      showToast(
        "success",
        `${product.title} · ${variant.title} stock set to ${quantity}.`,
      );
      try {
        await refreshOverview();
      } catch (error) {
        showToast(
          "error",
          `Stock was saved, but the store overview could not refresh: ${errorMessage(error)}`,
        );
      }
    } catch (error) {
      showToast("error", errorMessage(error));
    } finally {
      setPendingAction(null);
    }
  };

  const startEditWithAI = (product: ShopifyProduct) => {
    setPrefillPrompt(`Edit product ${product.title}: `);
    setActiveTab("assistant");
  };

  const productVariantCount = products.reduce(
    (total, product) => total + product.variants.nodes.length,
    0,
  );
  const navCounts: Record<DashboardTab, string> = {
    assistant: String(assistantMessageCount),
    products: formatNumber(overview?.productCount ?? products.length),
    inventory: formatNumber(productVariantCount),
    orders: formatNumber(orders.length),
  };
  if (!isUnlocked) {
    return (
      <PasswordLockScreen
        password={passwordInput}
        setPassword={setPasswordInput}
        onUnlock={unlock}
        error={lockError}
      />
    );
  }

  return (
    <>
      <AppShell
        activeTab={activeTab}
        counts={navCounts}
        connectionStatus={shopifyConnectionStatus}
        storeDomain={shopDomain}
        sessions={chatSessions}
        activeSessionId={chatSession?.id ?? null}
        onNavigate={setActiveTab}
        onNewChat={startNewChat}
        onSelectSession={selectChatSession}
        onDeleteSession={removeChatSession}
        onLock={lock}
      >
        {chatSession ? (
          <ChatView
            key={chatSession.id}
            isActive={activeTab === "assistant"}
            sessionId={chatSession.id}
            initialMessages={chatSession.messages}
            onMessagesUpdated={handleChatMessagesUpdated}
            prefillPrompt={prefillPrompt}
            onPrefillConsumed={consumePrefillPrompt}
            onError={(message) => showToast("error", message)}
            onMutation={handleChatMutation}
            onRefreshStoreData={refreshAllData}
            onUnauthorized={resetAuthorization}
            onUserMessageSent={recordUserMessage}
          />
        ) : activeTab === "assistant" ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-slate-500">
            Loading saved conversation...
          </div>
        ) : null}
        {activeTab !== "assistant" ? (
          <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-7 sm:py-7 lg:px-9">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.18 }}
              >
                {activeTab === "products" ? (
                  <CatalogView
                    products={products}
                    loading={catalogLoading}
                    pendingAction={pendingAction}
                    onRefresh={() =>
                      void runRefresh(refreshProducts, "Catalog refreshed.")
                    }
                    onToggleStatus={(product) =>
                      void toggleProductStatus(product)
                    }
                    onEdit={startEditWithAI}
                    onDelete={(product) => void removeProduct(product)}
                  />
                ) : activeTab === "inventory" ? (
                  <InventoryView
                    products={products}
                    loading={catalogLoading}
                    pendingAction={pendingAction}
                    quantityDrafts={quantityDrafts}
                    onRefresh={() =>
                      void runRefresh(refreshProducts, "Inventory refreshed.")
                    }
                    onQuantityChange={(variantId, value) =>
                      setQuantityDrafts((current) => ({
                        ...current,
                        [variantId]: value,
                      }))
                    }
                    onStep={(_product, variant, amount) =>
                      setQuantityDrafts((currentDrafts) => {
                        const value = Number(
                          currentDrafts[variant.id] ??
                            variant.inventoryQuantity,
                        );
                        const base = Number.isInteger(value)
                          ? value
                          : variant.inventoryQuantity;
                        return {
                          ...currentDrafts,
                          [variant.id]: String(Math.max(0, base + amount)),
                        };
                      })
                    }
                    onSave={(product, variant, quantity) =>
                      void saveInventory(product, variant, quantity)
                    }
                  />
                ) : activeTab === "orders" ? (
                  <OrdersView
                    overview={overview}
                    orders={orders}
                    overviewLoading={overviewLoading}
                    ordersLoading={ordersLoading}
                    refreshing={refreshing}
                    onRefresh={() =>
                      void runRefresh(
                        async () => {
                          await Promise.all([
                            refreshOverview(),
                            refreshOrders(),
                          ]);
                        },
                        "Store insights refreshed.",
                      )
                    }
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        ) : null}
      </AppShell>
      <ToastViewport toast={toast} onDismiss={dismissToast} />
    </>
  );
}
