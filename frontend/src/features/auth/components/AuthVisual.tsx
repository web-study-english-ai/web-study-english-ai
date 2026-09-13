import Image from "next/image";
import { GraduationCap } from "lucide-react";

interface AuthVisualProps {
  title: string;
  subtitle: string;
  accent: "teal" | "rose";
  imageSrc: string;
  variant?: "full" | "card"; // full = sát viền (login), card = có khung trắng đệm (register)
}

export function AuthVisual({
  title,
  subtitle,
  accent,
  imageSrc,
  variant = "full",
}: AuthVisualProps) {
  const panelBg = accent === "rose" ? "bg-rose-700" : "bg-teal-700";
  const blobBg = accent === "rose" ? "bg-rose-600/40" : "bg-teal-600/40";

  return (
    <div
      className={`relative hidden w-full max-w-[480px] flex-col justify-between overflow-hidden ${panelBg} px-10 py-10 lg:flex`}
    >
      <div className={`pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full ${blobBg}`} />
      <div className={`pointer-events-none absolute -bottom-24 -right-10 h-72 w-72 rounded-full ${blobBg}`} />

      <div className="relative z-10 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90">
          <GraduationCap className="h-5 w-5 text-teal-700" />
        </span>
        <span className="font-heading text-base font-semibold text-white">Study English</span>
      </div>

      {variant === "full" ? (
        //login
        <div
          className="relative z-10 my-8 w-full overflow-hidden rounded-2xl shadow-xl"
          style={{ aspectRatio: "4 / 3" }}
        >
          <Image
            src={imageSrc}
            alt="Study English illustration"
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 480px"
            priority
          />
        </div>
      ) : (
        //register
        <div className="relative z-10 my-8 w-full overflow-hidden rounded-2xl shadow-xl">
          <div
            className="relative w-full overflow-hidden rounded-xl"
            style={{ aspectRatio: "4 / 3" }}
          >
            <Image
              src={imageSrc}
              alt="Study English illustration"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 480px"
              priority
            />
          </div>
        </div>
      )}

      <div className="relative z-10">
  <h2 className="font-heading text-2xl font-bold leading-snug text-white">{title}</h2>
  <p className={`mt-2 text-sm leading-relaxed ${accent === "rose" ? "text-rose-50/90" : "text-teal-50/90"}`}>
    {subtitle}
  </p>
</div>
    </div>
  );
}