"use client";

import { useMemo, useState } from "react";
import {
  Contact as IconAddressBook,
  Calendar as IconCalendar,
  Check as IconCheck,
  Eye as IconEye,
  EyeOff as IconEyeOff,
  Filter as IconFilter,
  Link as IconLink,
  List as IconList,
  Mail as IconMail,
  MapPin as IconMapPin,
  Hash as IconNumber,
  Paperclip as IconPaperclip,
  Phone as IconPhone,
  Image as IconPhoto,
  Search as IconSearch,
  Type as IconTextCaption,
  type LucideIcon as Icon,
} from "lucide-react";
import type { AdminField } from "@/lib/api/admin";
import {
  applyFieldDefaults,
  coerceFieldValue,
  validateFieldValue,
} from "@/lib/editor/field-values";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const fieldIcons: Record<string, Icon> = {
  address: IconMapPin,
  "map-pin": IconMapPin,
  phone: IconPhone,
  mail: IconMail,
  email: IconMail,
  link: IconLink,
  calendar: IconCalendar,
  number: IconNumber,
};

function iconForField(field: AdminField) {
  if (field.icon && fieldIcons[field.icon]) return fieldIcons[field.icon];
  return (
    {
      number: IconNumber,
      integer: IconNumber,
      boolean: IconCheck,
      date: IconCalendar,
      datetime: IconCalendar,
      url: IconLink,
      email: IconMail,
      phone: IconPhone,
      enum: IconList,
      multi_enum: IconList,
      address: IconAddressBook,
      image: IconPhoto,
      attachment: IconPaperclip,
    } as Partial<Record<AdminField["type"], Icon>>
  )[field.type] ?? IconTextCaption;
}

function inputValue(field: AdminField, value: unknown) {
  if (field.type === "boolean") return value === true;
  if (field.type === "multi_enum")
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  if (value === undefined || value === null) return "";
  if (field.type === "datetime" && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) {
      const pad = (part: number, length = 2) =>
        String(part).padStart(length, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
    }
  }
  return String(value);
}

export function FeaturePropertiesEditor({
  featureId,
  properties,
  fields,
  onPatch,
}: {
  featureId: string | null;
  properties: Record<string, unknown> | null;
  fields: AdminField[];
  onPatch: (properties: Record<string, unknown>) => void;
}) {
  const sortedFields = useMemo(
    () =>
      [...fields].sort(
        (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
      ),
    [fields],
  );
  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    const values = applyFieldDefaults(fields, properties ?? {});
    return Object.fromEntries(
      fields.map((field) => [field.key, inputValue(field, values[field.key])]),
    );
  });

  if (!featureId || !properties)
    return (
      <section aria-labelledby="feature-properties-title">
        <h2 id="feature-properties-title" className="text-sm font-semibold">
          Thuộc tính đối tượng
        </h2>
        <p className="mt-2 rounded-control bg-surface-subtle p-3 text-xs leading-5 text-muted-foreground">
          Chọn một đối tượng trên bản đồ hoặc trong danh sách để xem và sửa thông tin.
        </p>
      </section>
    );

  const commit = (field: AdminField, input: unknown) => {
    const value = coerceFieldValue(field, input);
    setDraft((current) => ({ ...current, [field.key]: inputValue(field, value) }));
    if (JSON.stringify(value) === JSON.stringify(properties[field.key])) return;
    onPatch({ [field.key]: value });
  };

  return (
    <section aria-labelledby="feature-properties-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="feature-properties-title" className="text-sm font-semibold">
          Thuộc tính đối tượng
        </h2>
      </div>
      <div className="mt-4 space-y-4">
        {sortedFields.map((field) => {
          const FieldIcon = iconForField(field);
          const value = draft[field.key];
          const coerced = coerceFieldValue(field, value);
          const errors = validateFieldValue(field, coerced);
          const inputId = `feature-field-${field.key}`;
          return (
            <div key={field.key}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <FieldIcon
                  aria-hidden="true"
                  className="text-muted-foreground"
                  size={16}
                  strokeWidth={1.75}
                />
                <label htmlFor={inputId} className="text-xs font-medium">
                  {field.label}
                  {field.required ? " *" : ""}
                </label>
              </div>
              {field.type === "long_text" ? (
                <Textarea
                  id={inputId}
                  value={String(value ?? "")}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  onBlur={(event) => commit(field, event.target.value)}
                  className="min-h-20 resize-y"
                  aria-invalid={errors.length > 0}
                  aria-describedby={`${inputId}-meta`}
                />
              ) : field.type === "boolean" ? (
                <label
                  id={inputId}
                  className="flex min-h-10 items-center gap-2 rounded-control border px-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={value === true}
                    onChange={(event) => commit(field, event.target.checked)}
                  />
                  {value === true ? "Có" : "Không"}
                </label>
              ) : field.type === "enum" ? (
                <select
                  id={inputId}
                  value={String(value ?? "")}
                  onChange={(event) => commit(field, event.target.value)}
                  className="h-10 w-full rounded-control border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                  aria-invalid={errors.length > 0}
                >
                  <option value="">Chọn giá trị</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.type === "multi_enum" ? (
                <div id={inputId} className="space-y-1.5 rounded-control border p-2">
                  {(field.options ?? []).map((option) => {
                    const selected = Array.isArray(value) && value.includes(option);
                    return (
                      <label
                        key={option}
                        className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            commit(
                              field,
                              selected
                                ? (value as string[]).filter(
                                    (item) => item !== option,
                                  )
                                : [...(Array.isArray(value) ? value : []), option],
                            )
                          }
                        />
                        {option}
                      </label>
                    );
                  })}
                </div>
              ) : field.type === "image" || field.type === "attachment" ? (
                <p
                  id={inputId}
                  className="rounded-control border border-dashed p-3 text-xs leading-5 text-muted-foreground"
                >
                  Quản lý trường này trong phần Tệp đính kèm bên dưới.
                </p>
              ) : (
                <Input
                  id={inputId}
                  type={
                    field.type === "number" || field.type === "integer"
                      ? "number"
                      : field.type === "date"
                        ? "date"
                        : field.type === "datetime"
                          ? "datetime-local"
                          : field.type === "email"
                            ? "email"
                            : field.type === "url"
                              ? "url"
                              : field.type === "phone"
                                ? "tel"
                                : "text"
                  }
                  step={
                    field.type === "datetime"
                      ? 0.001
                      : field.type === "integer"
                        ? 1
                        : undefined
                  }
                  min={field.validation?.minimum}
                  max={field.validation?.maximum}
                  minLength={field.validation?.minLength}
                  maxLength={field.validation?.maxLength}
                  value={String(value ?? "")}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  onBlur={(event) => commit(field, event.target.value)}
                  aria-invalid={errors.length > 0}
                  aria-describedby={`${inputId}-meta`}
                />
              )}
              <div
                id={`${inputId}-meta`}
                className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground"
              >
                <span className="inline-flex items-center gap-1">
                  {field.public !== false ? (
                    <IconEye size={13} />
                  ) : (
                    <IconEyeOff size={13} />
                  )}
                  {field.public !== false ? "Công khai" : "Nội bộ"}
                </span>
                {field.searchable && (
                  <span className="inline-flex items-center gap-1">
                    · <IconSearch size={13} /> Tìm kiếm
                  </span>
                )}
                {field.filterable && (
                  <span className="inline-flex items-center gap-1">
                    · <IconFilter size={13} /> Bộ lọc
                  </span>
                )}
              </div>
              {field.description && (
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {field.description}
                </p>
              )}
              {errors.map((message) => (
                <p
                  key={message}
                  className="mt-1 text-[11px] leading-4 text-destructive"
                  role="alert"
                >
                  {message}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
