import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Kurzer, gut lesbarer Code: keine verwechselbaren Zeichen (0/O, 1/I/L),
// damit ein Chef ihn notfalls auch mündlich diktieren kann.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const INVITE_VALID_DAYS = 14;

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { employeeId } = await req.json();
    if (!employeeId) {
      return new Response(JSON.stringify({ error: "employeeId erforderlich" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mitarbeiter laden und pruefen, dass er wirklich zu einer Firma
    // gehoert, die diesem Aufrufer gehoert — sonst koennte jeder eingeloggte
    // Owner Einladungen fuer fremde Mitarbeiter erzeugen.
    const { data: employee, error: employeeError } = await supabaseAdmin
      .from("employees")
      .select("id, company_id, user_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError || !employee) {
      return new Response(JSON.stringify({ error: "Mitarbeiter nicht gefunden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, owner_id")
      .eq("id", employee.company_id)
      .maybeSingle();

    if (companyError || !company || company.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert für diesen Mitarbeiter" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (employee.user_id) {
      return new Response(
        JSON.stringify({ error: "Dieser Mitarbeiter hat bereits ein Konto" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Alte, noch nicht eingeloeste Einladungen fuer diesen Mitarbeiter
    // entfernen — es soll immer nur ein gueltiger Link im Umlauf sein, sonst
    // koennte ein alter, weitergegebener Link nach einer Neuerstellung
    // trotzdem noch funktionieren.
    await supabaseAdmin.from("employee_invites").delete().eq("employee_id", employeeId).is("used_at", null);

    let code = "";
    let inserted = false;
    // Kollisionen sind bei diesem Alphabet extrem unwahrscheinlich, aber
    // ein paar Versuche kosten nichts.
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      code = generateCode();
      const { error: insertError } = await supabaseAdmin.from("employee_invites").insert({
        employee_id: employeeId,
        company_id: employee.company_id,
        code,
        expires_at: new Date(Date.now() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (!insertError) inserted = true;
      else if (!insertError.message?.includes("duplicate")) throw insertError;
    }

    if (!inserted) {
      throw new Error("Einladungscode konnte nicht erzeugt werden, bitte erneut versuchen");
    }

    return new Response(
      JSON.stringify({ code, expires_in_days: INVITE_VALID_DAYS }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
