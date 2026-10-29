import { notFound } from "next/navigation";

/**
 * Public status page. Arrives in M3, gated on `settings.public_page_enabled`
 * (off by default); until then the root path is a 404.
 */
export default function Home() {
  notFound();
}
