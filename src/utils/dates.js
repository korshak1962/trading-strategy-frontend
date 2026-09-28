// src/utils/dates.js

/**
 * Integer key for a Date's local calendar day (YYYYMMDD), ignoring the time of day.
 * Two dates on the same calendar day get the same key, so start/end comparisons
 * made with it treat "same day" as valid regardless of the hour.
 * @param {Date} d
 * @returns {number}
 */
export const calendarDayKey = (d) =>
  d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
