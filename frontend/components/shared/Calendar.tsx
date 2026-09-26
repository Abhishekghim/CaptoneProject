"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isBefore,
  isSameDay, isSameMonth, startOfMonth, startOfToday, startOfWeek, subMonths,
} from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

function parseDateOnly(value: string): Date {
  const [y, m, day] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1);
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/** Month-grid date picker (FR8: "display available appointment slots in calendar view"). */
export function AppointmentCalendar({
  value,
  onChange,
  minDate = startOfToday(),
  busyDates = {},
}: {
  value: string; // yyyy-MM-dd
  onChange: (date: string) => void;
  minDate?: Date;
  busyDates?: Record<string, number>;
}) {
  const selected = parseDateOnly(value);
  const [cursor, setCursor] = useState(() => startOfMonth(selected));

  // Keep the displayed month in sync with the selected date — otherwise
  // clicking a grayed-out day from the previous/next month (visible at the
  // edges of the grid) picks that date but leaves the header showing the
  // wrong month, and any external change to `value` wouldn't re-center the
  // calendar either.
  useEffect(() => {
    setCursor((prev) => (isSameMonth(prev, selected) ? prev : startOfMonth(selected)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const gridStart = startOfWeek(startOfMonth(cursor));
  const gridEnd = endOfWeek(endOfMonth(cursor));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor((c) => subMonths(c, 1))}
          className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        <p className="text-sm font-bold text-navy">{format(cursor, "MMMM yyyy")}</p>
        <button
          type="button"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical"
          aria-label="Next month"
        >
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const inMonth = isSameMonth(day, cursor);
          const disabled = isBefore(day, minDate) && !isSameDay(day, minDate);
          const isSelected = isSameDay(day, selected);
          const busyCount = busyDates[dateStr] ?? 0;
          return (
            <button
              key={dateStr}
              type="button"
              disabled={disabled}
              onClick={() => onChange(dateStr)}
              aria-pressed={isSelected}
              aria-label={format(day, "EEEE d MMMM yyyy")}
              className={`relative rounded-md py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-medical ${
                disabled
                  ? "cursor-not-allowed text-slate-300"
                  : !inMonth
                  ? "text-slate-300 hover:bg-slate-50"
                  : isSelected
                  ? "bg-medical text-white"
                  : "text-navy hover:bg-medical-light"
              }`}
            >
              {format(day, "d")}
              {busyCount > 0 && !disabled && (
                <span
                  className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                    isSelected ? "bg-white" : "bg-amber-500"
                  }`}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Compact field showing the selected date, opening AppointmentCalendar's
 * month grid as a popover on click instead of rendering it inline/always
 * expanded — same date-selection behavior, far less vertical space.
 */
export function DatePickerField({
  value,
  onChange,
  minDate = startOfToday(),
  busyDates = {},
  label = "Choose a date",
}: {
  value: string; // yyyy-MM-dd
  onChange: (date: string) => void;
  minDate?: Date;
  busyDates?: Record<string, number>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const selected = parseDateOnly(value);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        className="input flex w-full items-center justify-between gap-2 text-left"
      >
        <span>{format(selected, "EEE d MMM yyyy")}</span>
        <CalendarIcon size={16} className="shrink-0 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-72 max-w-[calc(100vw-2rem)]">
          <AppointmentCalendar
            value={value}
            onChange={(d) => {
              onChange(d);
              setOpen(false);
            }}
            minDate={minDate}
            busyDates={busyDates}
          />
        </div>
      )}
    </div>
  );
}
