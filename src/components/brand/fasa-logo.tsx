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
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm shadow-blue-950/5 ring-1 ring-blue-100",
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
