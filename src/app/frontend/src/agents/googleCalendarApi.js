/**
 * Google Calendar REST API wrapper.
 * FE calls Google Calendar directly using the OAuth access token.
 * Token is passed per-call — never stored here.
 */

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

const gcalFetch = async (token, path, options = {}) => {
  const res = await fetch(`${GCAL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    throw new Error('GOOGLE_TOKEN_EXPIRED');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GCAL_ERROR_${res.status}: ${body}`);
  }

  // 204 No Content (DELETE) has no body
  if (res.status === 204) return null;
  return res.json();
};

/**
 * Fetch calendar events within a time window.
 * @param {string} token - Google OAuth access token
 * @param {Date} timeMin
 * @param {Date} timeMax
 * @returns {Promise<Array>} - Array of Google Calendar event objects
 */
export const fetchEvents = async (token, timeMin, timeMax) => {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });

  const data = await gcalFetch(token, `/calendars/primary/events?${params}`);
  return data?.items || [];
};

/**
 * Create a new calendar event.
 * @param {string} token
 * @param {object} eventBody - Google Calendar event body
 * @returns {Promise<object>} - Created event object
 */
export const createEvent = async (token, eventBody) => {
  return gcalFetch(token, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(eventBody),
  });
};

/**
 * Update (PATCH) an existing calendar event's summary and description.
 * Does NOT change the date.
 * @param {string} token
 * @param {string} eventId
 * @param {object} patch - Fields to update: { summary?, description? }
 * @returns {Promise<object>} - Updated event object
 */
export const patchEvent = async (token, eventId, patch) => {
  return gcalFetch(token, `/calendars/primary/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
};

/**
 * Delete an existing calendar event.
 * @param {string} token
 * @param {string} eventId
 * @returns {Promise<null>}
 */
export const deleteEvent = async (token, eventId) => {
  return gcalFetch(token, `/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
  });
};

/**
 * Build a Google Calendar event body from a task object.
 * @param {object} task - { title, description, deadline, assignee, note }
 * @returns {object} - Google Calendar event body
 */
export const buildEventBody = (task) => {
  const title = task.title?.trim() || 'Action Item';
  const parts = [
    task.description || '',
    task.assignee ? `Owner: ${task.assignee}` : '',
    task.note ? `Note: ${task.note}` : '',
  ].filter(Boolean);
  const description = parts.join('\n\n');

  // Parse deadline into Google Calendar date/dateTime format
  const startTime = parseDeadlineForGcal(task.deadline);

  let start, end;
  if (startTime.type === 'date') {
    const endDate = new Date(startTime.value);
    endDate.setDate(endDate.getDate() + 1);
    start = { date: startTime.value };
    end = { date: endDate.toISOString().split('T')[0] };
  } else {
    const startDt = new Date(startTime.value);
    const endDt = new Date(startDt.getTime() + 60 * 60 * 1000); // +1 hour
    start = { dateTime: startDt.toISOString(), timeZone: 'Asia/Ho_Chi_Minh' };
    end = { dateTime: endDt.toISOString(), timeZone: 'Asia/Ho_Chi_Minh' };
  }

  return {
    summary: title,
    description,
    start,
    end,
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 30 }],
    },
  };
};

/**
 * Parse a deadline string into a GCal-compatible date or dateTime.
 * Supported formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, ISO datetime
 */
const parseDeadlineForGcal = (deadline) => {
  if (!deadline) {
    // Default: tomorrow at 09:00 ICT
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return { type: 'dateTime', value: tomorrow.toISOString() };
  }

  const s = String(deadline).trim();

  // ISO datetime
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    return { type: 'dateTime', value: s };
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { type: 'date', value: s };
  }

  // DD/MM/YYYY
  const dmY = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmY) return { type: 'date', value: `${dmY[3]}-${dmY[2]}-${dmY[1]}` };

  // DD-MM-YYYY
  const dmYd = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmYd) return { type: 'date', value: `${dmYd[3]}-${dmYd[2]}-${dmYd[1]}` };

  // Fallback: tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return { type: 'dateTime', value: tomorrow.toISOString() };
};
