import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Oeffentlich aufrufbar (verify_jwt=false bei Deploy) — es gibt zu diesem
// Zeitpunkt noch keinen eingeloggten Nutzer, der Mitarbeiter legt sein
// Konto ja gerade erst an. Abgesichert ist das ausschliesslich ueber den
// Einladungscode selbst: einmalig nutzbar, 14 Tage gueltig, siehe Migration
// 047_add_employee_invites.
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

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!code || !email || !password) {
      return new Response(
        JSON.stringify({ error: "code, email und password erforderlich" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Passwort muss mindestens 6 Zeichen haben" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Mitarbeiter-Datensatz nochmal frisch laden — falls der Chef
    // zwischenzeitlich doch schon selbst einen Account fuer ihn angelegt
    // oder er den Einladungslink zweimal gleichzeitig geoeffnet hat.
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

    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      if (createError.message?.includes("already been registered")) {
        return new Response(
          JSON.stringify({ error: "email_taken", message: "Diese E-Mail ist bereits registriert." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw createError;
    }

    const newUserId = userData.user.id;

    await supabaseAdmin.from("profiles").upsert({ id: newUserId, role: "employee" });
    await supabaseAdmin.from("employees").update({ user_id: newUserId }).eq("id", employee.id);
    // Einmalnutzung: sobald das Konto steht, ist der Code verbraucht, auch
    // wenn danach noch etwas schiefgeht — ein halb verbrauchter Code soll
    // nicht ein zweites Mal funktionieren.
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
