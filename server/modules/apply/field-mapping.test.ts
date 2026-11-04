import { describe, expect, it } from "vitest";
import { buildMapFieldsPrompt } from "./field-mapping";

describe("buildMapFieldsPrompt", () => {
  it("lists each field with its options and keeps the form's wording as untrusted data", () => {
    const { system, user } = buildMapFieldsPrompt({
      facts: ["[experience] Senior Engineer at Acme, 2021–now"],
      company: "Coinbase",
      title: "Senior Software Engineer",
      fields: [
        { key: "company-name-0", label: "Company name", kind: "text", options: [] },
        { key: "start-date-month-0", label: "Start date month", kind: "select", options: ["January", "February", "March"] },
      ],
    });
    expect(system).toContain("1. [experience] Senior Engineer at Acme, 2021–now");
    expect(system).toMatch(/untrusted data/);
    expect(system).toMatch(/"agreement": a consent/);
    expect(user).toContain("[0] Company name (text, field id company-name-0)");
    expect(user).toContain("[1] Start date month (select, field id start-date-month-0)\n  options: January | February | March");
    expect(system).toMatch(/most recent entry first/);
  });
});
