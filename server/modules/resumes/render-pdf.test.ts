import { describe, expect, it } from "vitest";
import { contactLines, formatPhone, shortLink } from "./render-pdf";

describe("resume header", () => {
  it("puts place, email and phone on one line and the links, shortened, on the next", () => {
    expect(
      contactLines(["Atlanta, GA", "me@example.test", "7044257411", "https://www.linkedin.com/in/someone-123/", "https://github.com/someone", "https://example.dev"]),
    ).toEqual({
      info: ["Atlanta, GA", "me@example.test", "(704) 425-7411"],
      links: ["linkedin.com/in/someone-123", "github.com/someone", "example.dev"],
    });
  });

  it("leaves numbers and links it doesn't recognize as they were typed", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhone("1-704-425-7411")).toBe("(704) 425-7411");
    expect(shortLink("malikhenry.com/")).toBe("malikhenry.com");
  });
});
