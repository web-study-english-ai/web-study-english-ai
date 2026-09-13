import Image from "next/image";

export default function DashboardPage() {
  return (
    <div className="relative h-[calc(100vh-4rem)] w-full overflow-hidden">
      <Image
        src="/images/dashboard2_1.jpg"
        alt="Học tiếng Anh"
        fill
        className="object-cover"
        priority
      />
      
    </div>
  );
}