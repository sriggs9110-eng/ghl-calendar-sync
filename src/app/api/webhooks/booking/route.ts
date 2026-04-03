import { NextRequest, NextResponse } from "next/server";
import { createEvent } from "@/lib/google-calendar";
import { getSupabase } from "@/lib/supabase";
import { validateWebhook } from "@/lib/validate-webhook";

const ALLOWED_CALENDAR_IDS = (
  process.env.ALLOWED_CALENDAR_IDS || "6qCyBhSZLg6GdnN9EFaa"
)
  .split(",")
  .map((id) => id.trim());

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-ghl-signature");

    if (!validateWebhook(rawBody, signature)) {
      console.error("Webhook signature validation failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    // Log the FULL incoming payload for inspection
    console.log(
      "=== GHL Customer Booked Appointment Payload ===",
      JSON.stringify(payload, null, 2)
    );

    // GHL nests calendar data under payload.calendar
    const calendar = payload.calendar || {};
    const calendarId = calendar.id;

    if (!calendarId || !ALLOWED_CALENDAR_IDS.includes(calendarId)) {
      console.log(
        `Skipping: calendar ${calendarId} not in allowed list [${ALLOWED_CALENDAR_IDS.join(", ")}]`
      );
      return NextResponse.json({ skipped: true }, { status: 200 });
    }

    // Contact info is at the top level of the payload
    const contactName = payload.full_name || "Unknown";
    const phone = payload.phone || "";
    const email = payload.email || "";

    // Address fields — top level
    const street = payload.address1 || "";
    const city = payload.city || "";
    const state = payload.state || "";
    const zip = payload.postal_code || "";
    const unit = payload["Unit #"] || "";

    const calendarName = calendar.calendarName || "Unknown Calendar";
    const user = payload.user || {};
    const assignedUser =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || "";

    const appointmentId = calendar.appointmentId || "";
    const startTime = calendar.startTime || "";
    const endTime = calendar.endTime || "";
    const timeZone = calendar.selectedTimezone || "America/Chicago";

    // Build full address string
    const addressParts = [street, city, state, zip].filter(Boolean);
    const fullAddress =
      payload.full_address || addressParts.join(", ") || "Not provided";

    // Build description
    const descriptionLines = [
      `Phone: ${phone || "Not provided"}`,
      `Email: ${email || "Not provided"}`,
      `Full Address: ${fullAddress}`,
    ];
    if (unit) {
      descriptionLines.push(`Unit: ${unit}`);
    }
    descriptionLines.push(
      `Assigned to: ${assignedUser || "Not assigned"}`,
      `Calendar: ${calendarName}`
    );

    const description = descriptionLines.join("\n");
    const summary = `${calendarName} - ${contactName}`;

    // Create Google Calendar event
    const event = await createEvent({
      summary,
      description,
      startTime,
      endTime,
      timeZone,
    });

    // Store mapping in Supabase
    const { error: dbError } = await getSupabase()
      .from("event_mappings")
      .insert({
        ghl_appointment_id: appointmentId,
        google_event_id: event.id,
        calendar_name: calendarName,
        contact_name: contactName,
      });

    if (dbError) {
      console.error("Failed to store event mapping in Supabase:", dbError);
    }

    return NextResponse.json(
      { success: true, google_event_id: event.id },
      { status: 200 }
    );
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message : JSON.stringify(error);
    console.error("Error processing booking webhook:", error);
    return NextResponse.json(
      { error: "Internal server error", detail: errMsg },
      { status: 500 }
    );
  }
}
