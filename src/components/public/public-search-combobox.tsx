"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Landmark as IconBuildingCommunity,
  LoaderCircle as IconLoader2,
  MapPin as IconMapPin,
  Search as IconSearch,
  X as IconX,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchPublicMap, type PublicSearchResponse, type PublicSearchResult } from "@/lib/api/public-search";
import { groupPublicSearchResults, nextActiveSearchIndex } from "@/lib/search/public-search-state";
import { cn } from "@/lib/utils";

interface PublicSearchComboboxProps {
  onSelect: (result: PublicSearchResult) => void;
  search?: (query: string, signal?: AbortSignal) => Promise<PublicSearchResponse>;
  debounceMs?: number;
}

export function PublicSearchCombobox({ onSelect, search = searchPublicMap, debounceMs = 280 }: PublicSearchComboboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedQueryRef = useRef<string | null>(null);
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<PublicSearchResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const groups = useMemo(() => groupPublicSearchResults(response?.results ?? []), [response]);
  const options = useMemo(() => groups.flatMap((group) => group.results), [groups]);
  const normalizedQuery = query.trim();
  const popupVisible = open && normalizedQuery.length >= 2;

  useEffect(() => {
    if (normalizedQuery.length < 2 || selectedQueryRef.current === normalizedQuery) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setStatus("loading");
      setResponse(null);
      setActiveIndex(-1);
      search(normalizedQuery, controller.signal).then((next) => {
        if (controller.signal.aborted) return;
        setResponse(next);
        setStatus("ready");
        setOpen(true);
      }).catch(() => {
        if (controller.signal.aborted) return;
        setResponse(null);
        setStatus("error");
        setOpen(true);
      });
    }, debounceMs);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [debounceMs, normalizedQuery, search]);

  function choose(result: PublicSearchResult) {
    selectedQueryRef.current = result.title;
    setQuery(result.title);
    setResponse(null);
    setStatus("idle");
    setOpen(false);
    setActiveIndex(-1);
    onSelect(result);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!options.length) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => nextActiveSearchIndex(current, event.key === "ArrowDown" ? 1 : -1, options.length));
      return;
    }
    if (event.key === "Enter" && popupVisible && activeIndex >= 0) {
      event.preventDefault();
      choose(options[activeIndex]);
      return;
    }
    if (event.key === "Escape" && popupVisible) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function clear() {
    selectedQueryRef.current = null;
    setQuery("");
    setResponse(null);
    setStatus("idle");
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  let optionIndex = -1;
  return (
    <div className="relative w-full" role="search">
      <IconSearch className="pointer-events-none absolute left-4 top-6 z-10 -translate-y-1/2 text-muted-foreground" size={21} strokeWidth={1.75} />
      <Input
        ref={inputRef}
        value={query}
        role="combobox"
        aria-label="Tìm địa điểm hoặc dữ liệu"
        aria-autocomplete="list"
        aria-expanded={popupVisible}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder="Tìm phường, trụ sở, địa chỉ..."
        className="h-12 rounded-panel border-0 pl-12 pr-12 map-control-shadow"
        onFocus={() => { if (normalizedQuery.length >= 2 && selectedQueryRef.current !== normalizedQuery) setOpen(true); }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          const next = event.target.value;
          selectedQueryRef.current = null;
          setQuery(next);
          setOpen(true);
          setResponse(null);
          setActiveIndex(-1);
          if (next.trim().length < 2) {
            setStatus("idle");
          } else setStatus("loading");
        }}
        onKeyDown={handleKeyDown}
      />
      {status === "loading" ? <IconLoader2 className="pointer-events-none absolute right-4 top-6 z-10 -translate-y-1/2 animate-spin text-primary" size={19} aria-hidden="true" /> : query ? (
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={clear} className="absolute right-1.5 top-1.5 z-10 grid size-9 place-items-center rounded-control text-muted-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Xóa tìm kiếm"><IconX size={19} strokeWidth={1.75} /></button>
      ) : null}

      {popupVisible && (
        <div id={listboxId} role="listbox" aria-label="Kết quả tìm kiếm" aria-busy={status === "loading"} className="absolute inset-x-0 top-14 z-40 max-h-[min(440px,65dvh)] overflow-y-auto rounded-panel border bg-surface py-2 map-panel-shadow">
          {status === "loading" && <p className="px-4 py-4 text-sm text-muted-foreground" role="status">Đang tìm trong dữ liệu công bố và Geo Service...</p>}
          {status === "error" && <p className="px-4 py-4 text-sm text-destructive" role="alert">Không thể tra cứu lúc này. Hãy kiểm tra kết nối và thử lại.</p>}
          {status === "ready" && response?.meta.partial && (
            <p className="mx-2 mb-2 rounded-control border border-warning/30 bg-surface-subtle px-3 py-2 text-xs leading-5 text-warning" role="status">
              Một nguồn tìm kiếm đang tạm gián đoạn. Kết quả dữ liệu công bố vẫn được giữ lại.
            </p>
          )}
          {status === "ready" && options.length === 0 && <p className="px-4 py-5 text-sm text-muted-foreground">Không tìm thấy kết quả phù hợp.</p>}
          {status === "ready" && groups.map((group) => (
            <div role="group" aria-labelledby={`${listboxId}-${group.id}`} key={group.id}>
              <p id={`${listboxId}-${group.id}`} className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{group.label}</p>
              {group.results.map((result) => {
                optionIndex += 1;
                const currentIndex = optionIndex;
                const active = currentIndex === activeIndex;
                const Icon = result.source === "internal" ? IconBuildingCommunity : IconMapPin;
                return (
                  <div
                    id={`${listboxId}-option-${currentIndex}`}
                    role="option"
                    aria-selected={active}
                    key={`${result.source}:${result.id}`}
                    className={cn("flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2.5", active ? "bg-accent-subtle" : "hover:bg-surface-subtle")}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(currentIndex)}
                    onClick={() => choose(result)}
                  >
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", result.source === "internal" ? "bg-accent-subtle text-primary" : "bg-surface-subtle text-foreground")} aria-hidden="true"><Icon size={19} strokeWidth={1.75} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{result.title}</span>{result.subtitle && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{result.subtitle}</span>}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <span className="sr-only" aria-live="polite">{status === "loading" ? "Đang tìm kiếm" : status === "ready" ? `${options.length} kết quả tìm kiếm` : ""}</span>
    </div>
  );
}
