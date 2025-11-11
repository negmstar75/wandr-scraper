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
function pad(n) {
  return String(n).padStart(2, "0");
}

function formatDateParts(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  return {
    yyyy_mm_dd: `${yyyy}-${mm}-${dd}`,
    mm_dd_yyyy: `${mm}/${dd}/${yyyy}`,
    ddmm: `${dd}${mm}`,
    mmdd: `${mm}${dd}`,
  };
}

function getFlightRange() {
  const depart = formatDateParts(7);
  const ret = formatDateParts(14);
  return {
    depart_iso: depart.yyyy_mm_dd,
    return_iso: ret.yyyy_mm_dd,
    depart_mm_dd_yyyy: depart.mm_dd_yyyy,
    return_mm_dd_yyyy: ret.mm_dd_yyyy,
    depart_ddmm: depart.ddmm,
    return_ddmm: ret.ddmm,
    depart_mmdd: depart.mmdd,
    return_mmdd: ret.mmdd,
    depart_yyyy_mm_dd: depart.yyyy_mm_dd,
    return_yyyy_mm_dd: ret.yyyy_mm_dd,
  };
}

function safeVal(v) {
  if (v === undefined || v === null) return "";
  return String(v);
}

// ----------------------------------------------------------
// Normalization: clean city/place names (airport parentheticals)
// - Keep descriptive parentheticals with " - " (e.g., "(CDG - Charles De Gaulle)")
// - Remove plain single codes like "(LAX)"
// - If duplicate pattern "Name (CODE - desc) (CODE)" keep the descriptive and drop trailing (CODE)
// ----------------------------------------------------------
function normalizePlaceName(raw) {
  if (!raw || typeof raw !== "string") return raw;
  let s = raw.trim();

  // extract parenthetical contents
  const parenMatches = [];
  const re = /\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    parenMatches.push(m[1].trim());
  }

  // no parentheses: nothing to do
  if (parenMatches.length === 0) return s;

  // helper: is plain code (2-4 alnum, maybe with dash)
  const isPlainCode = (t) => /^[A-Za-z0-9]{1,6}$/.test(t.replace(/\s+/g, ""));

  // if multiple parentheses and first contains " - " (descriptive) and last is plain code duplicates -> drop trailing plain ones
  if (parenMatches.length > 1 && parenMatches[0].includes(" - ")) {
    // keep only first descriptive parenthetical
    const before = s.slice(0, s.indexOf("(")).trim();
    const kept = `(${parenMatches[0]})`;
    return `${before}${kept}`.trim();
  }

  // if exactly one parenthetical and it's a plain code (airport code like (LAX)) -> remove it
  if (parenMatches.length === 1 && isPlainCode(parenMatches[0])) {
    // remove the single parenthetical
    s = s.replace(/\s*\([^)]+\)\s*$/, "").trim();
    return s;
  }

  // if there are duplicates like "Name (CODE - desc) (CODE)" but first may or may not have ' - '
  // fallback: prefer any parenthetical containing " - " (descriptive); if present, keep first such and remove others
  const desc = parenMatches.find((p) => p.includes(" - "));
  if (desc) {
    const before = s.slice(0, s.indexOf("(")).trim();
    return `${before}(${desc})`.trim();
  }

  // otherwise keep original (or remove trailing duplicate identical parentheses)
  // remove exact duplicates at end: e.g., "Name (JFK) (JFK)" -> "Name (JFK)"
  if (parenMatches.length > 1 && parenMatches[parenMatches.length - 1] === parenMatches[parenMatches.length - 2]) {
    // remove last duplicate
    s = s.replace(/\s*\([^)]+\)\s*$/, "").trim(); // remove last
    return s;
  }

  // default: return input unchanged (safe fallback)
  return s;
}

// ----------------------------------------------------------
// Template substitution
// ----------------------------------------------------------
function applyTemplate(template = "", mapping = {}, extras = {}, context = {}) {
  if (!template) return "";

  const vars = {
    city_slug: safeVal(mapping.city_slug),
    country_slug: safeVal(mapping.country_slug),
    country_code: safeVal(mapping.country_code),
    geo_id: safeVal(mapping.geo_id),
    prefixed_geo_id: safeVal(mapping.prefixed_geo_id),
    origin: safeVal(context.origin || mapping.origin || mapping.origin_city),
    origin_code: safeVal(context.origin_code || mapping.origin_code),
    origin_city: safeVal(context.origin_city || mapping.origin_city),
    destination: safeVal(mapping.destination || mapping.city_slug),
    destination_code: safeVal(mapping.destination_code),
    destination_city: safeVal(context.destination_city || mapping.destination_city || mapping.city_slug),
    depart: safeVal(extras.depart_iso),
    return: safeVal(extras.return_iso),
    depart_mm_dd_yyyy: safeVal(extras.depart_mm_dd_yyyy),
    return_mm_dd_yyyy: safeVal(extras.return_mm_dd_yyyy),
    depart_ddmm: safeVal(extras.depart_ddmm),
    return_ddmm: safeVal(extras.return_ddmm),
    depart_yyyy_mm_dd: safeVal(extras.depart_yyyy_mm_dd),
    return_yyyy_mm_dd: safeVal(extras.return_yyyy_mm_dd),
    adults: safeVal(extras.adults || 2),
    slug: safeVal(mapping.override_slug || mapping.city_slug || mapping.country_slug),
  };

  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

function wrapTpLink(baseUrl, targetUrl) {
  if (!baseUrl) return targetUrl;
  const encodedTarget = encodeURIComponent(targetUrl);
  if (/[?&]u=/.test(baseUrl)) {
    return baseUrl.replace(/([?&]u=)([^&]*)/, `$1${encodedTarget}`);
  }
  return baseUrl.includes("?")
    ? `${baseUrl}&u=${encodedTarget}`
    : `${baseUrl}?u=${encodedTarget}`;
}

// ----------------------------------------------------------
// TripAdvisor geo helpers and fallback
// ----------------------------------------------------------
function ensureTripadvisorGeoId(mapping) {
  if (!mapping) return mapping;
  if (mapping.prefixed_geo_id) return mapping;
  const gid = mapping.geo_id || mapping.new_geo_id || mapping.newGeoId || null;
  if (!gid) return mapping;
  mapping.prefixed_geo_id =
    /^[0-9]+$/.test(String(gid)) ? `g${gid}` : String(gid);
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
    .select(
      "id, city_slug, country_slug, country_code, geo_id, override_url, override_slug, active, origin_code, destination_code, origin_city, destination_city"
    )
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
// DB insert/upsert
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

// ----------------------------------------------------------
// Deep link builder (final verified fix)
// ----------------------------------------------------------
function buildDeepLink(partner, mapping, extras, context = {}) {
  const base = partner.base_url || "";
  const template = partner.template_url || "";
  const partnerNeedsOrigin = [
    "aviasales",
    "expedia_flights",
    "booking_kayak",
    "cheapoair",
  ].includes(partner.partner_code);

  // ✅ Normalize mapping safety
  mapping.city_slug = mapping.city_slug || mapping.country_slug || "none";
  mapping.country_slug = mapping.country_slug || mapping.city_slug || "unknown";
  mapping.country_code = mapping.country_code || mapping.country_slug?.slice(0, 2).toUpperCase() || "XX";

  const resolved = {
    origin_code:
      context.origin_code ||
      mapping.origin_code ||
      process.env.DEFAULT_ORIGIN_CODE ||
      "CAI",
    origin_city:
      context.origin_city ||
      mapping.origin_city ||
      context.origin ||
      mapping.origin ||
      "Cairo",
    destination_code:
      mapping.destination_code ||
      mapping.geo_id ||
      mapping.iata_code ||
      mapping.city_slug?.slice(0, 3).toUpperCase() ||
      "XXX",
    destination_city:
      mapping.destination_city || mapping.city_slug || mapping.override_slug,
  };

  if (partnerNeedsOrigin && !resolved.origin_code && !resolved.origin_city) {
    resolved.origin_code = "CAI";
    resolved.origin_city = "Cairo";
  }

  const rawTarget = mapping.override_url
    ? applyTemplate(mapping.override_url, mapping, extras, resolved)
    : applyTemplate(template, mapping, extras, resolved);

  switch (partner.partner_code) {
    case "booking_stays":
      return wrapOut(
        base,
        rawTarget ||
          `https://www.booking.com/searchresults.html?ss=${mapping.city_slug},+${mapping.country_slug || mapping.country_code || ""}`
      );

    case "booking_cars":
      return wrapOut(base, rawTarget || `https://www.booking.com/cars/index.html`);

    case "booking_attractions": {
      let url =
        rawTarget ||
        `https://www.booking.com/attractions/searchresults/${(mapping.country_code || mapping.country_slug || "xx").toLowerCase()}/${mapping.city_slug}.html`;
      url = url.replace(/\/[A-Z]{2}\//g, (m) => m.toLowerCase());
      return wrapOut(base, url);
    }

    case "gocity":
      return wrapOut(base, rawTarget || `https://gocity.com/en/${mapping.city_slug}`);

    case "elsewhere": {
      // ✅ Always set destination_slug to the country for cleaner output
      const urlBase = rawTarget || `https://www.elsewhere.io/${mapping.country_slug}`;
      const tracking =
        "?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program";
      const url = urlBase.includes("sca_ref=") ? urlBase : urlBase + tracking;

      mapping.destination_slug = mapping.country_slug;
      return {
        deep_link: url,
        rawTarget: url,
        encodedTarget: encodeURIComponent(url),
      };
    }

    case "aviasales": {
      const originIata = (resolved.origin_code || "CAI").slice(0, 3).toUpperCase();
      let destIata =
        (resolved.destination_code || "")
          .slice(0, 3)
          .toUpperCase() ||
        (mapping.iata_code || "")
          .slice(0, 3)
          .toUpperCase() ||
        (mapping.city_slug ? mapping.city_slug.slice(0, 3).toUpperCase() : "XXX");

      // ✅ ensure destIata always 3 letters
      destIata = destIata.padEnd(3, "X").substring(0, 3);

      const flightPath = `${originIata}${extras.depart_ddmm}${destIata}${extras.return_ddmm}1`;
      const aviasalesUrl = `https://www.aviasales.com/search/${flightPath}`;
      return wrapOut(base, aviasalesUrl);
    }

    default:
      return wrapOut(base, rawTarget || template || base);
  }

  // Helper: wrap target for TP
  function wrapOut(b, target) {
    const encoded = encodeURIComponent(target);
    const deep_link = wrapTpLink(b, target);
    return { deep_link, rawTarget: target, encodedTarget: encoded };
  }
}

// ----------------------------------------------------------
// Main handler
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
  } = body;

  console.log(
    `⚙️ Params => partners:${partners.length ? partners.join(", ") : "all"}, limit:${limit}, debug:${debug}`
  );

  const generation_id = uuidv4();
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

  try {
    const affiliates = await getActiveAffiliates();
    const targetAffiliates = partners.length
      ? affiliates.filter((a) => partners.includes(a.partner_code))
      : affiliates;

    for (const partner of targetAffiliates) {
      partnerSummaries[partner.partner_code] = {
        success: 0,
        failed: 0,
        examples: [],
      };
      console.log(`\n🔗 Generating links for ${partner.partner_code}...`);

      let flightPreviews = [];
      if (
        [
          "aviasales",
          "booking_kayak",
          "expedia_flights",
          "cheapoair",
        ].includes(partner.partner_code)
      ) {
        try {
          flightPreviews = await fetchFlightPreviews(partner.partner_code);
        } catch (e) {
          console.warn("⚠️ flight preview fetch error:", e.message);
        }
      }

      const mappings = await getPartnerMappings(partner.partner_code);
      const sliced = limit > 0 ? mappings.slice(0, limit) : mappings;

      for (const mappingRow of sliced) {
        const mapping = { ...mappingRow };
        const destination_slug = mapping.city_slug || mapping.country_slug || "none";
        try {
          // TripAdvisor geo fallback
          ensureTripadvisorGeoId(mapping);
          if (
            partner.partner_code.startsWith("tripadvisor_") &&
            !mapping.prefixed_geo_id &&
            !mapping.geo_id
          ) {
            const geo = await fetchGeoIdFromLog(mapping.city_slug, mapping.country_slug);
            if (geo) {
              mapping.geo_id = geo.new_geo_id || mapping.geo_id;
              mapping.prefixed_geo_id = geo.prefixed_geo_id || (geo.new_geo_id ? `g${geo.new_geo_id}` : mapping.prefixed_geo_id);
              mapping.country_code = mapping.country_code || geo.country_code;
            }
          }

          // origin fallback from flight previews (if partner uses origin)
          if (
            ["aviasales", "expedia_flights", "booking_kayak", "cheapoair"].includes(partner.partner_code)
          ) {
            if (!mapping.origin_code && flightPreviews[0]?.origin_code) {
              mapping.origin_code = flightPreviews[0].origin_code;
            }
            if (!mapping.origin_city && flightPreviews[0]?.origin_city) {
              // normalize preview origin_city as well
              mapping.origin_city = normalizePlaceName(flightPreviews[0].origin_city);
            }
          }

          // normalize mapping origin/destination names to avoid duplicates in generated URLs
          if (mapping.origin_city) {
            mapping.origin_city = normalizePlaceName(mapping.origin_city);
            // keep origin fallback in mapping.origin for templates
            mapping.origin = mapping.origin || mapping.origin_city;
          } else if (req_origin_city) {
            mapping.origin_city = normalizePlaceName(req_origin_city);
            mapping.origin = mapping.origin || mapping.origin_city;
          } else if (req_origin) {
            mapping.origin = normalizePlaceName(req_origin);
            mapping.origin_city = mapping.origin_city || mapping.origin;
          }

          // normalize destination human name (if present) — don't modify city_slug
          if (mapping.destination_city) {
            mapping.destination_city = normalizePlaceName(mapping.destination_city);
            mapping.destination = mapping.destination || mapping.destination_city;
          } else if (mapping.city_slug) {
            // city_slug is slug (e.g., "paris") - don't normalize slug; set destination_city for templates
            mapping.destination_city = mapping.city_slug;
            mapping.destination = mapping.destination || mapping.destination_city;
          }

          const extras = { ...getFlightRange(), adults: 1 };
          const context = {
            origin_code: req_origin_code,
            origin_city: req_origin_city ? normalizePlaceName(req_origin_city) : undefined,
            origin: req_origin ? normalizePlaceName(req_origin) : undefined,
          };

          const { deep_link, rawTarget: raw_target, encodedTarget: encoded_target } =
            buildDeepLink(partner, mapping, extras, context);

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
          if (
            partnerSummaries[partner.partner_code].examples.length < 3
          ) {
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
  } catch (err) {
    console.error("❌ Fatal error:", err.message);
    await supabase
      .from("data_generations")
      .update({
        completed_at: new Date().toISOString(),
        notes: `Batch failed: ${err.message}`,
      })
      .eq("id", generation_id);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
