import { describe, expect, it } from "vitest";
import { countryName, profileValue } from "./answers";

describe("country of residence", () => {
  it("names the country from its ISO code", () => {
    expect(countryName("US")).toBe("United States");
    expect(countryName("gb")).toBe("United Kingdom");
    expect(countryName("not a code")).toBe("not a code");
  });
  it("answers from the profile's country, not the city", () => {
    const data = { profile: { country: "US", city: "Atlanta", state: "GA" }, workAuthorizations: [], employment: [] } as never;
    expect(profileValue("country_of_residence", data, { country: "US", now: new Date() })).toBe("United States");
    expect(profileValue("current_location", data, { country: "US", now: new Date() })).toBe("Atlanta, GA");
  });
});
