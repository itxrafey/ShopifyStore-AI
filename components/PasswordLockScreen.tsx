"use client";

import {
  ArrowRight,
  CircleAlert,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import type { FormEvent } from "react";

type PasswordLockScreenProps = {
  password: string;
  setPassword: (password: string) => void;
  onUnlock: (event: FormEvent<HTMLFormElement>) => void;
  error: string;
};

export default function PasswordLockScreen({
  password,
  setPassword,
  onUnlock,
  error,
}: PasswordLockScreenProps) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#101b15] px-5 py-10 text-white">
      <div className="pointer-events-none absolute -left-40 -top-36 size-[520px] rounded-full bg-[#1e5636]/30 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-32 size-[520px] rounded-full bg-[#97bd61]/10 blur-[120px]" />
      <div className="relative w-full max-w-[440px]">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-[#a5ce71] text-[#173223] shadow-lg shadow-[#a5ce71]/20">
            <ShoppingBag size={21} strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-sm font-bold tracking-[0.14em]">MERCHANT</p>
            <p className="text-[10px] font-semibold tracking-[0.24em] text-[#a2b3a5]">
              INTELLIGENCE
            </p>
          </div>
        </div>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.06] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-9">
          <div className="mb-7 flex size-12 items-center justify-center rounded-2xl border border-[#a5ce71]/20 bg-[#a5ce71]/10 text-[#b5dc80]">
            <LockKeyhole size={21} />
          </div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a5ce71]">
            Secure admin access
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your store, protected.
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#a6b5aa]">
            Enter your admin password to open the Shopify Inventory AI Control
            Center.
          </p>
          <form onSubmit={onUnlock} className="mt-7 space-y-4">
            <label
              htmlFor="admin-password"
              className="block text-xs font-medium text-[#d3ddd5]"
            >
              Admin password
            </label>
            <div className="flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-[#0c1510]/70 px-4 transition focus-within:border-[#a5ce71]/60 focus-within:ring-4 focus-within:ring-[#a5ce71]/10">
              <KeyRound size={16} className="shrink-0 text-[#819487]" />
              <input
                autoComplete="current-password"
                autoFocus
                id="admin-password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#67786c]"
              />
            </div>
            {error ? (
              <p className="flex items-center gap-2 text-xs text-[#ffb2a7]">
                <CircleAlert size={14} />
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={!password.trim()}
              className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#a5ce71] text-sm font-semibold text-[#17261b] transition hover:bg-[#b4dc80] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Unlock control center
              <ArrowRight
                size={16}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </button>
          </form>
          <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-[#819187]">
            <ShieldCheck size={14} />
            Password is stored only in this browser
          </div>
        </section>
        <p className="mt-6 text-center text-[11px] text-[#728378]">
          PRIVATE STORE WORKSPACE · AUTHENTICATED ACCESS ONLY
        </p>
      </div>
    </main>
  );
}
