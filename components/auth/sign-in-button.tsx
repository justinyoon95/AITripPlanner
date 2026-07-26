import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";

type SignInButtonProps = {
  label: string;
};

export function SignInButton({ label }: SignInButtonProps) {
  return (
    <form
      action={async () => {
        "use server";

        await signIn("google", { redirectTo: "/dashboard" });
      }}
    >
      <Button type="submit" variant="outline" size="lg" className="w-full">
        <span className="flex size-4 items-center justify-center rounded-full border text-xs font-semibold">
          G
        </span>
        {label}
      </Button>
    </form>
  );
}
