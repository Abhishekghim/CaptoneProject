"use client";

import React, { useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isBefore,
  isSameDay, isSameMonth, startOfMonth, startOfToday, startOfWeek, subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
