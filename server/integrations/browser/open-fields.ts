// Finds the required fields a form still has empty after the runner filled what it prepared: a
// section it didn't know about (Education, Employment), a question added since. Only visible fields
// count (a section for another region stays hidden). The runner asks Claude to answer these from
// your profile, or leaves them to you.
import type { Page } from "playwright-core";
import type { OpenField } from "@/server/modules/apply/apply.service";

/** How a site names its fields: by element id (Greenhouse), by the field box's path (Ashby), by form name (Lever). */
export type FieldKey = "id" | "path" | "name";

// Runs in the page; kept as plain JavaScript text so nothing is added to it on the way in.
const SCAN = `(({ root, strategy, known }) => {
  const scope = document.querySelector(root) || document;
  const shown = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  // Hidden inputs styled behind a custom box count as shown when their label is.
  const visible = (e) => shown(e) || (e.labels && [...e.labels].some(shown)) || (e.closest("label") && shown(e.closest("label")));
  const keyOf = (e) => {
    if (strategy === "id") return (e.closest("fieldset[id]") && e.closest("fieldset[id]").id) || e.id || null;
    if (strategy === "path") { const box = e.closest("[data-field-path]"); return box ? box.getAttribute("data-field-path") : null; }
    return e.getAttribute("name");
  };
  // A label ends at its required mark; anything after it (Lever's hidden "No location found") isn't the question.
  const clean = (t) => (t || "").replace(/\\s+/g, " ").split("✱")[0].replace(/\\*\\s*$/, "").trim();
  const labelOf = (e) => {
    const box = e.closest("fieldset") || e.closest("[data-field-path]") || e.closest(".application-question") || e.closest(".field") || e.closest("li");
    const legend = box && box.querySelector("legend, label, .text, .application-label");
    if (e.id) { const l = document.querySelector('label[for="' + CSS.escape(e.id) + '"]'); if (l && !(e.type === "radio" || e.type === "checkbox")) return clean(l.textContent); }
    const by = e.getAttribute("aria-labelledby");
    if (by) { const l = document.getElementById(by.split(" ")[0]); if (l) return clean(l.textContent); }
    return clean(legend ? legend.textContent : e.getAttribute("aria-label") || e.getAttribute("placeholder"));
  };
  const optionLabel = (e) => {
    const l = (e.id && document.querySelector('label[for="' + CSS.escape(e.id) + '"]')) || e.closest("label");
    return clean(l ? l.textContent : e.value);
  };
  const marked = (e) => {
    if (e.required || e.getAttribute("aria-required") === "true") return true;
    const box = e.closest("fieldset") || e.closest("[data-field-path]") || e.closest(".application-question") || e.closest(".field") || e.closest("li");
    const label = box && box.querySelector("legend, label, .text, .application-label");
    return !!label && (/[*✱]/.test(label.textContent || "") || /required/i.test(label.className || ""));
  };
  const groups = new Map();
  const fields = scope.querySelectorAll("input, textarea, select");
  for (const e of fields) {
    const type = (e.getAttribute("type") || "").toLowerCase();
    if (["hidden", "file", "submit", "button", "search"].includes(type)) continue;
    if (/recaptcha|captcha/i.test(e.name || e.id || "")) continue;
    if (!visible(e) || !marked(e)) continue;
    const key = keyOf(e);
    if (!key || known.includes(key)) continue;
    const g = groups.get(key) || { key, label: labelOf(e), kind: "text", options: [], empty: true };
    if (e.tagName === "TEXTAREA") { g.kind = "textarea"; g.empty = !e.value.trim(); }
    else if (e.tagName === "SELECT") {
      g.kind = e.multiple ? "multiselect" : "select";
      g.options = [...e.options].filter((o) => o.value !== "").map((o) => clean(o.textContent));
      g.empty = !e.value;
    } else if (type === "radio" || type === "checkbox") {
      g.kind = type === "radio" ? "select" : "multiselect";
      g.options.push(optionLabel(e));
      if (e.checked) g.empty = false;
    } else if (e.getAttribute("role") === "combobox") {
      g.kind = "combobox";
      const control = e.closest(".select__control, [class*=control]");
      const chosen = control && control.querySelector(".select__single-value, .select__multi-value__label");
      g.empty = !chosen && !e.value.trim();
    } else { g.kind = "text"; g.empty = !e.value.trim(); }
    groups.set(key, g);
  }
  // A lone required checkbox is an agreement ("I certify…"): always yours.
  return [...groups.values()].filter((g) => g.empty).map((g) => ({
    key: g.key,
    label: g.label,
    kind: g.kind === "multiselect" && g.options.length === 1 ? "agreement" : g.kind,
    options: g.options,
  }));
})`;

/**
 * The visible required fields still empty on the form, other than the ones the runner filled (`known`).
 *
 * @param root - The form's selector (the whole page when it isn't found).
 */
export async function scanOpenFields(page: Page, root: string, strategy: FieldKey, known: string[]): Promise<OpenField[]> {
  return page.evaluate(`${SCAN}(${JSON.stringify({ root, strategy, known })})`) as Promise<OpenField[]>;
}
