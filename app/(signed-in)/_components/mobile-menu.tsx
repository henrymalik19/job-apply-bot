"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { NavList } from "./nav-links";

/**
 * Navigation on small screens: a Menu button that opens every page, grouped like the
 * desktop sidebar, with the account below. Closes when you go to a page.
 */
export function MobileMenu({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- closing the menu is the point of navigating
  useEffect(() => setOpen(false), [pathname]);
  return (
    <div className="md:hidden">
      <Button variant="ghost" size="sm" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
        {open ? <X /> : <Menu />} Menu
      </Button>
      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-full z-40 max-h-[80svh] overflow-y-auto border-b bg-background px-4 pt-3 pb-4 shadow-lg">
          <NavList pathname={pathname} vertical />
          <div className="mt-4 border-t pt-3">{children}</div>
        </div>
      )}
    </div>
  );
}
