import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Called by a freshly authenticated user (email/password after confirming
// their address, or first Google login) who does not have a profile yet.
// Unlike create-owner-user (admin-only), this provisions the CALLER's own
// company — no admin role required, but it can only ever act on the
// caller's own auth.uid() and only once (a second call is rejected once a
// profile exists).
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

    if (!user.email) {
      return new Response(JSON.stringify({ error: "Konto hat keine E-Mail-Adresse" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Refuse if this account already has a profile (self-signup already
    // completed, or an admin/employee account was linked to this user).
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
    const companyName: string = (body.company_name ?? user.user_metadata?.pending_company_name ?? "").trim();
    const ownerName: string = (body.owner_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").trim();

    if (!companyName) {
      return new Response(JSON.stringify({ error: "Firmenname fehlt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabaseAdmin.from("profiles").insert({ id: user.id, role: "owner" });

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    const { error: companyError } = await supabaseAdmin.from("companies").insert({
      name: companyName,
      owner_name: ownerName,
      owner_email: user.email,
      owner_id: user.id,
      contract_start: new Date().toISOString(),
      trial_ends_at: trialEndsAt.toISOString().split("T")[0],
    });

    if (companyError) {
      // Roll back the profile row so a retry is possible.
      await supabaseAdmin.from("profiles").delete().eq("id", user.id);
      throw companyError;
    }

    return new Response(
      JSON.stringify({ message: "Konto eingerichtet" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
