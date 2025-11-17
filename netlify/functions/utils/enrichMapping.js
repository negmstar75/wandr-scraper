/**
 * utils/enrichMapping.js
 * ----------------------------------------------------------
 * Centralized enrichment pipeline for destination mappings.
 * - Fast checkpoint: city_country_overrides (feature-flagged)
 * - Airport/IATA/ISO fallback (vw_airport_lookup + static maps)
 * - TripAdvisor geoId resolver (log → cache → API)
 * - Country slug normalization via iso_countries
 * - Static city-country hints (e.g., cairo → EG) as fallback
 * - Origin defaults for flight partners
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ----------------------------------------------------------
// 🔧 Feature flag: USE_CITY_OVERRIDES (default: true)
// ----------------------------------------------------------
const useOverrides =
  String(process.env.USE_CITY_OVERRIDES ?? "true").toLowerCase() === "true";

// ----------------------------------------------------------
// 🧰 Small utils
// ----------------------------------------------------------
function slugifyCountryName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// ----------------------------------------------------------
// 🔧 Static ISO / IATA / Country helpers (extend as needed)
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
// 🧷 Static city → ISO2 hints (fallback if DB override is off/missing)
// ----------------------------------------------------------
const CITY_COUNTRY_A2 = {
  cairo: "EG",
  baku: "AZ",
  "cape-town": "ZA",
  reykjavik: "IS",
  berlin: "DE",
  madrid: "ES",
  amsterdam: "NL",
};

// Helpful alias for country slug if we only have A2
const COUNTRY_SLUG_FROM_A2 = {
  EG: "egypt",
  US: "united-states-of-america",
  GB: "united-kingdom",
  NL: "netherlands",
  DE: "germany",
  ES: "spain",
  AZ: "azerbaijan",
  ZA: "south-africa",
  IS: "iceland",
};

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
// 🌍 iso_countries helpers (normalize codes → names → slugs)
// ----------------------------------------------------------
async function getCountryByAlpha2(alpha2) {
  if (!alpha2) return null;
  const { data, error } = await supabase
    .from("iso_countries")
    .select("name, alpha2")
    .eq("alpha2", alpha2.toUpperCase())
    .limit(1);

  if (error) {
    console.warn("iso_countries alpha2 lookup error:", error.message);
    return null;
  }
  return data?.[0] || null;
}

async function getCountryByName(name) {
  if (!name) return null;

  let { data, error } = await supabase
    .from("iso_countries")
    .select("name, alpha2")
    .eq("name", name)
    .limit(1);
  if (error) {
    console.warn("iso_countries name exact error:", error.message);
  }
  if (!data || !data.length) {
    const res = await supabase
      .from("iso_countries")
      .select("name, alpha2")
      .ilike("name", name)
      .limit(1);
    if (res.error) {
      console.warn("iso_countries name ilike error:", res.error.message);
      return null;
    }
    return res.data?.[0] || null;
  }
  return data[0] || null;
}

// ----------------------------------------------------------
// 🌍 TripAdvisor geoId resolver (log → cache → API → cache/log)
// (Lower priority than city override & airport lookup)
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
// 🔎 DB override: city_country_overrides (early checkpoint)
// ----------------------------------------------------------
async function getCityCountryOverride(citySlug) {
  if (!citySlug) return null;
  try {
    const { data, error } = await supabase
      .from("city_country_overrides")
      .select("city_slug, country_slug, iso2, iata_code, notes")
      .eq("city_slug", citySlug.toLowerCase())
      .maybeSingle();

    if (error) {
      console.warn("city_country_overrides lookup error:", error.message);
      return null;
    }
    return data || null;
  } catch (err) {
    console.warn("city_country_overrides exception:", err.message);
    return null;
  }
}

// ----------------------------------------------------------
// 🧠 Unified enrichment orchestrator
// ----------------------------------------------------------
async function enrichMapping(mapping, { partner_code = "", originFallback = {} } = {}) {
  if (!mapping) return mapping;

  // Ensure slugs
  mapping.city_slug = mapping.city_slug || mapping.country_slug || null;

  // Destination friendly name default
  if (!mapping.destination_city && mapping.city_slug) {
    mapping.destination_city = mapping.city_slug;
  }

  // ✅ 1) EARLY CHECKPOINT: city_country_overrides (feature-flagged)
  if (useOverrides && mapping.city_slug) {
    const override = await getCityCountryOverride(mapping.city_slug);
    if (override) {
      // Force the correct country + IATA for ambiguous cities
      mapping.country_slug ||= override.country_slug; // already a long-form slug in your seed
      mapping.country_code ||= override.iso2?.toUpperCase?.();
      if (override.iata_code) {
        mapping.iata_code ||= override.iata_code.toUpperCase();
        mapping.destination_code ||= override.iata_code.toUpperCase();
      }
    }
  }

  // 🧷 2) STATIC city → ISO2 hint (fallback if still missing)
  if (!mapping.country_code && mapping.city_slug) {
    const a2 = CITY_COUNTRY_A2[mapping.city_slug.toLowerCase()];
    if (a2) mapping.country_code = a2;
  }

  // ✈️ 3) Airport enrichment (trusted)
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

  // 🏷 4) ISO/IATA/Country slug minimal fallbacks (after airport & overrides)
  mapping.country_code ||= resolveIsoFromSlug(mapping.city_slug);
  mapping.iata_code ||= resolveIataFromSlug(mapping.city_slug);
  mapping.country_slug ||= resolveCountrySlugFromCity(mapping.city_slug);

  // 🌍 5) Normalize country_slug using iso_countries (never leave alpha2 in slug)
  try {
    if (mapping.country_code && mapping.country_code.length === 2) {
      const a2 = mapping.country_code.toUpperCase();
      const c = await getCountryByAlpha2(a2);
      mapping.country_slug = slugifyCountryName(
        c?.name || COUNTRY_SLUG_FROM_A2[a2] || mapping.country_slug || a2
      );
      mapping.country_code = a2;
    } else if (mapping.country_slug && mapping.country_slug.length === 2) {
      const a2 = mapping.country_slug.toUpperCase();
      const c = await getCountryByAlpha2(a2);
      mapping.country_slug = slugifyCountryName(c?.name || COUNTRY_SLUG_FROM_A2[a2] || a2);
      mapping.country_code = c?.alpha2?.toUpperCase() || mapping.country_code;
    } else if (mapping.country_slug && mapping.country_slug.length > 2 && !mapping.country_code) {
      const guessName = mapping.country_slug.replace(/-/g, " ");
      const c = await getCountryByName(guessName);
      if (c?.alpha2) {
        mapping.country_code = c.alpha2.toUpperCase();
        mapping.country_slug = slugifyCountryName(c.name);
      }
    }
  } catch (err) {
    console.warn("country normalization warning:", err.message);
  }

  // 🛑 6) City-specific hard fix (safety net; should be redundant with overrides)
  if (mapping.city_slug?.toLowerCase() === "cairo") {
    mapping.country_code = "EG";
    mapping.country_slug = "egypt";
    mapping.iata_code = "CAI";
    mapping.destination_code = "CAI";
    mapping.destination_city = "Cairo";
  }

  // 🌍 7) TripAdvisor enrichment for TA partners (LOW priority; do not override trusted)
  if (partner_code.startsWith("tripadvisor_")) {
    ensureTripadvisorGeoId(mapping);
    const geo = await resolveTripAdvisorGeo(mapping.city_slug, mapping.country_slug);
    if (geo) {
      mapping.geo_id = mapping.geo_id || geo.geo_id;
      mapping.prefixed_geo_id = mapping.prefixed_geo_id || geo.prefixed;
      mapping.country_code = mapping.country_code || geo.country_code;
    } else {
      console.warn(`⚠️ TripAdvisor geo unresolved for ${mapping.city_slug}`);
    }
  }

  // 🛫 8) Origin defaults
  mapping.origin_code ||= originFallback.code || process.env.DEFAULT_ORIGIN_CODE || "LON";
  mapping.origin_city ||= originFallback.city || process.env.DEFAULT_ORIGIN_CITY || "London";

  return mapping;
}

module.exports = {
  enrichMapping,
  // exports for testing/usage
  resolveIsoFromSlug,
  resolveIataFromSlug,
  resolveCountrySlugFromCity,
  ensureTripadvisorGeoId,
  resolveTripAdvisorGeo,
  enrichFromAirportView,
};
