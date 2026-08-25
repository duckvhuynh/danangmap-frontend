import { describe, expect, it } from "vitest";
import type { AdminField } from "@/lib/api/admin";
import {
  applyFieldDefaults,
  coerceFieldValue,
  validateFieldValue,
  validateFeatureProperties,
} from "./field-values";

const field = (override: Partial<AdminField> = {}): AdminField => ({
  key: "population",
  label: "Dân số",
  type: "integer",
  required: true,
  sensitive: false,
  offlineCache: true,
  ...override,
});

describe("schema-driven field values", () => {
  it("coerces numeric, boolean and multi-select inputs", () => {
    expect(coerceFieldValue(field(), " 1200 ")).toBe(1200);
    expect(
      coerceFieldValue(field({ type: "boolean" }), "true"),
    ).toBe(true);
    expect(
      coerceFieldValue(field({ type: "multi_enum" }), ["ward", 3]),
    ).toEqual(["ward"]);
  });

  it("applies required, range, format and enum validation", () => {
    expect(validateFieldValue(field(), "")).toContain(
      "Dân số là trường bắt buộc.",
    );
    expect(
      validateFieldValue(
        field({ validation: { minimum: 1, maximum: 10 } }),
        12,
      ),
    ).toContain("Dân số không được vượt quá 10.");
    expect(
      validateFieldValue(
        field({ type: "email", label: "Email" }),
        "invalid",
      ),
    ).toContain("Email chưa đúng định dạng email.");
    expect(
      validateFieldValue(
        field({ type: "enum", options: ["active"] }),
        "archived",
      ),
    ).toContain("Dân số phải là một lựa chọn hợp lệ.");
  });

  it("validates a feature and fills versioned schema defaults", () => {
    const fields = [
      field({ key: "name", label: "Tên", type: "text" }),
      field({
        key: "status",
        label: "Trạng thái",
        type: "enum",
        options: ["active"],
        defaultValue: "active",
        required: false,
      }),
    ];
    const properties = applyFieldDefaults(fields, { name: "Hải Châu" });
    expect(properties).toEqual({ name: "Hải Châu", status: "active" });
    expect(validateFeatureProperties(fields, properties)).toEqual([]);
  });
});
