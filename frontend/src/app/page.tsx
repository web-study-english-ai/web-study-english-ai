import Image from "next/image";
import Link from "next/link";
import HeroCarousel from "@/components/shared/Bg-home";
import {
  FolderKanban,
  Sun,
  CalendarClock,
  Gamepad2,
  ScanLine,
  MessageCircleHeart,
} from "lucide-react";

const stats = [
  { value: "10,000+", label: "Học viên tin dùng" },
  { value: "500+", label: "Bài học mẫu phong phú" },
  { value: "95%", label: "Học viên tiến bộ nhanh" },
  { value: "50+", label: "Chủ đề thực tế" },
];

const features = [
  {
    icon: FolderKanban,
    title: "Quản lý từ vựng thông minh",
    description:
      "Lưu trữ toàn bộ vốn từ vựng của bạn một cách hệ thống, phân loại theo chủ đề và mục tiêu sử dụng thực tế.",
  },
  {
    icon: Sun,
    title: "Học từ mới hàng ngày",
    description:
      "Mỗi ngày 5-10 từ mới thuộc chủ đề bạn yêu thích, được tuyển chọn kỹ lưỡng cùng ví dụ cụ thể, sinh động.",
  },
  {
    icon: CalendarClock,
    title: "Ôn tập theo lịch thông minh",
    description:
      "Thuật toán Spaced Repetition tự động tính toán thời điểm vàng để nhắc bạn ôn tập trước khi kịp quên.",
  },
  {
    icon: Gamepad2,
    title: "Bài tập tương tác đa dạng",
    description:
      "Học vui vẻ qua flashcard game, bài tập điền từ, nghe viết chính tả và nhiều hình thức đa phương tiện sống động.",
  },
  {
    icon: ScanLine,
    title: "Nhận diện từ vựng bằng AI",
    description:
      "Quét và nhận diện từ mới nhanh chóng qua camera hay tài liệu, hình ảnh một cách tức thì.",
  },
  {
    icon: MessageCircleHeart,
    title: "Trò chuyện với trợ lý AI",
    description:
      "Thực hành đàm thoại trực tiếp 24/7 và sửa lỗi phát âm, ngữ pháp chuẩn xác cùng giáo viên AI bản xứ.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 6a2 2 0 0 1 2-2h5v16H6a2 2 0 0 1-2-2V6Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M20 6a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 0 2-2V6Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="leading-tight">
              <p className="text-[15px] font-semibold text-neutral-900">
                Study English
              </p>
              <p className="text-[11px] tracking-wide text-neutral-400">
                ENGLISH PLATFORM
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-medium text-neutral-500 md:flex">
            <Link href="/" className="text-orange-500">
              Trang chủ
            </Link>
            <Link href="/#features" className="hover:text-neutral-900">
              Tính năng
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-full border border-neutral-200 px-5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-300"
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-orange-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600"
            >
              Đăng ký
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-600">
            🚀 Phương pháp học tập của tương lai
          </span>

          <h1 className="mt-6 text-4xl font-bold leading-[1.15] text-neutral-900 sm:text-5xl">
            Học Tiếng Anh Thông Minh, Hiệu Quả Hơn Mỗi Ngày
          </h1>

          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-neutral-500">
            Tối ưu hóa khả năng ghi nhớ từ vựng với thuật toán lặp lại ngắt
            quãng (Spaced Repetition) thông minh, do AI cá nhân hóa theo năng
            lực của riêng bạn.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/register"
              className="rounded-full bg-orange-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-orange-600"
            >
              Bắt đầu miễn phí
            </Link>
            <Link
              href="/#features"
              className="rounded-full border border-neutral-200 px-6 py-3 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-300"
            >
              Tìm hiểu thêm
            </Link>
          </div>
        </div>

        <HeroCarousel />
      </section>

      {/* Stats */}
      <section className="border-y border-black/5 bg-neutral-50">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-10 text-center sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-2xl font-bold text-orange-500 sm:text-3xl">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-neutral-500 sm:text-sm">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative overflow-hidden py-20">
        <Image
          src="/images/features_bg.jpg"
          alt=""
          fill
          className="object-cover"
          priority={false}
        />
        <div className="pointer-events-none absolute inset-0 bg-sky-900/50" />

        <div className="relative mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              Công Cụ Vượt Trội Cho Hành Trình Học Tiếng Anh
            </h2>
            <p className="mt-3 text-sm text-sky-50/90 sm:text-base">
              Sự kết hợp hoàn hảo giữa thuật toán học tập tối ưu và trí tuệ
              nhân tạo tiên tiến, giúp bạn tăng tốc độ tiếp thu gấp 5 lần.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-2xl bg-white p-6 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.35)]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                    <Icon size={20} strokeWidth={1.8} />
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold text-neutral-900">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}