import { NextRequest, NextResponse } from "next/server";
import { updateEvent, deleteEvent } from "@/lib/google-calendar";
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
      "=== GHL Appointment Status Changed Payload ===",
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

    const status = (
      calendar.status ||
      calendar.appoinmentStatus ||
      payload.status ||
      ""
    ).toLowerCase();
    const appointmentId = calendar.appointmentId || "";

    if (!appointmentId) {
      console.error("No appointment ID found in payload");
      return NextResponse.json(
        { error: "Missing appointment ID" },
        { status: 400 }
      );
    }

    // Look up the mapping
    const { data: mapping, error: lookupError } = await getSupabase()
      .from("event_mappings")
      .select("*")
      .eq("ghl_appointment_id", appointmentId)
      .single();

    if (lookupError || !mapping) {
      console.error(
        `No mapping found for appointment ${appointmentId}:`,
        lookupError
      );
      return NextResponse.json(
        { error: "No mapping found for this appointment" },
        { status: 404 }
      );
    }

    if (status === "cancelled" || status === "canceled") {
      // Delete Google Calendar event
      await deleteEvent(mapping.google_event_id);

      // Delete the Supabase row
      const { error: deleteError } = await getSupabase()
        .from("event_mappings")
        .delete()
        .eq("ghl_appointment_id", appointmentId);

      if (deleteError) {
        console.error("Failed to delete mapping from Supabase:", deleteError);
      }

      console.log(
        `Cancelled: deleted Google event ${mapping.google_event_id} for appointment ${appointmentId}`
      );
      return NextResponse.json(
        { success: true, action: "deleted" },
        { status: 200 }
      );
    }

    if (status === "rescheduled") {
      const startTime = calendar.startTime || "";
      const endTime = calendar.endTime || "";
      const timeZone = calendar.selectedTimezone || "America/Chicago";

      if (!startTime || !endTime) {
        console.error("Rescheduled but missing new start/end time");
        return NextResponse.json(
          { error: "Missing start or end time for reschedule" },
          { status: 400 }
        );
      }

      await updateEvent(mapping.google_event_id, {
        startTime,
        endTime,
        timeZone,
      });

      console.log(
        `Rescheduled: updated Google event ${mapping.google_event_id} for appointment ${appointmentId}`
      );
      return NextResponse.json(
        { success: true, action: "updated" },
        { status: 200 }
      );
    }

    console.log(`Unhandled status: ${status} for appointment ${appointmentId}`);
    return NextResponse.json(
      { skipped: true, reason: `Unhandled status: ${status}` },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error processing status change webhook:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
