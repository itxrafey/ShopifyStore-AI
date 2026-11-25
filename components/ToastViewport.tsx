"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, CircleCheck, X } from "lucide-react";

export type ToastNotification = {
  id: string;
  kind: "success" | "error";
  message: string;
};

export default function ToastViewport({
  toast,
  onDismiss,
}: {
  toast: ToastNotification | null;
  onDismiss: () => void;
}) {
  const isError = toast?.kind === "error";
  const Icon = isError ? CircleAlert : CircleCheck;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4 sm:inset-x-auto sm:right-5 sm:justify-end sm:px-0">
      <AnimatePresence mode="wait">
        {toast ? (
          <motion.div
            key={toast.id}
            role={isError ? "alert" : "status"}
            aria-live={isError ? "assertive" : "polite"}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-white p-3.5 shadow-lg shadow-slate-900/10 ${
              isError ? "border-rose-200" : "border-emerald-200"
            }`}
          >
            <span
              className={`mt-0.5 shrink-0 ${
                isError ? "text-rose-600" : "text-emerald-700"
              }`}
            >
              <Icon size={18} />
            </span>
            <p className="min-w-0 flex-1 break-words text-sm leading-5 text-slate-700">
              {toast.message}
            </p>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss notification"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={15} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
