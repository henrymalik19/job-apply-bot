import { redirect } from "next/navigation";

/** /admin has no page of its own; it opens Health. */
export default function AdminIndexPage() {
  redirect("/admin/health");
}
