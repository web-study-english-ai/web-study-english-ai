import { AuthVisual } from "@/features/auth/components/AuthVisual";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

export default function RegisterPage() {
  return (
    <>

      <AuthVisual
        title="Unlock a world of opportunities."
        subtitle="Interactive bitesize English lessons built around practical communication. Practice daily and speak with confidence in no time."
        accent="rose"
        imageSrc="/images/register.png"
        variant="card"
      />
      <div className="flex flex-1 items-center justify-center bg-auth-surface p-6">
        <RegisterForm />
      </div>
    </>
  );
}