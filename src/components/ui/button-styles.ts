import { cn } from "@/lib/utils/cn";

export function buttonClass(variant: "primary" | "secondary" | "danger" | "ghost" = "primary", className?: string) {
  return cn(
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold outline-none transition duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:translate-y-0 disabled:scale-100 disabled:opacity-60",
    variant === "primary" && "bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 hover:shadow-blue-600/25",
    variant === "secondary" && "border border-blue-100/90 bg-white/88 text-slate-700 shadow-sm shadow-blue-950/5 hover:border-blue-200 hover:bg-blue-50/80 hover:text-blue-700",
    variant === "danger" && "bg-red-600 text-white shadow-lg shadow-red-600/20 hover:bg-red-700 hover:shadow-red-600/25",
    variant === "ghost" && "text-slate-600 hover:bg-white/75 hover:text-slate-950",
    className,
  );
}

export const inputClass =
  "h-11 rounded-2xl border border-blue-100/90 bg-white/90 px-3.5 text-sm text-slate-950 shadow-sm shadow-blue-950/5 outline-none transition duration-200 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500";

export const selectClass = cn(inputClass, "fasa-select");

export const textAreaClass =
  "min-h-28 resize-y rounded-2xl border border-blue-100/90 bg-white/90 px-3.5 py-3 text-sm leading-6 text-slate-950 shadow-sm shadow-blue-950/5 outline-none transition duration-200 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500";
