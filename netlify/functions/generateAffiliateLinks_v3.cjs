/**
 * generateAffiliateLinks_v3.cjs
 * -----------------------------------------------
 * Hybrid affiliate link generator for WANDR (Supabase version)
 * Uses: affiliates, partner_mappings, partner_affiliate_links (+ vw_partner_flight_previews, geo_enrichment_log)
 */

const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4 } = require("uuid");
const { enrichMapping } = require("./utils/enrichMapping"); // ✅ modularized enrichment logic
const { buildDeepLink } = require("./utils/buildDeepLink"); // Optional if modularized

// ----------------------------------------------------------
// Initialize Supabase client (Service Role Key required)
// ----------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ----------------------------------------------------------
// Helper: Choose smart default origin (extendable via GeoIP)
// ----------------------------------------------------------
function getFallbackOrigin(req_origin_code, req_origin_city) {
  if (req_origin_code && req_origin_city) {
    return { code: req_origin_code, city: req_origin_city };
  }

  if (process.env.DEFAULT_ORIGIN_CODE && process.env.DEFAULT_ORIGIN_CITY) {
    return {
      code: process.env.DEFAULT_ORIGIN_CODE,
      city: process.env.DEFAULT_ORIGIN_CITY,
    };
  }

  return { code: "LON", city: "London" };
}

// ----------------------------------------------------------
// Main Handler
// ----------------------------------------------------------
exports.handler = async function (event) {
  console.log("🚀 Starting generateAffiliateLinks_v3");

  const body = event.body ? JSON.parse(event.body) : {};
  const {
    partners = [],
    limit = 0,
    debug = false,
    origin_code: req_origin_code,
    origin_city: req_origin_city,
    origin: req_origin,
    fallbackCities = [],
  } = body;

  console.log(
    `⚙️ Params => partners:${partners.length ? partners.join(", ") : "all"}, limit:${limit}, debug:${debug}`
  );

  const generation_id = uuidv4();
  const fallbackOrigin = getFallbackOrigin(req_origin_code, req_origin_city);

  try {
    await supabase.from("data_generations").insert([
      {
        id: generation_id,
        generated_by: "generateAffiliateLinks_v3",
        started_at: new Date().toISOString(),
        notes: "Automated affiliate link generation batch",
      },
    ]);
  } catch (err) {
    console.error("⚠️ Could not create data_generation record:", err.message);
  }

  const partnerSummaries = {};
  const previewLinks = [];
  let totalCount = 0;

  const affiliates = await getActiveAffiliates();
  const targetAffiliates = partners.length
    ? affiliates.filter((a) => partners.includes(a.partner_code))
    : affiliates;

  for (const partner of targetAffiliates) {
    console.log(`\n🔗 Generating links for ${partner.partner_code}...`);
    partnerSummaries[partner.partner_code] = {
      success: 0,
      failed: 0,
      examples: [],
    };

    let flightPreviews = [];
    if (
      ["aviasales", "booking_kayak", "expedia_flights", "cheapoair"].includes(
        partner.partner_code
      )
    ) {
      try {
        flightPreviews = await fetchFlightPreviews(partner.partner_code);
      } catch (e) {
        console.warn("⚠️ flight preview fetch error:", e.message);
      }
    }

    let mappings = [];

    if (fallbackCities.length > 0) {
      mappings = fallbackCities.map((slug) => ({
        id: null,
        city_slug: slug,
        destination_city: slug,
        origin_code: req_origin_code || fallbackOrigin.code,
        origin_city: req_origin_city || fallbackOrigin.city,
      }));
      console.log(
        `⚙️ Using fallbackCities for ${partner.partner_code}: ${fallbackCities.join(", ")} (origin: ${req_origin_code || fallbackOrigin.code}/${req_origin_city || fallbackOrigin.city})`
      );
    } else {
      mappings = await getPartnerMappings(partner.partner_code);
    }

    const sliced = limit > 0 ? mappings.slice(0, limit) : mappings;

    for (const mappingRow of sliced) {
      const mapping = { ...mappingRow };
      const destination_slug = mapping.city_slug || mapping.country_slug || "none";

      try {
        // ✨ Enrich mapping using utils/enrichMapping.js
        const enriched = await enrichMapping(mapping, {
          partner_code: partner.partner_code,
          originFallback: fallbackOrigin,
        });

        // 🧪 Flight origin fallback
        if (
          ["aviasales", "expedia_flights", "booking_kayak", "cheapoair"].includes(
            partner.partner_code
          )
        ) {
          if (!enriched.origin_code && flightPreviews[0]?.origin_code) {
            enriched.origin_code = flightPreviews[0].origin_code;
          }
          if (!enriched.origin_city && flightPreviews[0]?.origin_city) {
            enriched.origin_city = flightPreviews[0].origin_city;
          }
        }

        // 📦 Build deep link
        const { deep_link, rawTarget: raw_target, encodedTarget: encoded_target } =
          buildDeepLink(partner, enriched, { adults: 1 }, {
            origin_code: req_origin_code,
            origin_city: req_origin_city,
            origin: req_origin,
          });

        // ⛔️ Skip empty deep links (unmapped)
        if (!deep_link) {
          console.warn(`⚠️ Skipping ${partner.partner_code}/${destination_slug} → no valid link generated`);
          continue;
        }

        if (debug) {
          partnerSummaries[partner.partner_code].examples.push({
            destination_slug,
            deep_link,
            raw_target,
          });
          previewLinks.push({
            partner: partner.partner_code,
            destination_slug,
            deep_link,
            raw_target,
          });
          partnerSummaries[partner.partner_code].success++;
          totalCount++;
          console.log(`🧪 ${partner.partner_code} -> ${destination_slug}`);
          continue;
        }

        await insertGeneratedLinkWithRetry(
          {
            affiliate_id: partner.affiliate_id,
            destination_slug,
            partner_code: partner.partner_code,
            deep_link,
            raw_target,
            encoded_target,
            base_url: partner.base_url,
            generation_id,
          },
          { debug }
        );

        partnerSummaries[partner.partner_code].success++;
        totalCount++;

        if (partnerSummaries[partner.partner_code].examples.length < 3) {
          partnerSummaries[partner.partner_code].examples.push({
            destination_slug,
            deep_link,
          });
        }

        console.log(`✅ ${partner.partner_code} → ${destination_slug}`);
      } catch (err) {
        partnerSummaries[partner.partner_code].failed++;
        console.error(
          `❌ Failed for ${partner.partner_code} (${destination_slug}): ${err.message}`
        );
      }
    }
  }

  await supabase
    .from("data_generations")
    .update({
      completed_at: new Date().toISOString(),
      record_count: totalCount,
      notes: JSON.stringify({ summary: partnerSummaries, env_debug: debug }),
    })
    .eq("id", generation_id);

  console.log("\n🎉 Done generating affiliate links.");
  const response = {
    message: "Affiliate links generated successfully.",
    generation_id,
    totalCount,
    partnerSummaries,
  };
  if (debug) response.previewLinks = previewLinks.slice(0, 200);
  return { statusCode: 200, body: JSON.stringify(response) };
};

// ----------------------------------------------------------
// ✅ Supabase Accessors
// ----------------------------------------------------------
async function getActiveAffiliates() {
  const { data, error } = await supabase
    .from("affiliates")
    .select("affiliate_id, partner_code, template_url, base_url")
    .eq("active", true);

  if (error) throw new Error(`Error fetching affiliates: ${error.message}`);
  return data || [];
}

async function getPartnerMappings(partnerCode) {
  const { data, error } = await supabase
    .from("partner_mappings")
    .select("*")
    .eq("partner_code", partnerCode)
    .eq("active", true);

  if (error)
    throw new Error(`Error fetching mappings for ${partnerCode}: ${error.message}`);
  return data || [];
}

async function fetchFlightPreviews(partnerCode) {
  const { data, error } = await supabase
    .from("vw_partner_flight_previews")
    .select("*")
    .eq("partner_code", partnerCode);

  if (error)
    throw new Error(`Error fetching flight previews: ${error.message}`);
  return data || [];
}

// ----------------------------------------------------------
// DB Insert Helpers
// ----------------------------------------------------------
async function insertGeneratedLink({
  affiliate_id,
  destination_slug,
  partner_code,
  deep_link,
  raw_target,
  encoded_target,
  base_url,
  generation_id,
  debug = false,
}) {
  if (debug) {
    return { id: "debug-mode", deep_link, raw_target, encoded_target };
  }

  const payload = {
    affiliate_id,
    destination_slug,
    partner_code,
    deep_link,
    base_url,
    raw_target,
    encoded_target,
    generation_id,
    generated_by: "generateAffiliateLinks_v3",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("partner_affiliate_links")
    .upsert([payload], {
      onConflict: "destination_slug,partner_code,variant",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Error inserting link: ${error.message}`);
  return data;
}

async function insertGeneratedLinkWithRetry(payload, { debug = false } = {}) {
  const maxAttempts = debug ? 1 : 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await insertGeneratedLink({ ...payload, debug });
    } catch (err) {
      console.warn(
        `Insert attempt ${attempt} failed for ${payload.partner_code}/${payload.destination_slug}: ${err.message}`
      );
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
    }
  }
}
