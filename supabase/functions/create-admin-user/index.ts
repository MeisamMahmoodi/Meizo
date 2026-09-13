import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-bootstrap-secret",
};

// Bootstrap-Funktion zum (Neu-)Anlegen eines Admin-Kontos.
//
// Vorher: E-Mail und Passwort waren fest im Code hinterlegt
// (admin@meizo.app / Meizo@Admin2026), und die Funktion war ohne jede
// Authentifizierung aufrufbar. Jeder, der die Function-URL kannte, konnte
// sich damit jederzeit ein Admin-Konto mit diesem bekannten Passwort
// verschaffen bzw. dessen Passwort zurücksetzen.
//
// Jetzt: E-Mail/Passwort kommen aus dem Request-Body, nichts Sensibles mehr
// im Code oder in Git. Der Aufruf ist nur mit einem Secret erlaubt, das per
//   supabase secrets set ADMIN_BOOTSTRAP_SECRET=<zufaelliger-wert>
// gesetzt wird und niemals ins Repo kommt. Ohne passendes Secret gibt es nur
// ein generisches 401, keine weiteren Details.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const bootstrapSecret = Deno.env.get("ADMIN_BOOTSTRAP_SECRET");
    const providedSecret = req.headers.get("x-bootstrap-secret") ?? "";

    // Wenn kein Secret konfiguriert ist, bleibt die Funktion sicherheitshalber
    // komplett gesperrt, statt offen zu sein.
    if (!bootstrapSecret || providedSecret !== bootstrapSecret) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password || password.length < 12) {
      return new Response(
        JSON.stringify({ error: "email und password (min. 12 Zeichen) erforderlich" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;
    const existing = existingUsers?.users?.find((u: { email?: string }) => u.email === email);

    let adminId: string;

    if (existing) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, { password });
      if (updateError) throw updateError;
      adminId = existing.id;
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      adminId = data.user.id;
    }

    const { error: upsertError } = await supabaseAdmin.from("profiles").upsert({ id: adminId, role: "admin" });
    if (upsertError) throw upsertError;

    // Das Passwort wird bewusst nicht in der Antwort gespiegelt, es wurde ja
    // im Request selbst vom Aufrufer vorgegeben.
    return new Response(
      JSON.stringify({ message: "Admin user ready", email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
