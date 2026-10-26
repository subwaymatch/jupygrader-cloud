import { AuthFrame } from "@/components/auth/AuthFrame";
import { ForgotForm } from "@/components/auth/ForgotForm";

export const metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <AuthFrame>
      <ForgotForm />
    </AuthFrame>
  );
}
