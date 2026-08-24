import { describe, expect, it } from "vitest";
import {
  canAuthorContent,
  canPublishContent,
  canReviewContent,
} from "./role-capabilities";

describe("admin role capabilities", () => {
  it("grants System Admin every content capability", () => {
    expect(canAuthorContent("system_admin")).toBe(true);
    expect(canReviewContent("system_admin")).toBe(true);
    expect(canPublishContent("system_admin")).toBe(true);
  });

  it("keeps content roles scoped to their own capability", () => {
    expect(canAuthorContent("editor")).toBe(true);
    expect(canReviewContent("editor")).toBe(false);
    expect(canReviewContent("reviewer")).toBe(true);
    expect(canPublishContent("reviewer")).toBe(false);
    expect(canPublishContent("publisher")).toBe(true);
    expect(canAuthorContent("publisher")).toBe(false);
  });
});
