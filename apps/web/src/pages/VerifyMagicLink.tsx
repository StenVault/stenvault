import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import { Loader2 } from "lucide-react";
import { AuthLayout, AuthCard } from "@/components/auth";
import { storeTokenPair } from "@/lib/auth";

export default function VerifyMagicLink() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token");

  const verifyMutation = trpc.auth.verifyMagicLink.useMutation();

  useEffect(() => {
    if (!token) {
      toast.error("Invalid token");
      setLocation("/auth/login");
      return;
    }

    const verify = async () => {
      try {
        const result = await verifyMutation.mutateAsync({ token }) as any;

        // MFA gate: redirect to login with MFA challenge
        if (result?.mfaRequired) {
          sessionStorage.setItem('mfaToken', result.mfaToken);
          setLocation("/auth/login?mfa=true");
          return;
        }

        if (result?.credentials) {
          storeTokenPair({
            accessToken: result.credentials.accessToken,
            refreshToken: result.credentials.refreshToken,
            expiresIn: result.credentials.expiresIn,
          });
        } else if (result?.accessToken) {
          localStorage.setItem('authToken', result.accessToken);
        }

        toast.success("Login successful");
        setLocation("/home");
      } catch (error: any) {
        toast.error(error.message || "Invalid or expired link");
        setLocation("/auth/login");
      }
    };

    verify();
  }, [token]);

  return (
    <AuthLayout showBackLink={false}>
      <AuthCard
        title="Securing session"
        description="Please wait while we establish your private connection."
      >
        <div className="flex justify-center py-10">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
