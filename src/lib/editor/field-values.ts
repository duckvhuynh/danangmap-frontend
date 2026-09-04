import type { AdminField } from "@/lib/api/admin";

const empty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

const phoneNumberPattern = /^\+?[0-9][0-9 ().-]{5,19}$/u;
const phoneExtensionPattern =
  /\s*\((?:số máy lẻ|máy lẻ|ext(?:ension)?\.?)\s*[0-9]+\)\s*$/iu;

function validPhone(value: string) {
  return value
    .split(/\s*\/\s*/u)
    .every((part) =>
      phoneNumberPattern.test(part.replace(phoneExtensionPattern, "").trim()),
    );
}

export function coerceFieldValue(field: AdminField, input: unknown): unknown {
  if (field.type === "boolean") return input === true || input === "true";
  if (field.type === "multi_enum")
    return Array.isArray(input)
      ? input.filter((value): value is string => typeof value === "string")
      : [];
  if (typeof input !== "string") return input;
  const value = input.trim();
  if (!value) return undefined;
  if (field.type === "datetime") {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? input : date.toISOString();
  }
  if (field.type === "number" || field.type === "integer") {
    const number = Number(value);
    return Number.isFinite(number)
      ? field.type === "integer"
        ? Math.trunc(number)
        : number
      : input;
  }
  return field.type === "long_text" ? input : value;
}

export function validateFieldValue(field: AdminField, value: unknown) {
  const errors: string[] = [];
  if (empty(value)) {
    if (field.required) errors.push(`${field.label} là trường bắt buộc.`);
    return errors;
  }
  const validation = field.validation ?? {};
  if (
    ["text", "long_text", "url", "email", "phone", "address"].includes(
      field.type,
    )
  ) {
    if (typeof value !== "string")
      errors.push(`${field.label} phải là chuỗi ký tự.`);
    else {
      if (
        validation.minLength !== undefined &&
        value.length < validation.minLength
      )
        errors.push(
          `${field.label} phải có ít nhất ${validation.minLength} ký tự.`,
        );
      if (
        validation.maxLength !== undefined &&
        value.length > validation.maxLength
      )
        errors.push(
          `${field.label} không được vượt quá ${validation.maxLength} ký tự.`,
        );
      if (field.type === "email" && !/^\S+@\S+\.\S+$/u.test(value))
        errors.push(`${field.label} chưa đúng định dạng email.`);
      if (
        field.type === "phone" &&
        !validPhone(value)
      )
        errors.push(`${field.label} chưa đúng định dạng số điện thoại.`);
      if (field.type === "url") {
        try {
          const url = new URL(value);
          if (url.protocol !== "http:" && url.protocol !== "https:")
            throw new Error("unsupported protocol");
        } catch {
          errors.push(`${field.label} phải là URL http hoặc https hợp lệ.`);
        }
      }
    }
  }
  if (field.type === "number" || field.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value))
      errors.push(`${field.label} phải là số hợp lệ.`);
    else {
      if (field.type === "integer" && !Number.isInteger(value))
        errors.push(`${field.label} phải là số nguyên.`);
      if (validation.minimum !== undefined && value < validation.minimum)
        errors.push(`${field.label} phải từ ${validation.minimum} trở lên.`);
      if (validation.maximum !== undefined && value > validation.maximum)
        errors.push(`${field.label} không được vượt quá ${validation.maximum}.`);
    }
  }
  if (field.type === "boolean" && typeof value !== "boolean")
    errors.push(`${field.label} phải là giá trị có/không.`);
  if (field.type === "enum") {
    if (typeof value !== "string" || !(field.options ?? []).includes(value))
      errors.push(`${field.label} phải là một lựa chọn hợp lệ.`);
  }
  if (field.type === "multi_enum") {
    if (
      !Array.isArray(value) ||
      value.some(
        (option) =>
          typeof option !== "string" || !(field.options ?? []).includes(option),
      )
    )
      errors.push(`${field.label} có lựa chọn không hợp lệ.`);
  }
  if (field.type === "date" || field.type === "datetime") {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
      errors.push(`${field.label} chưa đúng định dạng ngày giờ.`);
  }
  return errors;
}

export function validateFeatureProperties(
  fields: AdminField[],
  properties: Record<string, unknown>,
) {
  return fields.flatMap((field) =>
    validateFieldValue(field, properties[field.key]),
  );
}

export function applyFieldDefaults(
  fields: AdminField[],
  properties: Record<string, unknown>,
) {
  const next = { ...properties };
  for (const field of fields) {
    if (!(field.key in next) && field.defaultValue !== undefined)
      next[field.key] = structuredClone(field.defaultValue);
  }
  return next;
}
