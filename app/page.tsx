import { notFound } from "next/navigation";

// Public status page arrives in M3, gated on settings.public_page_enabled
// (off by default). Until then the root path is a 404.
export default function Home() {
  notFound();
}
