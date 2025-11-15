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
// ----------------------------------------------------------
function normalizePlaceName(raw) {
  if (!raw || typeof raw !== "string") return raw;
  let s = raw.trim();

  const parenMatches = [];
  const re = /\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    parenMatches.push(m[1].trim());
  }

  if (parenMatches.length === 0) return s;

  const isPlainCode = (t) => /^[A-Za-z0-9]{1,6}$/.test(t.replace(/\s+/g, ""));

  if (parenMatches.length > 1 && parenMatches[0].includes(" - ")) {
    const before = s.slice(0, s.indexOf("(")).trim();
    const kept = `(${parenMatches[0]})`;
    return `${before}${kept}`.trim();
  }

  if (parenMatches.length === 1 && isPlainCode(parenMatches[0])) {
    s = s.replace(/\s*\([^)]+\)\s*$/, "").trim();
    return s;
  }

  const desc = parenMatches.find((p) => p.includes(" - "));
  if (desc) {
    const before = s.slice(0, s.indexOf("(")).trim();
    return `${before}(${desc})`.trim();
  }

  if (
    parenMatches.length > 1 &&
    parenMatches[parenMatches.length - 1] === parenMatches[parenMatches.length - 2]
  ) {
    s = s.replace(/\s*\([^)]+\)\s*$/, "").trim();
    return s;
  }

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
    destination_city: safeVal(
      context.destination_city || mapping.destination_city || mapping.city_slug
    ),
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
// TripAdvisor geo helpers and fallback (REQUIRED FUNCTION)
// ----------------------------------------------------------
function ensureTripadvisorGeoId(mapping) {
  if (!mapping) return mapping;

  if (mapping.prefixed_geo_id) return mapping;

  const gid =
    mapping.geo_id ||
    mapping.new_geo_id ||
    mapping.newGeoId ||
    null;

  if (!gid) return mapping;

  mapping.prefixed_geo_id =
    /^[0-9]+$/.test(String(gid)) ? `g${gid}` : String(gid);

  return mapping;
}

// ----------------------------------------------------------
// TripAdvisor unified geoId resolver (cache → log → API → cache/log)
// ----------------------------------------------------------
async function resolveTripAdvisorGeo(citySlug, countrySlug = null) {
  if (!citySlug) return null;

  // 1️⃣ geo_enrichment_log (city+country)
  let { data: geo1, error: geo1Err } = await supabase
    .from("geo_enrichment_log")
    .select("new_geo_id, prefixed_geo_id, country_code, country_name")
    .eq("city_slug", citySlug)
    .eq("country_slug", countrySlug)
    .maybeSingle();

  if (geo1Err) {
    console.warn("⚠️ geo_enrichment_log (city+country) error:", geo1Err.message);
  }

  if (geo1?.new_geo_id) {
    return {
      geo_id: geo1.new_geo_id,
      prefixed: geo1.prefixed_geo_id || `g${geo1.new_geo_id}`,
      country_code: geo1.country_code || null,
    };
  }

  // 2️⃣ geo_enrichment_log (city only)
  let { data: geo2, error: geo2Err } = await supabase
    .from("geo_enrichment_log")
    .select("new_geo_id, prefixed_geo_id, country_code, country_name")
    .eq("city_slug", citySlug)
    .maybeSingle();

  if (geo2Err) {
    console.warn("⚠️ geo_enrichment_log (city only) error:", geo2Err.message);
  }

  if (geo2?.new_geo_id) {
    return {
      geo_id: geo2.new_geo_id,
      prefixed: geo2.prefixed_geo_id || `g${geo2.new_geo_id}`,
      country_code: geo2.country_code || null,
    };
  }

  // 3️⃣ tripadvisor_cache (supports old + new shapes)
  const { data: cached, error: cacheErr } = await supabase
    .from("tripadvisor_cache")
    .select("response")
    .eq("query", citySlug)
    .maybeSingle();

  if (cacheErr) {
    console.warn("⚠️ tripadvisor_cache error:", cacheErr.message);
  }

  if (cached?.response) {
    const resp = cached.response;

    const arr =
      resp?.json?.data ||
      resp?.data ||
      [];

    if (Array.isArray(arr) && arr.length > 0) {
      const best = arr[0];
      const geoId = best.location_id;
      const cc = best.address_obj?.countrycode?.toUpperCase?.() || null;

      if (geoId) {
        return {
          geo_id: geoId,
          prefixed: `g${geoId}`,
          country_code: cc,
        };
      }
    }
  }

  // 4️⃣ FINAL – Official TripAdvisor Content API
  const apiKey = process.env.TRIPADVISOR_API_KEY;
  if (!apiKey) return null;

  try {
    const url =
      `https://api.content.tripadvisor.com/api/v1/location/search` +
      `?key=${apiKey}` +
      `&searchQuery=${encodeURIComponent(citySlug)}` +
      `&category=geos`;

    const res = await fetch(url);
    const json = await res.json();

    const best = json?.data?.[0];
    if (!best) return null;

    const geoId = best.location_id;
    const apiCountryCode = best.address_obj?.countrycode?.toUpperCase?.() || null;
    const apiCountryName = best.address_obj?.country || null;
    const slugCountry =
      countrySlug ||
      apiCountryCode?.toLowerCase?.() ||
      null;

    // 🔘 Cache write (tripadvisor_cache)
    await supabase.from("tripadvisor_cache").upsert({
      query: citySlug,
      country_slug: slugCountry,
      response: { json },
      fetched_at: new Date().toISOString(),
    });

    // 🔘 Log write (geo_enrichment_log)
    await supabase.from("geo_enrichment_log").upsert({
      city_slug: citySlug,
      country_slug: slugCountry,
      new_geo_id: geoId,
      country_code: apiCountryCode,
      country_name: apiCountryName,
      prefixed_geo_id: `g${geoId}`,
      latitude: best.latitude ? Number(best.latitude) : null,
      longitude: best.longitude ? Number(best.longitude) : null,
      updated_at: new Date().toISOString(),
      source: "tripadvisor_api",
      match_quality:
        countrySlug && apiCountryCode
          ? apiCountryCode.toLowerCase() === countrySlug.toLowerCase()
            ? "exact"
            : "country_mismatch"
          : "unknown",
    });

    return {
      geo_id: geoId,
      prefixed: `g${geoId}`,
      country_code: apiCountryCode,
    };
  } catch (err) {
    console.warn("⚠️ TripAdvisor API error:", err.message);
    return null;
  }
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
// Airports preload & enrichment helpers
// ----------------------------------------------------------
async function preloadAirports() {
  try {
    const { data: rows, error } = await supabase
      .from("airports")
      .select("code, icao, name, city, city_code, country, latitude, longitude, time_zone")
      .limit(10000);
    if (error) {
      console.warn("⚠️ Failed to preload airports:", error.message);
      return { byCity: new Map(), byIata: new Map() };
    }
    const byCity = new Map();
    const byIata = new Map();
    for (const r of rows || []) {
      const citySlug = (r.city || "").toLowerCase().replace(/\s+/g, "-");
      if (citySlug && !byCity.has(citySlug)) byCity.set(citySlug, r);
      if (r.code) byIata.set(r.code.toUpperCase(), r);
    }
    return { byCity, byIata };
  } catch (err) {
    console.warn("⚠️ Exception preloading airports:", err.message);
    return { byCity: new Map(), byIata: new Map() };
  }
}

function enrichMappingWithAirports(mapping, airportsMap) {
  if (!mapping || !airportsMap) return mapping;
  const { byCity, byIata } = airportsMap;
  const citySlug = (mapping.city_slug || "").toLowerCase();

  let airport = byCity.get(citySlug);
  if (!airport && mapping.destination_code && mapping.destination_code.length === 3) {
    airport = byIata.get(mapping.destination_code.toUpperCase());
  }

  if (airport) {
    if (!mapping.country_code) {
      if (airport.city_code && airport.city_code.length === 2)
        mapping.country_code = airport.city_code.toUpperCase();
      else if (airport.country && airport.country.length === 2)
        mapping.country_code = airport.country.toUpperCase();
    }
    if (mapping.country_code && !mapping.country_code_small)
      mapping.country_code_small = mapping.country_code.toLowerCase();

    if (!mapping.destination_code && airport.code)
      mapping.destination_code = airport.code.toUpperCase();

    if (!mapping.iata_code && airport.code)
      mapping.iata_code = airport.code.toUpperCase();

    if (!mapping.destination_city && airport.city)
      mapping.destination_city = airport.city;
  }

  if (!mapping.country_slug && mapping.country_code)
    mapping.country_slug = mapping.country_code.toLowerCase();

  return mapping;
}

// ----------------------------------------------------------
// Simple fallback resolvers (until full airport table join)
// ----------------------------------------------------------
function resolveIsoFromSlug(slug) {
  const map = {
    madrid: "ES",
    berlin: "DE",
    amsterdam: "NL",
    "cape-town": "ZA",
    baku: "AZ",
    reykjavik: "IS",
  };
  return map[slug?.toLowerCase()] || null;
}

function resolveIataFromSlug(slug) {
  const map = {
    madrid: "MAD",
    berlin: "BER",
    amsterdam: "AMS",
    "cape-town": "CPT",
    baku: "GYD",
    reykjavik: "REK",
  };
  return map[slug?.toLowerCase()] || null;
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

  mapping.city_slug = mapping.city_slug || mapping.country_slug || "none";
  mapping.country_slug = mapping.country_slug || "";
  mapping.country_code =
    mapping.country_code ||
    resolveIsoFromSlug(mapping.city_slug) ||
    "XX";

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
    case "booking_stays": {
      const slug = mapping.city_slug || mapping.destination_city || "";
      const countryPart = mapping.country_slug ? `,+${mapping.country_slug}` : "";
      const baseTarget = `https://www.booking.com/searchresults.html?ss=${slug}${countryPart}`;
      const url = rawTarget || baseTarget;
      return wrapOut(base, url);
    }

    case "booking_cars":
      return wrapOut(base, rawTarget || `https://www.booking.com/cars/index.html`);

    case "booking_attractions": {
      const codeLower = (
        mapping.country_code ||
        resolveIsoFromSlug(mapping.city_slug) ||
        "xx"
      ).toLowerCase();
      const url = `https://www.booking.com/attractions/searchresults/${codeLower}/${mapping.city_slug}.html`;
      return wrapOut(base, url);
    }

    case "gocity":
      return wrapOut(base, rawTarget || `https://gocity.com/en/${mapping.city_slug}`);

    case "elsewhere": {
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

      const iataMap = {
        "cape-town": "CPT",
        reykjavik: "REK",
        berlin: "BER",
        madrid: "MAD",
        amsterdam: "AMS",
        baku: "GYD",
      };

      let destIata =
        (iataMap[mapping.city_slug?.toLowerCase()] ||
          resolved.destination_code ||
          mapping.iata_code ||
          resolveIataFromSlug(mapping.city_slug) ||
          (mapping.city_slug ? mapping.city_slug.slice(0, 3) : "XXX"))
          .toUpperCase()
          .substring(0, 3);

      const originFinal =
        context.origin_code?.toUpperCase() ||
        mapping.origin_code?.toUpperCase() ||
        process.env.DEFAULT_ORIGIN_CODE ||
        "LON";

      const flightPath = `${originFinal}${extras.depart_ddmm}${destIata}${extras.return_ddmm}1`;
      const aviasalesUrl = `https://www.aviasales.com/search/${flightPath}`;
      return wrapOut(base, aviasalesUrl);
    }

    case "tripadvisor_attractions":
    case "tripadvisor_hotels":
    case "tripadvisor_restaurants": {
      const type = partner.partner_code.replace("tripadvisor_", "");
      const slug = mapping.city_slug;
      let url;

      if (!mapping.prefixed_geo_id) {
        switch (type) {
          case "attractions":
            url = `https://www.tripadvisor.com/Attractions--Activities-${slug}.html`;
            break;
          case "hotels":
            url = `https://www.tripadvisor.com/Hotels--${slug}-Hotels.html`;
            break;
          case "restaurants":
            url = `https://www.tripadvisor.com/Restaurants--${slug}.html`;
            break;
          default:
            url = `https://www.tripadvisor.com/Search?q=${slug}`;
        }
      } else {
        switch (type) {
          case "attractions":
            url = `https://www.tripadvisor.com/Attractions-${mapping.prefixed_geo_id}-Activities-${slug}.html`;
            break;
          case "hotels":
            url = `https://www.tripadvisor.com/Hotels-${mapping.prefixed_geo_id}-Hotels-${slug}.html`;
            break;
          case "restaurants":
            url = `https://www.tripadvisor.com/Restaurants-${mapping.prefixed_geo_id}-${slug}.html`;
            break;
          default:
            url = `https://www.tripadvisor.com/Search?q=${slug}`;
        }
      }

      return wrapOut(base, url);
    }

    default:
      return wrapOut(base, rawTarget || template || base);
  }

  function wrapOut(b, target) {
    const encoded = encodeURIComponent(target);
    const deep_link = wrapTpLink(b, target);
    return { deep_link, rawTarget: target, encodedTarget: encoded };
  }
}

// ----------------------------------------------------------
// Main handler (with dynamic fallback & smart default origin)
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
  const airportsCache = await preloadAirports();

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

  function getFallbackOrigin() {
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

      let mappings = await getPartnerMappings(partner.partner_code);
      const sliced = limit > 0 ? mappings.slice(0, limit) : mappings;

      if (fallbackCities.length > 0) {
        const { code: defaultOriginCode, city: defaultOriginCity } =
          getFallbackOrigin();
        let addedCount = 0;

        for (const slug of fallbackCities) {
          const alreadyMapped = mappings.some(
            (m) => m.city_slug && m.city_slug.toLowerCase() === slug.toLowerCase()
          );
          if (!alreadyMapped) {
            mappings.push({
              id: null,
              city_slug: slug,
              country_slug: null,
              destination_city: slug,
              origin_code: defaultOriginCode,
              origin_city: defaultOriginCity,
            });
            addedCount++;
          }
        }

        if (addedCount > 0) {
          console.log(
            `⚙️ Injected ${addedCount} fallback cities for ${partner.partner_code} (default origin: ${defaultOriginCode}/${defaultOriginCity})`
          );
        }
      }

      for (const mappingRow of mappings) {
        const mapping = { ...mappingRow };
        const destination_slug = mapping.city_slug || mapping.country_slug || "none";

        try {
          const isFallbackCity = mapping.id === null;

          if (!isFallbackCity) {
            await enrichFromAirportView(mapping);
          } else {
            const enriched = await enrichFromAirportView({ ...mapping });

            mapping.destination_code =
              mapping.destination_code || enriched.destination_code;
            mapping.iata_code = mapping.iata_code || enriched.iata_code;
            mapping.country_slug = mapping.country_slug || enriched.country_slug;
            mapping.country_code = mapping.country_code || enriched.country_code;
          }
        } catch (e) {
          console.warn(`✈️ Airport enrichment skipped for ${mapping.city_slug}:`, e.message);
        }

        // 🌍 TripAdvisor GEO enrichment (unified)
        if (partner.partner_code.startsWith("tripadvisor_")) {
          ensureTripadvisorGeoId(mapping);

          const geo = await resolveTripAdvisorGeo(
            mapping.city_slug,
            mapping.country_slug
          );

          if (geo) {
            mapping.geo_id = geo.geo_id;
            mapping.prefixed_geo_id = geo.prefixed;
            mapping.country_code = mapping.country_code || geo.country_code;
          } else {
            console.warn(`⚠️ TripAdvisor geo unresolved for ${mapping.city_slug}`);
          }
        }

        try {
          if (
            ["aviasales", "expedia_flights", "booking_kayak", "cheapoair"].includes(
              partner.partner_code
            )
          ) {
            if (!mapping.origin_code && flightPreviews[0]?.origin_code) {
              mapping.origin_code = flightPreviews[0].origin_code;
            }
            if (!mapping.origin_city && flightPreviews[0]?.origin_city) {
              mapping.origin_city = normalizePlaceName(flightPreviews[0].origin_city);
            }
          }

          if (mapping.origin_city) {
            mapping.origin_city = normalizePlaceName(mapping.origin_city);
            mapping.origin = mapping.origin || mapping.origin_city;
          } else if (req_origin_city) {
            mapping.origin_city = normalizePlaceName(req_origin_city);
            mapping.origin = mapping.origin || mapping.origin_city;
          } else if (req_origin) {
            mapping.origin = normalizePlaceName(req_origin);
            mapping.origin_city = mapping.origin_city || mapping.origin;
          } else {
            const fb = getFallbackOrigin();
            mapping.origin_code = mapping.origin_code || fb.code;
            mapping.origin_city = mapping.origin_city || fb.city;
          }

          if (mapping.destination_city) {
            mapping.destination_city = normalizePlaceName(mapping.destination_city);
            mapping.destination = mapping.destination || mapping.destination_city;
          } else if (mapping.city_slug) {
            mapping.destination_city = mapping.city_slug;
            mapping.destination = mapping.destination || mapping.destination_city;
          }

          const extras = { ...getFlightRange(), adults: 1 };
          const context = {
            origin_code: req_origin_code,
            origin_city: req_origin_city
              ? normalizePlaceName(req_origin_city)
              : undefined,
            origin: req_origin ? normalizePlaceName(req_origin) : undefined,
          };

          const {
            deep_link,
            rawTarget: raw_target,
            encodedTarget: encoded_target,
          } = buildDeepLink(partner, mapping, extras, context);

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

// ----------------------------------------------------------
// Airport & city enrichment (via vw_airport_lookup)
// ----------------------------------------------------------
async function enrichFromAirportView(mapping) {
  if (!mapping || !mapping.city_slug) return mapping;

  try {
    const { data, error } = await supabase
      .from("vw_airport_lookup")
      .select("iata_code, country_slug, country_code")
      .eq("city_slug", mapping.city_slug.toLowerCase())
      .maybeSingle();

    if (error) {
      console.warn("✈️ vw_airport_lookup fetch error:", error.message);
      return mapping;
    }

    if (data) {
      mapping.destination_code =
        mapping.destination_code || data.iata_code || mapping.destination_code;

      mapping.iata_code =
        mapping.iata_code || data.iata_code || mapping.iata_code;

      mapping.country_slug =
        mapping.country_slug || data.country_slug || mapping.country_slug;

      mapping.country_code =
        mapping.country_code || data.country_code || mapping.country_code;
    }
  } catch (e) {
    console.warn("✈️ enrichFromAirportView failed:", e.message);
  }

  return mapping;
}
