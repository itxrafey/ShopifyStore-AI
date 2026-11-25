import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f4f7f2] px-5 py-12 text-[#24352a]">
      <section className="w-full max-w-lg rounded-[28px] border border-[#e4ebe1] bg-white p-7 text-center shadow-[0_24px_70px_rgba(27,52,36,0.08)] sm:p-10">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#eaf2e8] text-[#527c57]">
          <ShoppingBag size={21} />
        </div>
        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-[#78916f]">
          Merchant Intelligence
        </p>
        <p className="mt-4 text-6xl font-semibold tracking-[-0.06em] text-[#24352a]">
          404
        </p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">
          This page isn’t in your inventory.
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#78857b]">
          The link may be outdated, or the page may have moved. Head back to
          your control center and continue managing your store.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#24432f] px-5 text-sm font-medium text-white transition hover:bg-[#315b3e]"
        >
          <ArrowLeft size={15} />
          Back to control center
        </Link>
      </section>
    </main>
  );
}
