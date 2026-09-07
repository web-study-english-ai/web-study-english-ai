"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const images = [
  { src: "/images/bg1.png", alt: "Học sinh học tiếng Anh cùng laptop" },
  { src: "/images/bg2.png", alt: "Học sinh làm bài tập từ vựng" },
  { src: "/images/bg3.jpg", alt: "Học sinh luyện nghe nói" },
  { src: "/images/bg42.jpg", alt: "Học sinh ôn tập cùng flashcard" },
];

const INTERVAL_MS = 2000;

export default function HeroCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  const current = images[activeIndex];

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl">
      <Image
        src={current.src}
        alt={current.alt}
        fill
        priority
        className="object-cover"
      />

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        {images.map((image, index) => (
          <span
            key={image.src}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              index === activeIndex
                ? "w-6 bg-white"
                : "w-1.5 bg-white/60"
            }`}
          />
        ))}
      </div>
    </div>
  );
}