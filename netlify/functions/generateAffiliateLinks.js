// netlify/functions/generateAffiliateLinks.js
// Robust Netlify function to generate partner affiliate links for a destination
// - Works with CJS or ESM Supabase client (dynamic fallback)
// - Uses CommonJS exports.handler so Netlify detects it reliably
// - Lots of console logs for debugging
// - Upserts affiliates and partner_affiliate_links

// NOTE: keep this file in netlify/functions/generateAffiliateLinks.js and redeploy

// --------------------------------------------
// Affiliate config (add more partners as needed)
// --------------------------------------------
const AFFILIATE_CONFIG = {
  marker: "466615",
  trs: "252990",
  lp_ref: "5103006.jxkDNNdC6D",

  partners: {
    booking: {
      name: "Booking.com",
      baseUrl: "https://tp.media/r",
      campaign_id: "84",
      partner_id: "2076",
      logo_url:
        "https://content.skyscnr.com/m/78f2269827c54383/original/bookingcom-logo.png",
    },
    expedia: {
      name: "Expedia",
      baseUrl: "https://tp.media/r",
      campaign_id: "594",
      partner_id: "8645",
      logo_url:
        "https://upload.wikimedia.org/wikipedia/commons/8/89/Expedia_Logo.svg",
    },
    getyourguide: {
      name: "GetYourGuide",
      baseUrl: "https://tp.media/r",
      campaign_id: "137",
      partner_id: "6789",
      logo_url:
        "https://upload.wikimedia.org/wikipedia/commons/f/f2/GetYourGuide_logo.svg",
    },
    tripadvisor: {
      name: "Tripadvisor",
      baseUrl: "https://tp.media/r",
      campaign_id: "138",
      partner_id: "6781",
      logo_url:
        "https://upload.wikimedia.org/wikipedia/commons/6/6f/Tripadvisor_Logo.svg",
    },
    lonelyplanet: {
      name: "Lonely Planet",
      baseUrl: "https://www.lonelyplanet.com/articles",
      logo_url:
        "https://upload.wikimedia.org/wikipedia/commons/4/4b/Lonely_Planet_Logo.svg",
      deep_link_template:
        "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program",
    },
  },
};

// --------------------------------------------
// Helper: Build a Travelpayouts deep link
// --------------------------------------------
function buildTpLink({ baseUrl, marker, trs, partner_id, campaign_id, targetUrl }) {
  const encoded = encodeURIComponent(targetUrl);
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encoded}&campaign_id=${campaign_id}`;
}

// --------------------------------------------
// Helper: create supabase client with dynamic import fallback
// --------------------------------------------
async function getSupabaseClient() {
  // NOTE: we purposely avoid top-level import so this file runs reliably in both
  // CJS and ESM environments on Netlify.
  try {
    // Try require first (CommonJS)
    const supabasePkg = require("@supabase/supabase-js");
    if (!supabasePkg || !supabasePkg.createClient) {
      throw new Error("require('@supabase/supabase-js') returned unexpected shape");
    }
    const { createClient } = supabasePkg;
    console.log("[generateAffiliateLinks] Using require() for @supabase/supabase-js");
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  } catch (reqErr) {
    console.log("[generateAffiliateLinks] require() failed, attempting dynamic import...", reqErr.message);
    try {
      const supabaseModule = await import("@supabase/supabase-js");
      const { createClient } = supabaseModule;
      console.log("[generateAffiliateLinks] Using dynamic import() for @supabase/supabase-js");
      return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    } catch (impErr) {
      console.error("[generateAffiliateLinks] Failed to import @supabase/supabase-js", impErr);
      throw impErr;
    }
  }
}

// --------------------------------------------
// Main handler
// --------------------------------------------
exports.handler = async function (event, context) {
  // Add abundant logging for Netlify function logs
  console.log("=== generateAffiliateLinks START ===");
  console.log("HTTP method:", event?.httpMethod || event?.method || "unknown");
  console.log("Raw event.queryStringParameters:", event.queryStringParameters);

  const params = event.queryStringParameters || {};
  const slug = params.slug || params.destination_slug || "";
  const name = params.name || params.destination || "";
  const city = params.city || params.city_name || "";
  const country = params.country || params.country_name || "";
  const debug = params.debug === "true" || params.debug === "1";

  // Validate environment variables availability (do NOT log full keys)
  const envOk = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log("Env: SUPABASE_URL present?", !!process.env.SUPABASE_URL);
  console.log("Env: SUPABASE_SERVICE_ROLE_KEY present?", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!slug || !name) {
    console.warn("[generateAffiliateLinks] Missing required slug or name", { slug, name });
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required query params: slug and name are required" }),
    };
  }

  if (!envOk) {
    console.error("[generateAffiliateLinks] Supabase env vars missing. Aborting.");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Supabase environment variables are not configured on Netlify" }),
    };
  }

  let supabase;
  try {
    supabase = await getSupabaseClient();
    console.log("[generateAffiliateLinks] Supabase client created");
  } catch (err) {
    console.error("[generateAffiliateLinks] Failed to create supabase client:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to initialize Supabase client", details: err?.message }),
    };
  }

  try {
    // Build partner deep-links payload
    const travelBase = AFFILIATE_CONFIG;
    const { marker, trs } = travelBase;

    const partners = Object.values(travelBase.partners).map((p) => {
      let targetUrl;
      if (p.deep_link_template) {
        // Use slug's last segment for LP style templates
        const lastSlug = slug.split("/").pop();
        targetUrl = p.deep_link_template.replace("{slug}", lastSlug);
      } else {
        // fallback search URL for partner domain
        const domain = p.name.toLowerCase().replace(/\s+/g, "");
        targetUrl = `https://${domain}.com/search?query=${encodeURIComponent(name || city || country)}`;
      }

      const deep_link =
        p.deep_link_template && p.name.toLowerCase().includes("lonelyplanet")
          ? targetUrl
          : buildTpLink({
              baseUrl: p.baseUrl,
              marker,
              trs,
              partner_id: p.partner_id,
              campaign_id: p.campaign_id,
              targetUrl,
            });

      return {
        partner_name: p.name,
        partner_code: p.name.toLowerCase().replace(/\s+/g, "_"),
        deep_link,
        logo_url: p.logo_url || null,
        raw_target_url: targetUrl,
      };
    });

    console.log("[generateAffiliateLinks] Built partners payload:", partners);

    const linksToInsert = [];

    // For each partner: ensure affiliate row exists (or create) and collect partner_affiliate_links rows
    for (const p of partners) {
      try {
        console.log(`[generateAffiliateLinks] Processing partner: ${p.partner_name} (${p.partner_code})`);

        // 1) Check existing affiliate by partner_code
        const existingRes = await supabase
          .from("affiliates")
          .select("id")
          .eq("partner_code", p.partner_code)
          .limit(1);

        if (existingRes.error) {
          console.error(`[generateAffiliateLinks] Error querying affiliates for ${p.partner_code}:`, existingRes.error);
          // continue to next partner rather than abort entire flow
          continue;
        }

        let affiliate_id = existingRes.data && existingRes.data.length > 0 ? existingRes.data[0].id : null;
        console.log(`[generateAffiliateLinks] existing affiliate_id:`, affiliate_id);

        // 2) If not present, insert affiliate
        if (!affiliate_id) {
          console.log(`[generateAffiliateLinks] Creating affiliate record for ${p.partner_name}`);
          const insertAffRes = await supabase
            .from("affiliates")
            .insert([
              {
                partner_name: p.partner_name,
                partner_code: p.partner_code,
                logo_url: p.logo_url,
                base_url: p.raw_target_url,
                active: true,
              },
            ])
            .select()
            .limit(1);

          if (insertAffRes.error) {
            console.error(`[generateAffiliateLinks] Failed to insert affiliate ${p.partner_code}:`, insertAffRes.error);
            continue;
          }

          affiliate_id = insertAffRes.data && insertAffRes.data.length ? insertAffRes.data[0].id : null;
          console.log(`[generateAffiliateLinks] Created affiliate id:`, affiliate_id);
        }

        if (!affiliate_id) {
          console.warn(`[generateAffiliateLinks] affiliate_id still missing for ${p.partner_code}, skipping link insert`);
          continue;
        }

        // 3) Prepare partner_affiliate_links row
        linksToInsert.push({
          destination_slug: slug,
          affiliate_id,
          deep_link: p.deep_link,
          metadata: { city, country },
        });

        console.log(`[generateAffiliateLinks] Prepared link for ${p.partner_name}`, {
          destination_slug: slug,
          affiliate_id,
          deep_link: p.deep_link,
        });
      } catch (innerErr) {
        console.error(`[generateAffiliateLinks] Unexpected error while processing partner ${p.partner_name}:`, innerErr);
        // do not abort; continue processing remaining partners
        continue;
      }
    }

    console.log("[generateAffiliateLinks] linksToInsert final:", linksToInsert);

    if (linksToInsert.length === 0) {
      console.warn("[generateAffiliateLinks] No links prepared to insert");
      return {
        statusCode: 200,
        body: JSON.stringify({ status: "ok", message: "No affiliate links to insert", partners: 0 }),
      };
    }

    // Upsert links (on conflict destination_slug + affiliate_id)
    const upsertRes = await supabase
      .from("partner_affiliate_links")
      .upsert(linksToInsert, { onConflict: "destination_slug,affiliate_id" });

    if (upsertRes.error) {
      console.error("[generateAffiliateLinks] partner_affiliate_links upsert error:", upsertRes.error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to upsert partner_affiliate_links", details: upsertRes.error.message }),
      };
    }

    console.log(`[generateAffiliateLinks] Upsert succeeded, rows:`, upsertRes.data?.length ?? "(unknown length)");

    const responseBody = {
      status: "ok",
      message: `Affiliate links generated for ${name}`,
      partners: linksToInsert.length,
      inserted: upsertRes.data ? upsertRes.data.length : linksToInsert.length,
    };

    if (debug) {
      responseBody.debug = {
        params: { slug, name, city, country },
        partners,
        linksToInsert,
        upsertResult: upsertRes,
      };
    }

    console.log("=== generateAffiliateLinks END (success) ===");
    return {
      statusCode: 200,
      body: JSON.stringify(responseBody),
    };
  } catch (err) {
    console.error("[generateAffiliateLinks] Fatal error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error", details: err?.message }),
    };
  }
};
