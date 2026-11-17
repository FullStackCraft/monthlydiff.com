import { publication } from "./theme";

export const calendarYear = 2027;

const fullDate = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeZone: publication.timeZone,
});

const monthName = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  timeZone: publication.timeZone,
});

const weekday = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: publication.timeZone,
});

export function civilDate(year: number, monthIndex: number, day: number) {
  // Use UTC noon for date-only values, safely within the same civil day in Vienna.
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

export function formatDate(isoDate: string) {
  return fullDate.format(new Date(`${isoDate}T12:00:00Z`));
}

export function issueNumber(number: number) {
  return String(number).padStart(3, "0");
}

export const weekdays = Array.from({ length: 7 }, (_, index) =>
  weekday.format(civilDate(2027, 0, 4 + index)),
);

export const schedule = Array.from({ length: 12 }, (_, monthIndex) => {
  const date = civilDate(calendarYear, monthIndex + 1, 0);
  const publishDate = date.toISOString().slice(0, 10);

  return {
    id: publishDate.slice(0, 7),
    number: monthIndex + 1,
    publishDate,
    month: monthName.format(date),
    firstDay: (civilDate(calendarYear, monthIndex, 1).getUTCDay() + 6) % 7,
    lastDay: date.getUTCDate(),
  };
});
