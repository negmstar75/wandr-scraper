/**
 * utils/enrichMapping.js
 * ----------------------------------------------------------
 * Centralized enrichment pipeline for destination mappings.
 * - Airport/IATA/ISO fallback (vw_airport_lookup + static maps)
 * - TripAdvisor geoId resolver (log → cache → API) + ensure prefixed id
 * - Country slug fallback for partners that require both city + country
 * - Origin default fallback for flight partners
 *
 * Note: This module is self-contained. It does NOT rely on helpers in other files.
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ----------------------------------------------------------
// 🔧 Static ISO / IATA / Country helpers (extend liberally)
// ----------------------------------------------------------
function resolveIsoFromSlug(slug) {
  const map = {
    cairo: "EG",
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
    cairo: "CAI",
    madrid: "MAD",
    berlin: "BER",
    amsterdam: "AMS",
    "cape-town": "CPT",
    baku: "GYD",
    reykjavik: "REK",
  };
  return map[slug?.toLowerCase()] || null;
}

function resolveCountrySlugFromCity(citySlug) {
  const map = {
    cairo: "egypt",
    madrid: "spain",
    berlin: "germany",
    amsterdam: "netherlands",
    "cape-town": "south-africa",
    baku: "azerbaijan",
    reykjavik: "iceland",
  };
  return map[citySlug?.toLowerCase()] || null;
}

// ----------------------------------------------------------
// ✅ TripAdvisor: ensure prefixed_geo_id when geo_id exists
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
// ✈️ Airport enrichment via vw_airport_lookup
// ----------------------------------------------------------
async function enrichFromAirportView(mapping) {
  if (!mapping?.city_slug) return mapping;

  try {
    const { data, error } = await supabase
      .from("vw_airport_lookup")
      .select("iata_code, country_slug, country_code")
      .eq("city_slug", mapping.city_slug.toLowerCase())
      .maybeSingle();

    if (error) {
      console.warn("✈️ vw_airport_lookup error:", error.message);
      return mapping;
    }

    if (data) {
      mapping.destination_code ||= data.iata_code;
      mapping.iata_code ||= data.iata_code;
      mapping.country_slug ||= data.country_slug;
      mapping.country_code ||= data.country_code;
    }
  } catch (err) {
    console.warn("✈️ enrichFromAirportView exception:", err.message);
  }

  return mapping;
}

// ----------------------------------------------------------
// 🌍 TripAdvisor geoId resolver (log → cache → API → cache/log)
// Mirrors the previously working in-function logic.
// ----------------------------------------------------------
async function resolveTripAdvisorGeo(citySlug, countrySlug = null) {
  if (!citySlug) return null;

  // 1) geo_enrichment_log (city+country)
  let { data: geo1 } = await supabase
    .from("geo_enrichment_log")
    .select("new_geo_id, prefixed_geo_id, country_code, country_name")
    .eq("city_slug", citySlug)
    .eq("country_slug", countrySlug)
    .maybeSingle();

  if (geo1?.new_geo_id) {
    return {
      geo_id: geo1.new_geo_id,
      prefixed: geo1.prefixed_geo_id || `g${geo1.new_geo_id}`,
      country_code: geo1.country_code || null,
      country_name: geo1.country_name || null,
    };
  }

  // 2) geo_enrichment_log (city only)
  let { data: geo2 } = await supabase
    .from("geo_enrichment_log")
    .select("new_geo_id, prefixed_geo_id, country_code, country_name")
    .eq("city_slug", citySlug)
    .maybeSingle();

  if (geo2?.new_geo_id) {
    return {
      geo_id: geo2.new_geo_id,
      prefixed: geo2.prefixed_geo_id || `g${geo2.new_geo_id}`,
      country_code: geo2.country_code || null,
      country_name: geo2.country_name || null,
    };
  }

  // 3) tripadvisor_cache (json-based)
  const { data: cached } = await supabase
    .from("tripadvisor_cache")
    .select("response, country_slug")
    .eq("query", citySlug)
    .maybeSingle();

  if (cached?.response?.json?.data?.length) {
    const best = cached.response.json.data[0];
    const geoId = best.location_id;

    return {
      geo_id: geoId,
      prefixed: `g${geoId}`,
      country_code: best.address_obj?.countrycode?.toUpperCase?.() || null,
      country_name: best.address_obj?.country || null,
    };
  }

  // 4) Official TripAdvisor API
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

    if (!json?.data?.length) return null;

    const best = json.data[0];
    const geoId = best.location_id;
    const country_code =
      best.address_obj?.countrycode?.toUpperCase?.() || null;
    const country_name = best.address_obj?.country || null;

    // 🔘 Cache write
    await supabase.from("tripadvisor_cache").upsert(
      {
        query: citySlug,
        country_slug: countrySlug,
        response: { json },
        fetched_at: new Date().toISOString(),
      },
      {
        onConflict: "query,country_slug",
      }
    );

    // 🔘 Log write
    await supabase.from("geo_enrichment_log").upsert(
      {
        city_slug: citySlug,
        country_slug: countrySlug,
        new_geo_id: geoId,
        country_code,
        country_name,
        prefixed_geo_id: `g${geoId}`,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "city_slug,country_slug",
      }
    );

    return {
      geo_id: geoId,
      prefixed: `g${geoId}`,
      country_code,
      country_name,
    };
  } catch (err) {
    console.warn("⚠️ TripAdvisor API error:", err.message);
    return null;
  }
}

// ----------------------------------------------------------
// 🧠 Unified enrichment orchestrator (used by main function)
// ----------------------------------------------------------
async function enrichMapping(mapping, { partner_code = "", originFallback = {} } = {}) {
  if (!mapping) return mapping;

  // Ensure core slugs
  mapping.city_slug = mapping.city_slug || mapping.country_slug || null;

  // Destination friendly name default
  if (!mapping.destination_city && mapping.city_slug) {
    mapping.destination_city = mapping.city_slug;
  }

  // ✈️ Airport enrichment (handles IATA + country info)
  const isFallback = !mapping.id;
  if (!isFallback) {
    mapping = await enrichFromAirportView(mapping);
  } else if (mapping.city_slug) {
    const enriched = await enrichFromAirportView({ city_slug: mapping.city_slug });
    mapping.destination_code ||= enriched?.destination_code;
    mapping.iata_code ||= enriched?.iata_code;
    mapping.country_slug ||= enriched?.country_slug;
    mapping.country_code ||= enriched?.country_code;
  }

  // 🌍 TripAdvisor enrichment for TA partners (prefixed geo id is key)
  if (partner_code.startsWith("tripadvisor_")) {
    ensureTripadvisorGeoId(mapping);
    const geo = await resolveTripAdvisorGeo(mapping.city_slug, mapping.country_slug);
    if (geo) {
      mapping.geo_id = geo.geo_id;
      mapping.prefixed_geo_id = geo.prefixed;
      mapping.country_code ||= geo.country_code;
    } else {
      console.warn(`⚠️ TripAdvisor geo unresolved for ${mapping.city_slug}`);
    }
  }

  // 🏷 ISO/IATA/Country slug fallbacks
  mapping.country_code ||= resolveIsoFromSlug(mapping.city_slug);
  mapping.iata_code ||= resolveIataFromSlug(mapping.city_slug);
  mapping.country_slug ||= resolveCountrySlugFromCity(mapping.city_slug);

  // 🛫 Origin defaults (kept for flight partners consistency)
  mapping.origin_code ||= originFallback.code || process.env.DEFAULT_ORIGIN_CODE || "LON";
  mapping.origin_city ||= originFallback.city || process.env.DEFAULT_ORIGIN_CITY || "London";

  return mapping;
}

module.exports = {
  // main orchestrator
  enrichMapping,

  // exported in case main wants to reuse or test them
  resolveIsoFromSlug,
  resolveIataFromSlug,
  resolveCountrySlugFromCity,
  ensureTripadvisorGeoId,
  resolveTripAdvisorGeo,
  enrichFromAirportView,
};
