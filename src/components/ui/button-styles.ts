import { cn } from "@/lib/utils/cn";

export function buttonClass(variant: "primary" | "secondary" | "danger" | "ghost" = "primary", className?: string) {
  return cn(
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold outline-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60",
    variant === "primary" && "bg-[#1856d6] text-white hover:bg-[#1746a4]",
    variant === "secondary" && "border border-slate-300 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-800",
    variant === "danger" && "bg-red-700 text-white hover:bg-red-800",
    variant === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
    className,
  );
}

export const inputClass =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500";

export const selectClass = cn(inputClass, "fasa-select");

export const textAreaClass =
  "min-h-28 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 text-slate-950 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500";
