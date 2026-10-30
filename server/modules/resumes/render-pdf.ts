// Renders a resume to PDF with @react-pdf/renderer: one column, standard
// fonts, plain text, so applicant tracking systems parse it cleanly. Written
// with createElement (no JSX) so the worker runs it without a JSX build step,
// and loaded with import() because the package is ESM-only.
import { createElement as h, type ReactElement } from "react";
import type * as ReactPdf from "@react-pdf/renderer";
import type { ResumeDoc } from "./resume-doc";

const styles = {
  page: { paddingVertical: 36, paddingHorizontal: 44, fontFamily: "Helvetica", fontSize: 10, lineHeight: 1.35, color: "#111" },
  name: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  headline: { fontSize: 11, marginTop: 2, color: "#333" },
  contact: { fontSize: 9, marginTop: 4, color: "#444" },
  section: { marginTop: 12 },
  heading: { fontSize: 10, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, borderBottomWidth: 0.75, borderBottomColor: "#999", paddingBottom: 2, marginBottom: 5 },
  job: { marginBottom: 7 },
  jobLine: { flexDirection: "row", justifyContent: "space-between" },
  jobTitle: { fontFamily: "Helvetica-Bold" },
  jobMeta: { color: "#444" },
  bullet: { flexDirection: "row", marginTop: 2, paddingLeft: 6 },
  dot: { width: 10 },
  bulletText: { flex: 1 },
} satisfies Record<string, ReactPdf.Styles[string]>;

function section(pdf: typeof ReactPdf, title: string, children: ReactElement | ReactElement[]): ReactElement {
  const { Text, View } = pdf;
  return h(View, { style: styles.section }, h(Text, { style: styles.heading }, title), children);
}

function resume(pdf: typeof ReactPdf, doc: ResumeDoc): ReactElement {
  const { Document, Page, Text, View } = pdf;
  const blocks: ReactElement[] = [
    h(View, { key: "head" }, [
      h(Text, { key: "n", style: styles.name }, doc.name),
      doc.headline ? h(Text, { key: "h", style: styles.headline }, doc.headline) : null,
      doc.contact.length ? h(Text, { key: "c", style: styles.contact }, doc.contact.join("  ·  ")) : null,
    ]),
  ];
  if (doc.summary) blocks.push(h(View, { key: "summary" }, section(pdf, "Summary", h(Text, null, doc.summary))));
  if (doc.experience.length) {
    blocks.push(
      h(View, { key: "experience" }, section(pdf, "Experience", doc.experience.map((j) =>
        h(View, { key: j.employment_id, style: styles.job, wrap: false }, [
          h(View, { key: "l", style: styles.jobLine }, [
            h(Text, { key: "t", style: styles.jobTitle }, `${j.title}, ${j.employer}`),
            h(Text, { key: "d", style: styles.jobMeta }, j.dates),
          ]),
          j.location ? h(Text, { key: "loc", style: styles.jobMeta }, j.location) : null,
          ...j.bullets.map((b, i) =>
            h(View, { key: `b${i}`, style: styles.bullet }, [h(Text, { key: "d", style: styles.dot }, "•"), h(Text, { key: "t", style: styles.bulletText }, b)]),
          ),
        ]),
      ))),
    );
  }
  if (doc.skills.length) blocks.push(h(View, { key: "skills" }, section(pdf, "Skills", h(Text, null, doc.skills.join(", ")))));
  if (doc.education.length) blocks.push(h(View, { key: "education" }, section(pdf, "Education", doc.education.map((e, i) => h(Text, { key: i }, e)))));
  if (doc.certifications.length) {
    blocks.push(h(View, { key: "certs" }, section(pdf, "Certifications", doc.certifications.map((c, i) => h(Text, { key: i }, c)))));
  }
  return h(Document, { title: `${doc.name} resume`, author: doc.name }, h(Page, { size: "LETTER", style: styles.page }, blocks));
}

/** Renders a resume to PDF bytes. */
export async function renderResumePdf(doc: ResumeDoc): Promise<Buffer> {
  const pdf = await import("@react-pdf/renderer");
  return pdf.renderToBuffer(resume(pdf, doc) as Parameters<typeof pdf.renderToBuffer>[0]);
}
