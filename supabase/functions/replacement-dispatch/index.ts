import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// How long a candidate has to respond before we move on to the next one.
const RESPONSE_WINDOW_MINUTES = 5;

// Heuristic legal-compliance guardrails — NOT a certified compliance check.
// German ArbZG allows up to 10h/day if averaged down to 8h/day over 6 months,
// and requires an 11h rest period between shifts. We use a simpler, more
// conservative approximation: 48h/week cap + a hard 11h rest period.
const MAX_WEEKLY_MINUTES = 48 * 60;
const MIN_REST_MINUTES = 11 * 60;

interface AssignmentRow {
  id: string;
  employee_id: string;
  property_id: string;
  date: string;
  status: string;
  time_from: string | null;
  time_to: string | null;
  property?: { time_from: string; time_to: string } | null;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function effectiveWindow(a: AssignmentRow): { from: number; to: number } | null {
  const from = a.time_from ?? a.property?.time_from;
  const to = a.time_to ?? a.property?.time_to;
  if (!from || !to) return null;
  return { from: toMinutes(from), to: toMinutes(to) };
}

function weekBounds(dateStr: string): { start: string; end: string } {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().split("T")[0], end: sunday.toISOString().split("T")[0] };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // 1. Sick reports covering today
    const { data: sickReports, error: sickErr } = await admin
      .from("sick_reports")
      .select("id, employee_id, date, date_to")
      .lte("date", todayStr);
    if (sickErr) throw new Error(`sick_reports: ${sickErr.message}`);

    const activeSickReports = (sickReports ?? []).filter((sr: { date: string; date_to: string | null }) => {
      const end = sr.date_to ?? sr.date;
      return todayStr <= end;
    });

    if (activeSickReports.length === 0) {
      return new Response(JSON.stringify({ ok: true, dispatched: 0, escalated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let dispatched = 0;
    let escalated = 0;

    for (const sr of activeSickReports as Array<{ id: string; employee_id: string }>) {
      // Find the sick employee's affected assignment today (not yet handled)
      const { data: affected } = await admin
        .from("assignments")
        .select("id, employee_id, property_id, date, status, time_from, time_to, property:properties(name, time_from, time_to, company_id)")
        .eq("employee_id", sr.employee_id)
        .eq("date", todayStr)
        .eq("status", "assigned")
        .limit(1)
        .maybeSingle();

      if (!affected) continue; // no coverage needed for this sick report today

      const property = affected.property as unknown as { name: string; time_from: string; time_to: string; company_id: string } | null;
      if (!property) continue;

      // Already resolved?
      const { data: accepted } = await admin
        .from("replacement_requests")
        .select("id")
        .eq("sick_report_id", sr.id)
        .eq("status", "accepted")
        .limit(1)
        .maybeSingle();
      if (accepted) continue;

      // Current auto-dispatch cascade state (only rows we created, i.e. expires_at is set)
      const { data: history } = await admin
        .from("replacement_requests")
        .select("id, status, replacement_employee_id, expires_at, created_at")
        .eq("sick_report_id", sr.id)
        .not("expires_at", "is", null)
        .order("created_at", { ascending: false });

      const current = (history ?? [])[0];

      if (current && current.status === "pending") {
        if (new Date(current.expires_at as string) > now) {
          continue; // still waiting for this candidate to respond
        }
        // Timed out — mark declined and fall through to dispatch the next one
        await admin.from("replacement_requests").update({ status: "declined" }).eq("id", current.id);
        escalated++;
      }

      const alreadyTried = new Set((history ?? []).map((h: { replacement_employee_id: string }) => h.replacement_employee_id));

      // Candidate pool: active employees of the same company, excluding the
      // sick employee and anyone already tried for this sick report.
      const { data: employees } = await admin
        .from("employees")
        .select("id, first_name, last_name, status, company_id")
        .eq("company_id", property.company_id)
        .eq("status", "active")
        .neq("id", sr.employee_id);

      const pool = (employees ?? []).filter((e: { id: string }) => !alreadyTried.has(e.id));
      if (pool.length === 0) continue; // no more candidates — owner sees this in the dashboard

      const shiftWindow = effectiveWindow(affected as AssignmentRow);
      if (!shiftWindow) continue;

      // Property familiarity
      const { data: knownProps } = await admin
        .from("employee_properties")
        .select("employee_id, property_id")
        .eq("property_id", affected.property_id);
      const knowsProperty = new Set((knownProps ?? []).filter((k: { property_id: string }) => k.property_id === affected.property_id).map((k: { employee_id: string }) => k.employee_id));

      // Today's other assignments for all candidates (for conflict + fairness-ish availability)
      const { data: todaysAssignments } = await admin
        .from("assignments")
        .select("id, employee_id, date, status, time_from, time_to, property:properties(time_from, time_to)")
        .eq("date", todayStr)
        .neq("status", "cancelled");

      // Fairness: how many times has each candidate been asked (any sick report) in the last 30 days
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
      const { data: recentAsks } = await admin
        .from("replacement_requests")
        .select("replacement_employee_id")
        .gte("created_at", thirtyDaysAgo);
      const askCounts = new Map<string, number>();
      for (const r of recentAsks ?? []) {
        const id = (r as { replacement_employee_id: string }).replacement_employee_id;
        askCounts.set(id, (askCounts.get(id) ?? 0) + 1);
      }

      // Weekly hours per candidate (for the legal-compliance heuristic)
      const { start, end } = weekBounds(todayStr);
      const { data: weekAssignments } = await admin
        .from("assignments")
        .select("employee_id, date, status, time_from, time_to, property:properties(time_from, time_to)")
        .gte("date", start)
        .lte("date", end)
        .in("status", ["assigned", "checked_in", "completed"]);

      // All assignments (for rest-period check, a wider window around today)
      const weekBefore = new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
      const weekAfter = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];
      const { data: nearbyAssignments } = await admin
        .from("assignments")
        .select("employee_id, date, status, time_from, time_to, property:properties(time_from, time_to)")
        .gte("date", weekBefore)
        .lte("date", weekAfter)
        .neq("status", "cancelled");

      const isEligible = (employeeId: string): boolean => {
        // Same-day time conflict
        const todaysForCandidate = (todaysAssignments ?? []).filter(
          (a: { employee_id: string }) => a.employee_id === employeeId
        ) as AssignmentRow[];
        for (const a of todaysForCandidate) {
          const w = effectiveWindow(a);
          if (w && w.from < shiftWindow.to && shiftWindow.from < w.to) return false; // overlaps
        }

        // Weekly hours heuristic
        const weekForCandidate = (weekAssignments ?? []).filter(
          (a: { employee_id: string }) => a.employee_id === employeeId
        ) as AssignmentRow[];
        let weeklyMinutes = shiftWindow.to - shiftWindow.from;
        for (const a of weekForCandidate) {
          const w = effectiveWindow(a);
          if (w) weeklyMinutes += w.to - w.from;
        }
        if (weeklyMinutes > MAX_WEEKLY_MINUTES) return false;

        // Rest-period heuristic: look at the candidate's nearest shift before
        // and after this one and ensure an 11h gap on both sides.
        const nearbyForCandidate = (nearbyAssignments ?? []).filter(
          (a: { employee_id: string }) => a.employee_id === employeeId
        ) as AssignmentRow[];
        const shiftStart = new Date(`${todayStr}T00:00:00Z`).getTime() + shiftWindow.from * 60000;
        const shiftEnd = new Date(`${todayStr}T00:00:00Z`).getTime() + shiftWindow.to * 60000;
        for (const a of nearbyForCandidate) {
          const w = effectiveWindow(a);
          if (!w) continue;
          const aStart = new Date(`${a.date}T00:00:00Z`).getTime() + w.from * 60000;
          const aEnd = new Date(`${a.date}T00:00:00Z`).getTime() + w.to * 60000;
          if (aEnd <= shiftStart) {
            const gapMin = (shiftStart - aEnd) / 60000;
            if (gapMin < MIN_REST_MINUTES) return false;
          } else if (aStart >= shiftEnd) {
            const gapMin = (aStart - shiftEnd) / 60000;
            if (gapMin < MIN_REST_MINUTES) return false;
          }
        }
        return true;
      };

      const eligiblePool = pool.filter((e: { id: string }) => isEligible(e.id));
      if (eligiblePool.length === 0) continue; // nobody eligible right now — owner should check manually

      const ranked = eligiblePool.slice().sort((a: { id: string }, b: { id: string }) => {
        const aKnows = knowsProperty.has(a.id) ? 1 : 0;
        const bKnows = knowsProperty.has(b.id) ? 1 : 0;
        if (aKnows !== bKnows) return bKnows - aKnows;
        const aAsks = askCounts.get(a.id) ?? 0;
        const bAsks = askCounts.get(b.id) ?? 0;
        return aAsks - bAsks; // fewer recent asks first (fairness rotation)
      });

      const candidate = ranked[0] as { id: string; first_name: string; last_name: string };
      const expiresAt = new Date(now.getTime() + RESPONSE_WINDOW_MINUTES * 60000).toISOString();
      const message = `Kannst du heute ${property.time_from?.slice(0, 5) ?? ""}–${property.time_to?.slice(0, 5) ?? ""} Uhr ${property.name} übernehmen? Ein Kollege ist krank. Bitte antworte innerhalb von ${RESPONSE_WINDOW_MINUTES} Minuten.`;

      const { error: insertErr } = await admin.from("replacement_requests").insert({
        sick_report_id: sr.id,
        property_id: affected.property_id,
        replacement_employee_id: candidate.id,
        status: "pending",
        message,
        channel: "app",
        expires_at: expiresAt,
      });
      if (insertErr) continue;

      try {
        await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({
            employee_id: candidate.id,
            title: "Einspringen?",
            body: message,
            data: { type: "replacement_request" },
          }),
        });
      } catch {
        // Push failing shouldn't block the dispatch — the employee still
        // sees the request the next time they open the app.
      }

      dispatched++;
    }

    return new Response(JSON.stringify({ ok: true, dispatched, escalated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
