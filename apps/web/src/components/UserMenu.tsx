"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { colorForUser } from "@texcollab/shared";
import { Avatar, Menu, MenuItem } from "./ui";

export function UserMenu({ user }: { user: { id: string; name: string; email: string; image: string | null } }) {
  const router = useRouter();
  return (
    <Menu
      align="right"
      trigger={({ onClick }) => (
        <button onClick={onClick} className="rounded-full focus-visible:outline-2 focus-visible:outline-brand-500" aria-label="Conta">
          <Avatar name={user.name} image={user.image} color={colorForUser(user.id).color} size={30} />
        </button>
      )}
    >
      {() => (
        <>
          <div className="px-2.5 py-2">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-zinc-500">{user.email}</div>
          </div>
          <div className="my-1 h-px bg-zinc-100" />
          <MenuItem
            icon={<LogOut size={14} />}
            onClick={async () => {
              await authClient.signOut();
              router.replace("/");
              router.refresh();
            }}
          >
            Sair
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
