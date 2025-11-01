/**
 * generateAffiliateLinks_v3.cjs
 * -----------------------------------------------
 * Hybrid affiliate link generator for WANDR (Supabase version)
 * Uses: affiliates, partner_mappings, partner_affiliate_links (+ vw_partner_flight_previews)
 * Compatible with Booking, Expedia, Aviasales, Kayak, Elsewhere, GoCity, etc.
 */

const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4 } = require("uuid");

// ----------------------------------------------------------
// Initialize Supabase client (Server-side, uses Service Role key)
// ----------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------
function formatDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getFlightRange() {
  return { depart: formatDate(7), ret: formatDate(14) };
}
function safeVal(v) {
  if (v === undefined || v === null) return "";
  return String(v);
}

// Simple template replacer for placeholders used across partners
function applyTemplate(template = "", mapping = {}, extras = {}) {
  if (!template) return "";
  const vars = {
    city_slug: safeVal(mapping.city_slug),
    country_slug: safeVal(mapping.country_slug),
    country_code: safeVal(mapping.country_code),
    geo_id: safeVal(mapping.geo_id),
    origin: safeVal(mapping.origin),
    origin_code: safeVal(mapping.origin_code),
    destination: safeVal(mapping.destination),
    destination_code: safeVal(mapping.destination_code),
    origin_city: safeVal(mapping.origin_city),
    destination_city: safeVal(mapping.destination_city),
    origin_code: safeVal(mapping.origin_code),
    destination_code: safeVal(mapping.destination_code),
    depart: safeVal(extras.depart),
    return: safeVal(extras.ret || extras.return),
    depart_mm_dd_yyyy: safeVal(extras.depart),
    return_mm_dd_yyyy: safeVal(extras.ret || extras.return),
    depart_ddmm: safeVal(extras.depart).slice(5, 10).replace("-", ""),
    return_ddmm: safeVal(extras.ret || extras.return).slice(5, 10).replace("-", ""),
    depart_yyyy_mm_dd: safeVal(extras.depart),
    return_yyyy_mm_dd: safeVal(extras.ret || extras.return),
    adults: safeVal(extras.adults || 2),
    slug: safeVal(mapping.override_slug || mapping.city_slug || mapping.country_slug),
  };

  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

// Ensures exactly one encoded u= parameter in a tp.media wrapper (replace if exists)
function wrapTpLink(baseUrl, targetUrl) {
  if (!baseUrl) return targetUrl;
  // if targetUrl is already encoded, encodeURIComponent will double-encode; we expect raw target here
  const encodedTarget = encodeURIComponent(targetUrl);

  // detect u= param (unencoded or encoded) and replace its value
  if (/[?&]u=/.test(baseUrl)) {
    // replace the value of u=... up to & or end
    return baseUrl.replace(/([?&]u=)([^&]*)/, `$1${encodedTarget}`);
  }
  // append u param safely
  return (baseUrl.includes("?") ? `${baseUrl}&u=${encodedTarget}` : `${baseUrl}?u=${encodedTarget}`);
}

// ----------------------------------------------------------
// Fetchers (Supabase versions)
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
    .select("city_slug, country_slug, country_code, geo_id, override_url, override_slug, active")
    .eq("partner_code", partnerCode)
    .eq("active", true);

  if (error) throw new Error(`Error fetching mappings for ${partnerCode}: ${error.message}`);
  return data || [];
}

async function fetchFlightPreviews(partnerCode) {
  const { data, error } = await supabase
    .from("vw_partner_flight_previews")
    .select("*")
    .eq("partner_code", partnerCode);

  if (error) throw new Error(`Error fetching flight previews: ${error.message}`);
  return data || [];
}

// ----------------------------------------------------------
// DB insert/upsert (with optional retry wrapper)
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
    // Return a predictable debug object (no DB interaction)
    return { id: "debug-mode", deep_link, raw_target, encoded_target };
  }

  // prepare payload for upsert
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
    .upsert([payload], { onConflict: "destination_slug,partner_code,variant" })
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
      console.warn(`Insert attempt ${attempt} failed for ${payload.partner_code}/${payload.destination_slug}: ${err.message}`);
      if (attempt === maxAttempts) throw err;
      // exponential backoff
      await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
    }
  }
}

// ----------------------------------------------------------
// Deep link builder (uses applyTemplate and wrapTpLink)
// ----------------------------------------------------------
function buildDeepLink(partner, mapping) {
  const extras = getFlightRange();
  const depart = extras.depart;
  const ret = extras.ret;
  const extrasSet = { depart, ret, adults: 2 };

  const template = partner.template_url || "";
  const base = partner.base_url || "";

  // Prefer mapping.override_url when present (perform substitutions)
  const rawTarget = mapping.override_url
    ? applyTemplate(mapping.override_url, mapping, extrasSet)
    : applyTemplate(template, mapping, extrasSet);

  // Partner-specific small adjustments when needed (keep majority driven by templates/overrides)
  switch (partner.partner_code) {
    case "booking_stays":
      // booking search needs query string ss=city/country
      const bookingTarget = rawTarget || `https://www.booking.com/searchresults.html?ss=${mapping.city_slug || mapping.country_slug}`;
      return { deep_link: wrapTpLink(base, bookingTarget), rawTarget: bookingTarget, encodedTarget: encodeURIComponent(bookingTarget) };

    case "booking_cars":
      {
        const t = rawTarget || `https://www.booking.com/cars/index.html?city=${mapping.city_slug || mapping.country_slug}`;
        return { deep_link: wrapTpLink(base, t), rawTarget: t, encodedTarget: encodeURIComponent(t) };
      }

    case "booking_attractions":
      {
        const t = rawTarget || `https://www.booking.com/attractions/searchresults/${mapping.country_code || ""}/${mapping.city_slug || ""}.html`;
        return { deep_link: wrapTpLink(base, t), rawTarget: t, encodedTarget: encodeURIComponent(t) };
      }

    case "gocity":
      {
        const t = rawTarget || `https://gocity.com/en/${mapping.city_slug || mapping.country_slug}`;
        return { deep_link: wrapTpLink(base, t), rawTarget: t, encodedTarget: encodeURIComponent(t) };
      }

    case "elsewhere":
      {
        const t = rawTarget || `https://www.elsewhere.io/${mapping.country_slug || mapping.country_code || ""}`;
        return { deep_link: wrapTpLink(base, t), rawTarget: t, encodedTarget: encodeURIComponent(t) };
      }

    case "cheapoair":
    case "aviasales":
    case "expedia_flights":
    case "expedia_stays":
    case "expedia_cars":
    case "expedia_activities":
    case "tripadvisor_hotels":
    case "tripadvisor_attractions":
    case "tripadvisor_restaurants":
    case "tripadvisor_vacation_rentals":
      {
        // For Travelpayouts-wrapped partners we pass rawTarget into wrapTpLink which will place it into u= correctly
        const t = rawTarget || template || base;
        return { deep_link: wrapTpLink(base, t), rawTarget: t, encodedTarget: encodeURIComponent(t) };
      }

    default:
      {
        // fallback: if base is a wrapper use it; else prefer rawTarget/template/base
        const t = rawTarget || template || base;
        const final = base.includes("tp.media") ? wrapTpLink(base, t) : t;
        return { deep_link: final, rawTarget: t, encodedTarget: encodeURIComponent(t) };
      }
  }
}

// ----------------------------------------------------------
// Main handler
// ----------------------------------------------------------
exports.handler = async function (event) {
  console.log("🚀 Starting generateAffiliateLinks_v3");

  const body = event.body ? JSON.parse(event.body) : {};
  const { partners = [], limit = 0, debug = false } = body;

  console.log(`⚙️ Params => partners:${partners.length ? partners.join(", ") : "all"}, limit:${limit}, debug:${debug}`);

  const generation_id = uuidv4();
  // create generation record
  try {
    const { error: genError } = await supabase
      .from("data_generations")
      .insert([{ id: generation_id, generated_by: "generateAffiliateLinks_v3", started_at: new Date().toISOString(), notes: "Automated affiliate link generation batch" }]);
    if (genError) {
      console.error("⚠️ Failed to create data_generation record:", genError.message);
    }
  } catch (err) {
    console.error("⚠️ Exception creating data_generation record:", err.message);
  }

  const partnerSummaries = {}; // partner_code => { success: N, failed: M, examples: [...] }
  let totalCount = 0;
  const previewLinks = []; // when debug true, accumulate a few previews

  try {
    const affiliates = await getActiveAffiliates();
    const targetAffiliates = partners.length ? affiliates.filter((a) => partners.includes(a.partner_code)) : affiliates;

    for (const partner of targetAffiliates) {
      partnerSummaries[partner.partner_code] = { success: 0, failed: 0, examples: [] };
      console.log(`\n🔗 Generating links for ${partner.partner_code}...`);

      const mappings = await getPartnerMappings(partner.partner_code);
      const sliced = limit > 0 ? mappings.slice(0, limit) : mappings;

      for (const mapping of sliced) {
        try {
          // determine destination slug
          const destination_slug = mapping.city_slug || mapping.country_slug || "none";

          // build deep link object
          const { deep_link, rawTarget: raw_target, encodedTarget: encoded_target } = buildDeepLink(partner, mapping);

          // if debug mode, skip writes but keep preview
          if (debug) {
            partnerSummaries[partner.partner_code].examples.push({ destination_slug, deep_link, raw_target });
            previewLinks.push({ partner: partner.partner_code, destination_slug, deep_link, raw_target });
            partnerSummaries[partner.partner_code].success++;
            totalCount++;
            console.log(`🧪 [DEBUG] ${partner.partner_code} -> ${destination_slug} -> ${deep_link}`);
            continue;
          }

          // attempt upsert with retry
          await insertGeneratedLinkWithRetry({
            affiliate_id: partner.affiliate_id,
            destination_slug,
            partner_code: partner.partner_code,
            deep_link,
            raw_target,
            encoded_target,
            base_url: partner.base_url,
            generation_id,
          }, { debug });

          partnerSummaries[partner.partner_code].success++;
          totalCount++;
          // keep a small example list
          if (partnerSummaries[partner.partner_code].examples.length < 3) {
            partnerSummaries[partner.partner_code].examples.push({ destination_slug, deep_link });
          }
          console.log(`✅ ${partner.partner_code} → ${destination_slug}`);
        } catch (innerErr) {
          partnerSummaries[partner.partner_code].failed++;
          console.error(`❌ Failed for ${partner.partner_code} mapping ${mapping.city_slug || mapping.country_slug}:`, innerErr.message);
        }
      } // end mapping loop

      // optional flight preview logging
      if (process.env.DEBUG_FLIGHT_PREVIEWS === "true" && ["booking_kayak", "expedia_flights", "aviasales", "cheapoair"].includes(partner.partner_code)) {
        try {
          const previews = await fetchFlightPreviews(partner.partner_code);
          if (previews?.length) {
            console.log(`\n📡 Flight preview (${partner.partner_code}):`);
            previews.slice(0, 3).forEach((r) => console.log(`  ${r.override_url || r.partner_code}`));
          }
        } catch (pvErr) {
          console.warn("⚠️ Flight preview error:", pvErr.message);
        }
      }
    } // end partner loop

    // finalize generation: update data_generations with completed_at and record_count + notes
    try {
      const notesSummary = { summary: partnerSummaries, env_debug: debug };
      await supabase
        .from("data_generations")
        .update({ completed_at: new Date().toISOString(), record_count: totalCount, notes: JSON.stringify(notesSummary) })
        .eq("id", generation_id);
    } catch (updateErr) {
      console.error("⚠️ Failed to update data_generation completion:", updateErr.message);
    }

    console.log("\n🎉 Affiliate link generation complete.");
    const bodyOut = { message: "Affiliate links generated successfully.", generation_id, totalCount, partnerSummaries };
    if (debug) bodyOut.previewLinks = previewLinks.slice(0, 50);
    return { statusCode: 200, body: JSON.stringify(bodyOut) };
  } catch (err) {
    console.error("❌ Error generating affiliate links:", err);
    // attempt to mark generation as failed with notes
    try {
      await supabase
        .from("data_generations")
        .update({ completed_at: new Date().toISOString(), notes: `Batch failed: ${err.message}` })
        .eq("id", generation_id);
    } catch (ignored) {
      console.warn("⚠️ Failed to update generation failure state:", ignored.message);
    }
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
