import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SignInButton } from "@/components/auth/sign-in-button";

export default async function SignInPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="border-b pb-6">
        <p className="text-sm font-medium text-muted-foreground">Welcome</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">
          Sign in to plan trips
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Use OAuth to keep authentication simple, secure, and production-like.
        </p>
      </div>

      <div className="mt-8 grid gap-3">
        <SignInButton label="Continue with Google" />
      </div>
    </main>
  );
}
