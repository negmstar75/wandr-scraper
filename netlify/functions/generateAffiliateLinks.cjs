const { createClient } = require("@supabase/supabase-js");
const { affiliateTemplates } = require("../../affiliateTemplates.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --------------------------------------------
// Helper: Build a Travelpayouts link
// --------------------------------------------
function buildTpLink({ baseUrl, marker, trs, partner_id, campaign_id, targetUrl }) {
  const encoded = encodeURIComponent(targetUrl);
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encoded}&campaign_id=${campaign_id}`;
}

// --------------------------------------------
// Helper: Replace placeholders in template
// --------------------------------------------
function applyTemplate(template, params = {}) {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`{${key}}`, "g"), encodeURIComponent(value || ""));
  }
  return result;
}

// --------------------------------------------
// Main handler
// --------------------------------------------
exports.handler = async (event) => {
  console.log("🚀 [generateAffiliateLinks] Function started");

  try {
    const { slug, name, country, city } = event.queryStringParameters || {};
    if (!slug || !name) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required parameters: slug, name" }),
      };
    }

    console.log("🌍 Params received:", { slug, name, country, city });

    const { marker, trs } = affiliateTemplates.config;
    const partners = affiliateTemplates.partners;

    console.log(`📦 Loaded ${Object.keys(partners).length} partners`);

    const linksToInsert = [];

    for (const key of Object.keys(partners)) {
      const p = partners[key];
      console.log(`🧩 Processing partner: ${p.name}`);

      // Generate target URL
      let targetUrl = "";

      if (p.template) {
        targetUrl = applyTemplate(p.template, {
          slug: slug.split("/").pop(),
          destination: name,
          city,
          country,
          checkin: "2025-10-10",
          checkout: "2025-10-12",
          adults: "2",
          children: "0",
          origin: "CAI",
          depart: "2025-10-10",
          return: "2025-10-20",
          tripType: "ROUNDTRIP",
        });
      } else {
        targetUrl = `https://${p.name.toLowerCase().replace(/\s+/g, "")}.com/search?query=${encodeURIComponent(
          name || city || country
        )}`;
      }

      let deep_link = targetUrl;

      // Wrap with TP link if Travelpayouts partner
      if (p.base_url && p.partner_id && p.campaign_id) {
        deep_link = buildTpLink({
          baseUrl: p.base_url,
          marker,
          trs,
          partner_id: p.partner_id,
          campaign_id: p.campaign_id,
          targetUrl,
        });
      }

      console.log(`🌐 Deep link generated for ${p.name}:`, deep_link);

      // Ensure affiliate record exists
      const partner_code = p.name.toLowerCase().replace(/\s+/g, "_");

      const { data: existing, error: selectErr } = await supabase
        .from("affiliates")
        .select("id")
        .eq("partner_code", partner_code)
        .maybeSingle();

      if (selectErr) console.error("⚠️ Error checking affiliate:", selectErr);

      let affiliate_id = existing?.id;

      if (!affiliate_id) {
        console.log(`➕ Creating affiliate for ${p.name}`);
        const { data: aff, error: insertErr } = await supabase
          .from("affiliates")
          .insert([
            {
              partner_name: p.name,
              partner_code,
              logo_url: p.logo_url,
              base_url: p.base_url || null,
              active: true,
            },
          ])
          .select()
          .single();

        if (insertErr) throw insertErr;
        affiliate_id = aff.id;
      }

      linksToInsert.push({
        destination_slug: slug,
        affiliate_id,
        partner_code,
        deep_link,
        metadata: { city, country },
      });
    }

    console.log(`📝 Prepared ${linksToInsert.length} links to insert`);

    const { error: upsertErr } = await supabase
      .from("partner_affiliate_links")
      .upsert(linksToInsert, { onConflict: "destination_slug,affiliate_id" });

    if (upsertErr) {
      console.error("❌ Supabase upsert error:", upsertErr);
      throw upsertErr;
    }

    console.log(`✅ Successfully generated ${linksToInsert.length} links`);
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        message: `Affiliate links generated for ${name}`,
        partners: linksToInsert.length,
      }),
    };
  } catch (err) {
    console.error("💥 [generateAffiliateLinks] Fatal error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
