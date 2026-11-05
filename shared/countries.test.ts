import { describe, expect, it } from "vitest";
import { asCountryName, countryNames } from "./countries";

describe("countries", () => {
  it("lists every country by name, the United States first", () => {
    const list = countryNames();
    expect(list[0]).toBe("United States");
    expect(list).toContain("United Kingdom");
    expect(list).toContain("Nigeria");
    expect(list.filter((n) => n === "United States")).toHaveLength(1);
    expect(list.length).toBeGreaterThan(240);
  });

  it("reads the ways people write a country as its name in the list", () => {
    for (const s of ["United States", "united states", "USA", "U.S.", "American", "United States of America", "US"]) {
      expect(asCountryName(s)).toBe("United States");
    }
    expect(asCountryName("British")).toBe("United Kingdom");
    expect(asCountryName("DE")).toBe("Germany");
    expect(asCountryName("Canada")).toBe("Canada");
    expect(asCountryName("Atlanta, GA")).toBeNull();
    expect(asCountryName("")).toBeNull();
  });
});
