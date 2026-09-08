import { AuthVisual } from "@/features/auth/components/AuthVisual";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { Suspense } from "react";
export default function LoginPage() {
  return (
    <>

      <AuthVisual
        title="Leap into your next language adventure!"
        subtitle="Interactive bitesize English lessons built around practical communication. Practice daily and speak with confidence in no time."
        accent="teal"
        imageSrc="/images/login.png"
        variant="full"
      />
      <div className="flex flex-1 items-center justify-center bg-auth-surface p-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      </div>
    </>
  );
}