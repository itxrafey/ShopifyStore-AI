"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Boxes,
  Check,
  Image as ImageIcon,
  Layers,
  LoaderCircle,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  Truck,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type {
  ShopifyOrder,
  ShopifyProduct,
  ShopifyStoreOverview,
} from "@/lib/shopify-admin";

type ProductStatusFilter = "ALL" | "ACTIVE" | "DRAFT";
type ProductVariant = ShopifyProduct["variants"]["nodes"][number];

type CatalogViewProps = {
  products: ShopifyProduct[];
  loading: boolean;
  pendingAction: string | null;
  onRefresh: () => void;
  onToggleStatus: (product: ShopifyProduct) => void;
  onEdit: (product: ShopifyProduct) => void;
  onDelete: (product: ShopifyProduct) => void;
};

type InventoryViewProps = {
  products: ShopifyProduct[];
  loading: boolean;
  pendingAction: string | null;
  quantityDrafts: Record<string, string>;
  onRefresh: () => void;
  onQuantityChange: (variantId: string, value: string) => void;
  onStep: (
    product: ShopifyProduct,
    variant: ProductVariant,
    amount: number,
  ) => void;
  onSave: (
    product: ShopifyProduct,
    variant: ProductVariant,
    quantity: string,
  ) => void;
};

type OrdersViewProps = {
  overview: ShopifyStoreOverview | null;
  orders: ShopifyOrder[];
  overviewLoading: boolean;
  ordersLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatOrderTotal(order: ShopifyOrder) {
  const { amount, currencyCode } = order.totalPriceSet.shopMoney;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
    }).format(Number(amount));
  } catch {
    return `${currencyCode} ${amount}`;
  }
}

function formatOrderDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function statusLabel(status: string | null | undefined) {
  if (!status) return "Unknown";
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function stockStyle(quantity: number) {
  if (quantity <= 0) {
    return {
      label: "Out of Stock",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  if (quantity <= 10) {
    return {
      label: "Low Stock",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  return {
    label: "In Stock",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Package;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
        <Icon size={21} />
      </span>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex gap-4">
        <div className="size-20 shrink-0 rounded-xl bg-slate-100" />
        <div className="min-w-0 flex-1 space-y-3 pt-1">
          <div className="h-4 w-3/4 rounded bg-slate-100" />
          <div className="h-3 w-1/2 rounded bg-slate-100" />
          <div className="flex gap-2">
            <div className="h-6 w-16 rounded-full bg-slate-100" />
            <div className="h-6 w-24 rounded-full bg-slate-100" />
          </div>
        </div>
      </div>
      <div className="mt-5 h-9 rounded-lg bg-slate-100" />
    </div>
  );
}

function InventoryRowSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 sm:flex sm:items-center sm:gap-6">
      <div className="space-y-2 sm:min-w-0 sm:flex-1">
        <div className="h-4 w-2/3 rounded bg-slate-100" />
        <div className="h-3 w-1/3 rounded bg-slate-100" />
      </div>
      <div className="mt-4 h-10 rounded-lg bg-slate-100 sm:mt-0 sm:w-64" />
    </div>
  );
}

function OrdersSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-28 rounded-2xl border border-slate-200 bg-white"
          />
        ))}
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-24 rounded-2xl border border-slate-200 bg-white"
        />
      ))}
    </div>
  );
}

function ProductCard({
  product,
  index,
  pending,
  onToggle,
  onEdit,
  onDelete,
}: {
  product: ShopifyProduct;
  index: number;
  pending: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const firstVariant = product.variants.nodes[0];
  const isActive = product.status === "ACTIVE";
  const stock = stockStyle(product.totalInventory);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.025, 0.2) }}
      className="flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md sm:p-5"
    >
      <div className="flex min-w-0 gap-4">
        <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50 text-slate-400">
          {product.featuredImage?.url ? (
            <Image
              src={product.featuredImage.url}
              alt={product.featuredImage.altText || product.title}
              fill
              sizes="80px"
              unoptimized
              className="object-cover"
            />
          ) : (
            <ImageIcon size={25} strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="line-clamp-2 text-sm font-semibold text-slate-800">
                {product.title}
              </h3>
              <p className="mt-1 truncate text-xs text-slate-500">
                {product.vendor || "Independent brand"}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                isActive
                  ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {statusLabel(product.status)}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              <Tag size={12} className="text-emerald-700" />
              {firstVariant?.price ?? "No price"}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${stock.className}`}
            >
              {formatNumber(product.totalInventory)} {stock.label}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          aria-label={`Set ${product.title} ${isActive ? "draft" : "active"}`}
          disabled={pending}
          onClick={onToggle}
          className="inline-flex min-h-10 items-center gap-2 text-xs font-medium text-slate-600 disabled:opacity-50"
        >
          <span
            className={`relative h-[21px] w-9 rounded-full transition-colors ${
              isActive ? "bg-emerald-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-[3px] size-[15px] rounded-full bg-white shadow-sm transition-transform ${
                isActive ? "translate-x-[18px]" : "translate-x-[3px]"
              }`}
            />
          </span>
          {isActive ? "Active" : "Draft"}
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-50"
          >
            <Sparkles size={14} />
            Edit with AI
          </button>
          {confirmingDelete ? (
            <div className="flex min-h-10 items-center gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  onDelete();
                  setConfirmingDelete(false);
                }}
                className="rounded-lg px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                Confirm?
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmingDelete(false)}
                className="rounded-lg px-2 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
            >
              {pending ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              Delete
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}

export function CatalogView({
  products,
  loading,
  pendingAction,
  onRefresh,
  onToggleStatus,
  onEdit,
  onDelete,
}: CatalogViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>("ALL");
  const filteredProducts = products.filter((product) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      product.title.toLowerCase().includes(query) ||
      product.vendor.toLowerCase().includes(query) ||
      product.productType.toLowerCase().includes(query);
    const matchesStatus =
      statusFilter === "ALL" || product.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const filters: Array<{ label: string; value: ProductStatusFilter }> = [
    { label: "All", value: "ALL" },
    { label: "Active", value: "ACTIVE" },
    { label: "Draft", value: "DRAFT" },
  ];

  return (
    <section>
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-600">
              Browse and manage products in your Shopify store.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Showing {filteredProducts.length} of {products.length} loaded
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-md">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products or vendors..."
              aria-label="Search products"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
            />
          </label>
          <div
            aria-label="Filter products by status"
            className="flex w-fit items-center gap-1 rounded-xl border border-slate-200 bg-white p-1"
          >
            {filters.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                aria-pressed={statusFilter === value}
                onClick={() => setStatusFilter(value)}
                className={`min-h-9 rounded-lg px-3 text-xs font-medium transition ${
                  statusFilter === value
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && products.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      ) : filteredProducts.length ? (
        <motion.div
          layout
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          <AnimatePresence mode="popLayout">
            {filteredProducts.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                index={index}
                pending={pendingAction === product.id}
                onToggle={() => onToggleStatus(product)}
                onEdit={() => onEdit(product)}
                onDelete={() => onDelete(product)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <EmptyState
          icon={Boxes}
          title={
            search || statusFilter !== "ALL"
              ? "No matching products"
              : "Your catalog is empty"
          }
          description={
            search || statusFilter !== "ALL"
              ? "Try another search or status filter."
              : "Products from Shopify will appear here after the first refresh."
          }
        />
      )}
    </section>
  );
}

function InventoryRow({
  product,
  variant,
  quantity,
  saving,
  onQuantityChange,
  onStep,
  onSave,
}: {
  product: ShopifyProduct;
  variant: ProductVariant;
  quantity: string;
  saving: boolean;
  onQuantityChange: (value: string) => void;
  onStep: (amount: number) => void;
  onSave: () => void;
}) {
  const value = Number(quantity);
  const validQuantity = Number.isInteger(value) && value >= 0;
  const changed = validQuantity && value !== variant.inventoryQuantity;
  const stock = stockStyle(variant.inventoryQuantity);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:flex sm:items-center sm:gap-5 sm:px-5"
    >
      <div className="min-w-0 sm:flex-1">
        <div className="flex min-w-0 items-start justify-between gap-3 sm:items-center">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-800">
              {product.title}
            </h3>
            <p className="mt-1 truncate text-xs text-slate-500">
              {variant.title}
              {variant.sku ? ` · ${variant.sku}` : ""}
              {product.vendor ? ` · ${product.vendor}` : ""}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${stock.className}`}
          >
            {stock.label} · {formatNumber(variant.inventoryQuantity)}
          </span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-0 sm:shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Decrease ${variant.title} quantity`}
            onClick={() => onStep(-1)}
            disabled={saving}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          >
            <Minus size={15} />
          </button>
          <input
            aria-label={`${product.title} ${variant.title} quantity`}
            type="number"
            min="0"
            step="1"
            value={quantity}
            onChange={(event) => onQuantityChange(event.target.value)}
            className="h-10 w-[76px] rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-semibold text-slate-800 outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
          />
          <button
            type="button"
            aria-label={`Increase ${variant.title} quantity`}
            onClick={() => onStep(1)}
            disabled={saving}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          >
            <Plus size={15} />
          </button>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !changed}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:flex-none"
        >
          {saving ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          Save
        </button>
      </div>
    </motion.article>
  );
}

export function InventoryView({
  products,
  loading,
  pendingAction,
  quantityDrafts,
  onRefresh,
  onQuantityChange,
  onStep,
  onSave,
}: InventoryViewProps) {
  const [search, setSearch] = useState("");
  const rows = products.flatMap((product) =>
    product.variants.nodes.map((variant) => ({ product, variant })),
  );
  const query = search.trim().toLowerCase();
  const filteredRows = rows.filter(({ product, variant }) => {
    return (
      !query ||
      product.title.toLowerCase().includes(query) ||
      variant.title.toLowerCase().includes(query) ||
      (variant.sku ?? "").toLowerCase().includes(query)
    );
  });

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600">
            Review variant-level stock and save quantity adjustments directly to
            Shopify.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {formatNumber(rows.length)} variants loaded
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh stock
        </button>
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-md">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product, variant, or SKU..."
            aria-label="Search inventory"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
          />
        </label>
        <div className="flex flex-wrap gap-2 text-[10px] font-medium">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">
            In Stock &gt; 10
          </span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
            Low Stock 1–10
          </span>
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">
            Out of Stock 0
          </span>
        </div>
      </div>

      {loading && products.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <InventoryRowSkeleton key={index} />
          ))}
        </div>
      ) : filteredRows.length ? (
        <div className="space-y-3">
          {filteredRows.map(({ product, variant }) => (
            <InventoryRow
              key={variant.id}
              product={product}
              variant={variant}
              quantity={
                quantityDrafts[variant.id] ??
                String(variant.inventoryQuantity)
              }
              saving={pendingAction === variant.id}
              onQuantityChange={(value) => onQuantityChange(variant.id, value)}
              onStep={(amount) => onStep(product, variant, amount)}
              onSave={() =>
                onSave(
                  product,
                  variant,
                  quantityDrafts[variant.id] ??
                    String(variant.inventoryQuantity),
                )
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Layers}
          title={query ? "No matching inventory" : "No variants found"}
          description={
            query
              ? "Try a different product, variant, or SKU."
              : "Product variants will appear here after Shopify data loads."
          }
        />
      )}
    </section>
  );
}

function OrderStatus({ value }: { value: string | null }) {
  const label = statusLabel(value);
  const tone =
    value?.toLowerCase() === "paid" || value?.toLowerCase() === "fulfilled"
      ? "bg-emerald-50 text-emerald-800"
      : value?.toLowerCase() === "refunded" ||
          value?.toLowerCase() === "cancelled"
        ? "bg-rose-50 text-rose-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  index,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Package;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium leading-4 text-slate-500 sm:text-xs">
            {label}
          </p>
          <p className="mt-2 truncate text-xl font-semibold tracking-tight text-slate-800 sm:text-2xl">
            {value}
          </p>
          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">
            {detail}
          </p>
        </div>
        <span className="hidden size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 sm:flex">
          <Icon size={16} />
        </span>
      </div>
    </motion.div>
  );
}

function OrderCard({ order }: { order: ShopifyOrder }) {
  const itemSummary =
    order.lineItems.edges
      .slice(0, 2)
      .map(({ node }) => `${node.title} × ${node.quantity}`)
      .join(", ") || "No line item details";

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{order.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatOrderDate(order.createdAt)}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-slate-800">
          {formatOrderTotal(order)}
        </p>
      </div>
      <p className="mt-3 break-words text-xs leading-5 text-slate-600">
        {itemSummary}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <OrderStatus value={order.displayFinancialStatus} />
        <OrderStatus value={order.displayFulfillmentStatus} />
      </div>
    </article>
  );
}

export function OrdersView({
  overview,
  orders,
  overviewLoading,
  ordersLoading,
  refreshing,
  onRefresh,
}: OrdersViewProps) {
  const isInitialLoading =
    (overviewLoading && !overview) || (ordersLoading && !orders.length);

  if (isInitialLoading) {
    return (
      <section>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="h-4 w-56 animate-pulse rounded bg-slate-200" />
          <div className="h-10 w-28 animate-pulse rounded-xl bg-slate-200" />
        </div>
        <OrdersSkeleton />
      </section>
    );
  }

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600">
            Store health, stock signals, and your latest Shopify orders.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Updated from Shopify Admin
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing || overviewLoading || ordersLoading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={
              refreshing || overviewLoading || ordersLoading
                ? "animate-spin"
                : ""
            }
          />
          Refresh insights
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <MetricCard
          label="Total Products"
          value={overview ? formatNumber(overview.productCount) : "—"}
          detail="In your Shopify catalog"
          icon={Boxes}
          index={0}
        />
        <MetricCard
          label="Total Units in Stock"
          value={
            overview ? formatNumber(overview.totalUnitsInStock) : "—"
          }
          detail="Across tracked inventory"
          icon={Package}
          index={1}
        />
        <MetricCard
          label="Low Stock Alerts"
          value={
            overview
              ? formatNumber(overview.lowStockVariants.length)
              : "—"
          }
          detail="Variants at 10 units or less"
          icon={TrendingUp}
          index={2}
        />
        <MetricCard
          label="Recent Orders"
          value={formatNumber(orders.length)}
          detail="Latest Shopify orders loaded"
          icon={Truck}
          index={3}
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Recent orders
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Sales, payment, and fulfillment at a glance
            </p>
          </div>
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Truck size={16} />
          </span>
        </div>
        {orders.length ? (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="hidden w-full min-w-[760px] border-collapse text-left md:table">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Order",
                      "Date",
                      "Payment",
                      "Fulfillment",
                      "Total",
                    ].map((column) => (
                      <th
                        key={column}
                        className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, index) => (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.02, 0.2) }}
                      className="border-t border-slate-100 text-xs"
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-800">
                          {order.name}
                        </p>
                        <p className="mt-1 max-w-[220px] truncate text-[10px] text-slate-500">
                          {order.lineItems.edges
                            .slice(0, 2)
                            .map(({ node }) => `${node.title} × ${node.quantity}`)
                            .join(", ") || "No line item details"}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {formatOrderDate(order.createdAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <OrderStatus value={order.displayFinancialStatus} />
                      </td>
                      <td className="px-4 py-3.5">
                        <OrderStatus value={order.displayFulfillmentStatus} />
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-800">
                        {formatOrderTotal(order)}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-3 sm:p-5">
            <EmptyState
              title="No recent orders"
              description="New Shopify orders will appear here."
              icon={Truck}
            />
          </div>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Low stock watch
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Variants with 10 or fewer units
            </p>
          </div>
          <span className="flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <TrendingUp size={16} />
          </span>
        </div>
        {overview?.lowStockVariants.length ? (
          <ul className="mt-4 divide-y divide-slate-100">
            {overview.lowStockVariants.slice(0, 8).map((variant) => (
              <li
                key={variant.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-700">
                    {variant.product.title}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-slate-500">
                    {variant.title}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800">
                  {variant.inventoryQuantity} left
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-5 text-center text-xs text-emerald-800">
            {overview ? "All tracked variants are healthy." : "Stock data is not loaded yet."}
          </p>
        )}
      </section>
    </section>
  );
}
