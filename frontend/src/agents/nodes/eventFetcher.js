/**
 * Node 3 — Event Fetcher
 * Fetches Google Calendar events in a smart time window based on task deadlines.
 * Calls Google Calendar API directly from FE using the OAuth token.
 */

import { fetchEvents } from '../googleCalendarApi.js';

const BUFFER_DAYS = 30;

/**
 * Compute the time window for fetching calendar events.
 * Window = [earliest task deadline, earliest deadline + BUFFER_DAYS]
 * Falls back to [today, today + BUFFER_DAYS] if no deadlines found.
 *
 * @param {Array} myTasks
 * @returns {{ timeMin: Date, timeMax: Date }}
 */
export const computeTimeWindow = (myTasks) => {
  const timestamps = myTasks
    .map(t => {
      if (!t.deadline) return NaN;
      const d = new Date(
        // Normalize DD/MM/YYYY → YYYY-MM-DD for Date constructor
        String(t.deadline).replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1')
                          .replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$2-$1')
      );
      return isNaN(d.getTime()) ? NaN : d.getTime();
    })
    .filter(ts => !isNaN(ts));

  const timeMin = timestamps.length > 0
    ? new Date(Math.min(...timestamps))
    : new Date();

  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + BUFFER_DAYS);

  return { timeMin, timeMax };
};

/**
 * Fetch relevant Google Calendar events for the given tasks.
 * @param {string} googleToken - OAuth access token
 * @param {Array} myTasks
 * @returns {Promise<Array>} - Existing GCal events in the time window
 */
export const fetchRelevantEvents = async (googleToken, myTasks) => {
  if (myTasks.length === 0) return [];

  const { timeMin, timeMax } = computeTimeWindow(myTasks);
  return fetchEvents(googleToken, timeMin, timeMax);
};
