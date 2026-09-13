import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Grundgebühr + Preis pro Mitarbeiter (siehe src/lib/plans.ts für die
// dazugehörige Preisformel, muss mit diesen IDs übereinstimmen).
// Grundgebühr-Price am 14.07. von 29€ auf 19€ Price-ID gewechselt (alte
// 29€-Price ist in Stripe archiviert, nicht gelöscht).
const BASE_FEE_PRICE_ID = "price_1Tt5hSRoktFw8HCnwAy5U1I0";
const PER_EMPLOYEE_PRICE_ID = "price_1TstyTRoktFw8HCnvWdYVNda";

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

    // Vorher: company_id kam ungeprueft aus dem Request Body, jeder
    // eingeloggte oder gar nicht eingeloggte Aufrufer konnte eine Checkout
    // Session fuer eine fremde Firma auslösen. Gleiche Absicherung wie in
    // sync-subscription-seats/index.ts: nur der eingeloggte Owner der
    // eigenen Firma darf fuer sie eine Session erzeugen.
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { company_id } = await req.json();

    if (!company_id) {
      return new Response(JSON.stringify({ error: "Ungültige Parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, owner_id")
      .eq("id", company_id)
      .maybeSingle();

    if (companyError || !company || company.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert für diese Firma" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // employee_count nicht mehr vom Client übernehmen (liess sich beliebig
    // klein angeben, um die Abo-Grundlage künstlich niedrig zu halten),
    // sondern die tatsächliche Mitarbeiterzahl serverseitig zaehlen, genau
    // wie in sync-subscription-seats/index.ts.
    const { count, error: countError } = await supabaseAdmin
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id);

    if (countError) throw countError;

    const employeeCount = Math.max(1, count ?? 1);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
      apiVersion: "2024-04-10",
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        { price: BASE_FEE_PRICE_ID, quantity: 1 },
        { price: PER_EMPLOYEE_PRICE_ID, quantity: employeeCount },
      ],
      success_url: "https://meizo.de/dashboard?payment=success",
      cancel_url: "https://meizo.de/dashboard?payment=cancelled",
      metadata: { company_id, employee_count: String(employeeCount) },
      // Metadata zusätzlich auf das Abo selbst spiegeln (nicht nur auf die
      // Checkout Session) — hilfreich als Fallback beim Nachschlagen in
      // Stripe direkt, auch wenn stripe-webhook primär über die auf
      // companies gespeicherte stripe_subscription_id zuordnet.
      subscription_data: { metadata: { company_id } },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
