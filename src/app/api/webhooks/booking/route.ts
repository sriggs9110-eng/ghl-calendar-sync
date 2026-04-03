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

    // Extract calendar ID from payload
    const calendarId =
      payload.calendar_id || payload.calendarId || payload.calenderId;

    if (!calendarId || !ALLOWED_CALENDAR_IDS.includes(calendarId)) {
      console.log(
        `Skipping: calendar ${calendarId} not in allowed list [${ALLOWED_CALENDAR_IDS.join(", ")}]`
      );
      return NextResponse.json(
        {
          skipped: true,
          debug: {
            received_calendar_id: calendarId,
            allowed_ids: ALLOWED_CALENDAR_IDS,
            payload_keys: Object.keys(payload),
            full_payload: payload,
          },
        },
        { status: 200 }
      );
    }

    // Extract contact info — grab every address-related field
    const contact = payload.contact || {};
    const contactName =
      contact.name ||
      `${contact.first_name || contact.firstName || ""} ${contact.last_name || contact.lastName || ""}`.trim() ||
      "Unknown";

    const phone =
      contact.phone || contact.phoneNumber || contact.phone_number || "";
    const email = contact.email || "";

    // Address fields — try multiple possible field names from GHL
    const street =
      contact.address1 ||
      contact.street ||
      contact.streetAddress ||
      contact.address ||
      "";
    const unit =
      contact.address2 ||
      contact.unit ||
      contact.addressLine2 ||
      contact.suite ||
      "";
    const city = contact.city || "";
    const state = contact.state || contact.province || "";
    const zip =
      contact.postal_code ||
      contact.postalCode ||
      contact.zip ||
      contact.zipCode ||
      "";

    const calendarName =
      payload.calendar_name ||
      payload.calendarName ||
      payload.calendar?.name ||
      "Unknown Calendar";
    const assignedUser =
      payload.assigned_user ||
      payload.assignedTo ||
      payload.user?.name ||
      "";
    const appointmentId =
      payload.appointment_id ||
      payload.appointmentId ||
      payload.id ||
      "";
    const startTime =
      payload.start_time ||
      payload.startTime ||
      payload.appointment?.start_time ||
      "";
    const endTime =
      payload.end_time ||
      payload.endTime ||
      payload.appointment?.end_time ||
      "";

    // Build full address string
    const addressParts = [street, city, state, zip].filter(Boolean);
    const fullAddress = addressParts.join(", ") || "Not provided";

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
    console.error("Error processing booking webhook:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
