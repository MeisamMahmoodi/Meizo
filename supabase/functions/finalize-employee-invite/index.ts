import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Called by a freshly authenticated employee (own email/password, just
// confirmed via the 6-digit signup code) who does not have a profile yet.
// Replaces the old accept-employee-invite flow: that function created the
// auth account itself with email_confirm=true, so anyone with an invite
// code could type ANY email address and get an immediately-usable account
// under it, without ever proving they own that inbox. Now the account is
// created client-side via the normal supabase.auth.signUp() + verifyOtp()
// flow (same as owner registration), and this function only runs AFTER
// that email is verified — it just links the now-confirmed user to the
// employee record the invite points at.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Refuse if this account already has a profile (finalize already ran
    // once, or this user_id was linked some other way).
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (existingProfile) {
      return new Response(JSON.stringify({ error: "Konto ist bereits eingerichtet" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const code: string = (
      body.code ?? (user.user_metadata?.pending_invite_code as string | undefined) ?? ""
    ).trim().toUpperCase();

    if (!code) {
      return new Response(JSON.stringify({ error: "Einladungscode fehlt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("employee_invites")
      .select("id, employee_id, company_id, used_at, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Dieser Einladungscode wurde nicht gefunden." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (invite.used_at) {
      return new Response(
        JSON.stringify({ error: "used", message: "Diese Einladung wurde bereits verwendet." }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (new Date(invite.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "expired", message: "Diese Einladung ist abgelaufen." }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: employee } = await supabaseAdmin
      .from("employees")
      .select("id, user_id")
      .eq("id", invite.employee_id)
      .maybeSingle();

    if (!employee) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Zugehöriger Mitarbeiter wurde nicht gefunden." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (employee.user_id) {
      return new Response(
        JSON.stringify({ error: "already_linked", message: "Für diesen Mitarbeiter existiert bereits ein Konto." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin.from("profiles").insert({ id: user.id, role: "employee" });
    await supabaseAdmin.from("employees").update({ user_id: user.id }).eq("id", employee.id);
    // Einmalnutzung: sobald das Konto verknuepft ist, ist der Code
    // verbraucht, auch wenn danach noch etwas schiefgeht.
    await supabaseAdmin.from("employee_invites").update({ used_at: new Date().toISOString() }).eq("id", invite.id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "server_error", message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
