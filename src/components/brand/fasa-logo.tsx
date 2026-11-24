import Image from "next/image";

import { cn } from "@/lib/utils/cn";

type FasaLogoProps = {
  className?: string;
  priority?: boolean;
};

export function FasaLogo({ className, priority = false }: FasaLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-slate-200",
        className,
      )}
    >
      <Image
        src="/brand/fasa.png"
        alt="Fasa Informática"
        width={1024}
        height={1024}
        priority={priority}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
