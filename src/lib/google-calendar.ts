import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function getAuth() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(
    /\\n/g,
    "\n"
  );

  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: SCOPES,
  });
}

function getCalendar() {
  return google.calendar({ version: "v3", auth: getAuth() });
}

const calendarId = process.env.GOOGLE_CALENDAR_ID!;

export interface EventDetails {
  summary: string;
  description: string;
  startTime: string;
  endTime: string;
  timeZone?: string;
}

export async function createEvent(details: EventDetails) {
  try {
    const calendar = getCalendar();
    const response = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: details.summary,
        description: details.description,
        start: {
          dateTime: details.startTime,
          timeZone: details.timeZone || "America/Chicago",
        },
        end: {
          dateTime: details.endTime,
          timeZone: details.timeZone || "America/Chicago",
        },
      },
    });
    console.log("Google Calendar event created:", response.data.id);
    return response.data;
  } catch (error) {
    console.error("Failed to create Google Calendar event:", error);
    throw error;
  }
}

export async function updateEvent(
  eventId: string,
  details: Partial<EventDetails>
) {
  try {
    const calendar = getCalendar();
    const requestBody: Record<string, unknown> = {};

    if (details.summary) requestBody.summary = details.summary;
    if (details.description) requestBody.description = details.description;
    if (details.startTime) {
      requestBody.start = {
        dateTime: details.startTime,
        timeZone: details.timeZone || "America/Chicago",
      };
    }
    if (details.endTime) {
      requestBody.end = {
        dateTime: details.endTime,
        timeZone: details.timeZone || "America/Chicago",
      };
    }

    const response = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody,
    });
    console.log("Google Calendar event updated:", eventId);
    return response.data;
  } catch (error) {
    console.error("Failed to update Google Calendar event:", error);
    throw error;
  }
}

export async function deleteEvent(eventId: string) {
  try {
    const calendar = getCalendar();
    await calendar.events.delete({
      calendarId,
      eventId,
    });
    console.log("Google Calendar event deleted:", eventId);
  } catch (error) {
    console.error("Failed to delete Google Calendar event:", error);
    throw error;
  }
}
