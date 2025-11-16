// utils/enrichMapping.js
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -----------------------------------------------------------------------------
// 🔧 Fallback maps
// -----------------------------------------------------------------------------
function resolveIsoFromSlug(slug) {
  const map = {
    madrid: "ES",
    berlin: "DE",
    amsterdam: "NL",
    "cape-town": "ZA",
    baku: "AZ",
    reykjavik: "IS",
    cairo: "EG",
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
    cairo: "CAI",
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

// -----------------------------------------------------------------------------
// ✈️ Airport view enrichment (vw_airport_lookup)
// -----------------------------------------------------------------------------
async function enrichFromAirportView(mapping) {
  if (!mapping?.city_slug) return mapping;

  try {
    const { data, error } = await supabase
      .from("vw_airport_lookup")
      .select("iata_code, country_slug, country_code")
      .eq("city_slug", mapping.city_slug.toLowerCase())
      .maybeSingle();

    if (error) {
      console.warn("✈️ enrichFromAirportView error:", error.message);
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

// -----------------------------------------------------------------------------
// 🌍 TripAdvisor geoId resolution (cache → log → API → cache)
// -----------------------------------------------------------------------------
async function resolveTripAdvisorGeo(citySlug, countrySlug = null) {
  if (!citySlug) return null;

  // 1. geo_enrichment_log
  let { data: geo } = await supabase
    .from("geo_enrichment_log")
    .select("new_geo_id, prefixed_geo_id, country_code")
    .eq("city_slug", citySlug)
    .eq("country_slug", countrySlug || "")
    .maybeSingle();

  if (geo?.new_geo_id) {
    return {
      geo_id: geo.new_geo_id,
      prefixed: geo.prefixed_geo_id || `g${geo.new_geo_id}`,
      country_code: geo.country_code || null,
    };
  }

  return null;
}

// -----------------------------------------------------------------------------
// ✅ Main Enrichment Orchestrator
// -----------------------------------------------------------------------------
async function enrichMapping(mapping, { partner_code = "", originFallback = {} } = {}) {
  const city_slug = mapping.city_slug || mapping.country_slug || null;
  const isFallback = !mapping.id;

  if (!mapping.destination_city && city_slug) {
    mapping.destination_city = city_slug;
  }

  // 🧭 Airport enrichment
  if (!isFallback) {
    mapping = await enrichFromAirportView(mapping);
  } else {
    const enriched = await enrichFromAirportView({ city_slug });
    mapping.destination_code ||= enriched.destination_code;
    mapping.iata_code ||= enriched.iata_code;
    mapping.country_slug ||= enriched.country_slug;
    mapping.country_code ||= enriched.country_code;
  }

  // 🌍 TripAdvisor geo enrichment
  if (partner_code.startsWith("tripadvisor_")) {
    if (!mapping.prefixed_geo_id && mapping.city_slug) {
      const geo = await resolveTripAdvisorGeo(mapping.city_slug, mapping.country_slug);
      if (geo) {
        mapping.geo_id = geo.geo_id;
        mapping.prefixed_geo_id = geo.prefixed;
        mapping.country_code ||= geo.country_code;
      }
    }
  }

  // 🏷 ISO fallback
  mapping.country_code ||= resolveIsoFromSlug(mapping.city_slug);
  mapping.iata_code ||= resolveIataFromSlug(mapping.city_slug);
  mapping.country_slug ||= resolveCountrySlugFromCity(mapping.city_slug);

  // 🛫 Origin fallback
  mapping.origin_code ||= originFallback.code || "CAI";
  mapping.origin_city ||= originFallback.city || "Cairo";

  return mapping;
}

module.exports = {
  enrichMapping,
  resolveIsoFromSlug,
  resolveIataFromSlug,
  resolveCountrySlugFromCity,
};
