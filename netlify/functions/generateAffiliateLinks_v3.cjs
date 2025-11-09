/**
 * generateAffiliateLinks_v3.cjs
 * -----------------------------------------------
 * Hybrid affiliate link generator for WANDR (Supabase version)
 * Uses: affiliates, partner_mappings, partner_affiliate_links (+ vw_partner_flight_previews, geo_enrichment_log)
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
// Helpers - date formatting & safety
// ----------------------------------------------------------
function pad(n) { return String(n).padStart(2, "0"); }

function formatDateISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`; // 2025-11-10
}
function formatDateMMDDYYYY(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${m}/${day}/${y}`; // 11/10/2025
}
function formatDateMMDD(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${m}${day}`; // 1110
}

function getFlightRange() {
  // default depart = today + 7, return = today + 14
  return {
    depart_iso: formatDateISO(7),
    return_iso: formatDateISO(14),
    depart_mmddyyyy: formatDateMMDDYYYY(7),
    return_mmddyyyy: formatDateMMDDYYYY(14),
    depart_ddmm_like: formatDateMMDD(7), // used by aviasales style placeholders (MMDD)
    return_ddmm_like: formatDateMMDD(14),
    depart_yyyy_mm_dd: formatDateISO(7),
    return_yyyy_mm_dd: formatDateISO(14),
  };
}

function safeVal(v) {
  if (v === undefined || v === null) return "";
  return String(v);
}

// ----------------------------------------------------------
// Template substitution
// ----------------------------------------------------------
function applyTemplate(template = "", mapping = {}, extras = {}) {
  if (!template) return "";
  const vars = {
    city_slug: safeVal(mapping.city_slug),
    country_slug: safeVal(mapping.country_slug),
    country_code: safeVal(mapping.country_code),
    geo_id: safeVal(mapping.geo_id),
    prefixed_geo_id: safeVal(mapping.prefixed_geo_id), // TripAdvisor-style g12345
    origin: safeVal(mapping.origin),
    origin_code: safeVal(mapping.origin_code),
    origin_city: safeVal(mapping.origin_city),
    destination: safeVal(mapping.destination),
    destination_code: safeVal(mapping.destination_code),
    destination_city: safeVal(mapping.destination_city),
    depart: safeVal(extras.depart_iso || extras.depart || ""),
    return: safeVal(extras.return_iso || extras.ret || ""),
    depart_mm_dd_yyyy: safeVal(extras.depart_mmddyyyy || extras.depart_mm_dd_yyyy || ""),
    return_mm_dd_yyyy: safeVal(extras.return_mmddyyyy || extras.return_mm_dd_yyyy || ""),
    depart_ddmm: safeVal(extras.depart_ddmm || extras.depart_ddmm_like || extras.depart_ddmm || ""),
    return_ddmm: safeVal(extras.return_ddmm || extras.return_ddmm_like || ""),
    depart_yyyy_mm_dd: safeVal(extras.depart_yyyy_mm_dd || ""),
    return_yyyy_mm_dd: safeVal(extras.return_yyyy_mm_dd || ""),
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
  const encodedTarget = encodeURIComponent(targetUrl);
  if (/[?&]u=/.test(baseUrl)) {
    return baseUrl.replace(/([?&]u=)([^&]*)/, `$1${encodedTarget}`);
  }
  return (baseUrl.includes("?") ? `${baseUrl}&u=${encodedTarget}` : `${baseUrl}?u=${encodedTarget}`);
}

// ----------------------------------------------------------
// TripAdvisor geo helpers and fallback
// ----------------------------------------------------------
function ensureTripadvisorGeoId(mapping) {
  if (!mapping) return mapping;
  if (mapping.prefixed_geo_id) return mapping;
  const gid = mapping.geo_id || mapping.new_geo_id || mapping.newGeoId || null;
  if (!gid) return mapping;
  if (/^[0-9]+$/.test(String(gid))) {
    mapping.prefixed_geo_id = `g${gid}`;
  } else if (String(gid).startsWith("g")) {
    mapping.prefixed_geo_id = String(gid);
  } else {
    mapping.prefixed_geo_id = String(gid); // passthrough
  }
  return mapping;
}

async function fetchGeoIdFromLog(city_slug, country_slug) {
  if (!city_slug && !country_slug) return null;
  const { data, error } = await supabase
    .from("geo_enrichment_log")
    .select("new_geo_id, prefixed_geo_id, country_name, country_code")
    .eq("city_slug", city_slug)
    .eq("country_slug", country_slug)
    .maybeSingle();

  if (error) {
    console.warn("geo_enrichment_log lookup error:", error.message);
    return null;
  }
  return data || null;
}

// ----------------------------------------------------------
// Fetchers (Supabase)
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
    .select("id, city_slug, country_slug, country_code, geo_id, override_url, override_slug, active, origin_code, destination_code, origin_city, destination_city")
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
      await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
    }
  }
}

// ----------------------------------------------------------
// Deep link builder
// ----------------------------------------------------------
function buildDeepLink(partner, mapping, extras) {
  const template = partner.template_url || "";
  const base = partner.base_url || "";

  // Prefer mapping.override_url when present
  const rawTarget = mapping.override_url
    ? applyTemplate(mapping.override_url, mapping, extras)
    : applyTemplate(template, mapping, extras);

  // Partner-specific adjustments
  switch (partner.partner_code) {
    case "booking_stays": {
      const bookingTarget = rawTarget || `https://www.booking.com/searchresults.html?ss=${mapping.city_slug || mapping.country_slug}`;
      return { deep_link: wrapTpLink(base, bookingTarget), rawTarget: bookingTarget, encodedTarget: encodeURIComponent(bookingTarget) };
    }

    case "booking_cars": {
      const t = rawTarget || `https://www.booking.com/cars/index.html`;
      return { deep_link: wrapTpLink(base, t), rawTarget: t, encodedTarget: encodeURIComponent(t) };
    }

    case "booking_attractions": {
      const t = rawTarget || `https://www.booking.com/attractions/searchresults/${mapping.country_code || ""}/${mapping.city_slug || ""}.html`;
      return { deep_link: wrapTpLink(base, t), rawTarget: t, encodedTarget: encodeURIComponent(t) };
    }

    case "gocity": {
      const t = rawTarget || `https://gocity.com/en/${mapping.city_slug || mapping.country_slug}`;
      return { deep_link: wrapTpLink(base, t), rawTarget: t, encodedTarget: encodeURIComponent(t) };
    }

    case "elsewhere": {
      const t = rawTarget || `https://www.elsewhere.io/${mapping.country_slug || mapping.country_code || ""}`;
      return { deep_link: wrapTpLink(base, t), rawTarget: t, encodedTarget: encodeURIComponent(t) };
    }

    // Travelpayouts / wrapper partners - ensure u= param is handled
    case "cheapoair":
    case "aviasales":
    case "aviasales_forecast":
    case "aviasales_discovery":
    case "expedia_flights":
    case "expedia_stays":
    case "expedia_cars":
    case "expedia_activities":
    case "tripadvisor_hotels":
    case "tripadvisor_attractions":
    case "tripadvisor_restaurants":
    case "tripadvisor_vacation_rentals": {
      const t = rawTarget || template || base;
      return { deep_link: wrapTpLink(base, t), rawTarget: t, encodedTarget: encodeURIComponent(t) };
    }

    default: {
      const t = rawTarget || template || base;
      const final = base && base.includes("tp.media") ? wrapTpLink(base, t) : t;
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

  const partnerSummaries = {};
  let totalCount = 0;
  const previewLinks = [];

  try {
    const affiliates = await getActiveAffiliates();
    const targetAffiliates = partners.length ? affiliates.filter((a) => partners.includes(a.partner_code)) : affiliates;

    // define partners that are flights/meta-search (to attempt origin fallbacks)
    const flightPartnerCodes = new Set([
      "booking_kayak", "expedia_flights", "aviasales", "aviasales_forecast", "aviasales_discovery",
      "cheapoair", "tripadvisor-flights", "tripadvisor_flights", "booking_kayak"
    ]);

    for (const partner of targetAffiliates) {
      partnerSummaries[partner.partner_code] = { success: 0, failed: 0, examples: [] };
      console.log(`\n🔗 Generating links for ${partner.partner_code}...`);

      // if flight partner, attempt to fetch previews once (used as origin fallback)
      let flightPreviews = [];
      if (flightPartnerCodes.has(partner.partner_code)) {
        try {
          flightPreviews = await fetchFlightPreviews(partner.partner_code);
        } catch (pvErr) {
          console.warn("⚠️ Flight preview fetch error:", pvErr.message);
        }
      }

      const mappings = await getPartnerMappings(partner.partner_code);
      const sliced = limit > 0 ? mappings.slice(0, limit) : mappings;

      for (const mappingRow of sliced) {
        // mappingRow comes from DB; clone into plain object we can mutate
        const mapping = { ...mappingRow };

        try {
          // determine destination slug
          const destination_slug = mapping.city_slug || mapping.country_slug || "none";

          // flight date extras (multiple formats)
          const extras = {
            depart_iso: getFlightRange().depart_iso,
            return_iso: getFlightRange().return_iso,
            depart_mmddyyyy: getFlightRange().depart_mmddyyyy,
            return_mmddyyyy: getFlightRange().return_mmddyyyy,
            depart_ddmm_like: getFlightRange().depart_ddmm_like,
            return_ddmm_like: getFlightRange().return_ddmm_like,
            depart_yyyy_mm_dd: getFlightRange().depart_yyyy_mm_dd,
            return_yyyy_mm_dd: getFlightRange().return_yyyy_mm_dd,
            adults: 1,
          };

          // TripAdvisor geo: ensure prefixed form or fetch from geo_enrichment_log
          if (partner.partner_code.startsWith("tripadvisor_")) {
            ensureTripadvisorGeoId(mapping);
            if (!mapping.prefixed_geo_id && !mapping.geo_id) {
              // try to fetch from geo_enrichment_log
              const geo = await fetchGeoIdFromLog(mapping.city_slug, mapping.country_slug);
              if (geo) {
                mapping.geo_id = geo.new_geo_id || geo.newGeoId || mapping.geo_id;
                mapping.prefixed_geo_id = geo.prefixed_geo_id || (geo.new_geo_id ? `g${geo.new_geo_id}` : null);
                // optionally set country_name/code back to mapping if needed
                if (!mapping.country_slug && geo.country_name) mapping.country_slug = geo.country_name.toLowerCase().replace(/\s+/g, "-");
                if (!mapping.country_code && geo.country_code) mapping.country_code = geo.country_code;
              }
            }
            ensureTripadvisorGeoId(mapping);
          }

          // Flight origin fallback: if origin missing, try previews
          if (flightPartnerCodes.has(partner.partner_code)) {
            if ((!mapping.origin_code || mapping.origin_code === "") && flightPreviews?.length) {
              const p = flightPreviews[0];
              if (p?.origin_code) mapping.origin_code = mapping.origin_code || p.origin_code;
              if (p?.origin_city) mapping.origin_city = mapping.origin_city || p.origin_city;
            }
            // Also ensure destination fields (some partners expect destination_city)
            mapping.destination_code = mapping.destination_code || mapping.geo_id || mapping.city_slug || mapping.destination_code;
            mapping.destination_city = mapping.destination_city || mapping.city_slug || mapping.destination_city;
          }

          // apply prefixed_geo_id into mapping if present (applyTemplate will use it)
          ensureTripadvisorGeoId(mapping);

          // build deep link object
          const { deep_link, rawTarget: raw_target, encodedTarget: encoded_target } = buildDeepLink(partner, mapping, extras);

          if (debug) {
            partnerSummaries[partner.partner_code].examples.push({ destination_slug, deep_link, raw_target });
            previewLinks.push({ partner: partner.partner_code, destination_slug, deep_link, raw_target });
            partnerSummaries[partner.partner_code].success++;
            totalCount++;
            console.log(`🧪 [DEBUG] ${partner.partner_code} -> ${destination_slug} -> ${deep_link}`);
            continue;
          }

          // attempt upsert
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
          if (partnerSummaries[partner.partner_code].examples.length < 3) {
            partnerSummaries[partner.partner_code].examples.push({ destination_slug, deep_link });
          }
          console.log(`✅ ${partner.partner_code} → ${destination_slug}`);
        } catch (innerErr) {
          partnerSummaries[partner.partner_code].failed++;
          console.error(`❌ Failed for ${partner.partner_code} mapping ${mapping.city_slug || mapping.country_slug}:`, innerErr.message);
        }
      } // mapping loop
    } // partner loop

    // finalize generation
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
    if (debug) bodyOut.previewLinks = previewLinks.slice(0, 200);
    return { statusCode: 200, body: JSON.stringify(bodyOut) };
  } catch (err) {
    console.error("❌ Error generating affiliate links:", err);
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
