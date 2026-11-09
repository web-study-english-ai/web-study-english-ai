"use client";

import { useState } from "react";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

interface Props {
  src: string | null | undefined;
  alt: string;
  className?: string;
}

export function CardImage({ src, alt, className }: Props) {
  const url = resolveMediaUrl(src);
  const [failed, setFailed] = useState<string | null>(null);

  if (!url || failed === url) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(url)}
      className={cn("mx-auto max-h-40 rounded-xl object-cover", className)}
    />
  );
}