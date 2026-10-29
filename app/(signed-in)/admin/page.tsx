import { redirect } from "next/navigation";

/** /admin has no page of its own yet; Health is the only admin section. */
export default function AdminIndexPage() {
  redirect("/admin/health");
}
