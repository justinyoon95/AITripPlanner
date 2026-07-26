import { LogOut } from "lucide-react";
import type { Session } from "next-auth";

import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

type UserMenuProps = {
  user: Session["user"];
};

export function UserMenu({ user }: UserMenuProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-sm font-medium">{user.name ?? "Traveler"}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </div>
      <form
        action={async () => {
          "use server";

          await signOut({ redirectTo: "/" });
        }}
      >
        <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
          <LogOut className="size-4" aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
