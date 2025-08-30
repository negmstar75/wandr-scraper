// /netlify/functions/getFullDestination.js
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --------------------
// Helpers
// --------------------
function safeUrl(base, path) {
  try {
    return new URL(path, base).toString();
  } catch (err) {
    console.error("[safeUrl] Invalid URL", { base, path, err });
    return null;
  }
}

function buildFunctionUrl(baseUrl, fnNameOrPath, query = "") {
  const path = fnNameOrPath.startsWith("/.netlify/functions/")
    ? `${fnNameOrPath}${query ? (fnNameOrPath.includes("?") ? `&${query}` : `?${query}`) : ""}`
    : `/.netlify/functions/${fnNameOrPath}${query ? `?${query}` : ""}`;
  return safeUrl(baseUrl, path);
}

function toTitleCase(input) {
  if (!input || typeof input !== "string") return input;
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

async function nominatimSearchCity(rawCity) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(rawCity)}&format=json&limit=1&addressdetails=1`;
    const res = await fetch(url, { headers: { "User-Agent": "WandrApp/1.0 (contact@yourdomain.com)" } });
    if (!res.ok) return null;
    const j = await res.json();
    return Array.isArray(j) && j.length > 0 ? j[0] : null;
  } catch (err) {
    console.error("[nominatimSearchCity] error", err);
    return null;
  }
}

async function lookupContinentByCountryCode(code) {
  if (!code) return null;
  const { data, error } = await supabase
    .from("country_continent_map")
    .select("continent")
    .ilike("country_code", code)
    .maybeSingle();
  if (error) console.error("[lookupContinentByCountryCode] db error", error);
  return data?.continent ?? null;
}

async function lookupRegionByCityCountry(normalizedCity, countryName) {
  if (!normalizedCity) return null;
  let { data, error } = await supabase
    .from("city_region_map")
    .select("region")
    .ilike("country", countryName || "")
    .ilike("city", normalizedCity)
    .maybeSingle();
  if (error) console.error("[lookupRegionByCityCountry] db error", error);
  if (data?.region) return data.region;

  ({ data, error } = await supabase
    .from("city_region_map")
    .select("region")
    .ilike("city", normalizedCity)
    .maybeSingle());
  if (error) console.error("[lookupRegionByCityCountry] fallback error", error);
  return data?.region ?? null;
}

// --------------------
// Handler
// --------------------
export async function handler(event) {
  try {
    const params = event.queryStringParameters || {};
    const rawCity = params.city;
    const mode = params.mode ?? "modular";
    const limit = params.limit ?? 5;
    const debug = params.debug === "true";

    if (!rawCity) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing 'city' query param" }) };
    }
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      return { statusCode: 500, body: JSON.stringify({ error: "BASE_URL not set" }) };
    }

    const normalizedCity = rawCity.trim().toLowerCase();
    const displayCityCandidate = toTitleCase(rawCity.trim());

    // --- Cache check
    let { data: cached } = await supabase
      .from("destination_cache")
      .select("*")
      .eq("city", normalizedCity)
      .maybeSingle();
    if (cached) {
      return { statusCode: 200, body: JSON.stringify({ fromCache: true, ...cached }) };
    }

    // --- Build subfunction URLs
    const hotelsUrl = buildFunctionUrl(baseUrl, "getHotels", `city=${encodeURIComponent(rawCity)}&limit=${limit}`);
    const restaurantsUrl = buildFunctionUrl(baseUrl, "getRestaurants", `city=${encodeURIComponent(rawCity)}&limit=${limit}`);
    const attractionsUrl = buildFunctionUrl(baseUrl, "getCityAttractions", `city=${encodeURIComponent(rawCity)}&limit=${limit}`);
    const weatherUrl = buildFunctionUrl(baseUrl, "getWeather", `city=${encodeURIComponent(rawCity)}`);
    const forecastUrl = buildFunctionUrl(baseUrl, "getForecast", `city=${encodeURIComponent(rawCity)}`);

    const fetchJson = async (url) => {
      try {
        const r = await fetch(url);
        return r.ok ? r.json() : null;
      } catch {
        return null;
      }
    };

    const [hotels, restaurants, attractions, weather, forecast] = await Promise.all([
      fetchJson(hotelsUrl),
      fetchJson(restaurantsUrl),
      fetchJson(attractionsUrl),
      fetchJson(weatherUrl),
      fetchJson(forecastUrl),
    ]);

    // --- Extract info
    const first = hotels?.hotels?.[0] || attractions?.attractions?.[0] || restaurants?.restaurants?.[0] || {};
    let country = first.country || first.address?.country || null;
    let country_code = first.country_code || first.address?.country_code?.toUpperCase() || null;
    let lat = first.lat || null;
    let lon = first.lon || null;

    if (!country || !country_code) {
      const nom = await nominatimSearchCity(rawCity);
      if (nom) {
        country = country || nom.address?.country;
        country_code = country_code || nom.address?.country_code?.toUpperCase();
        lat = lat || nom.lat;
        lon = lon || nom.lon;
      }
    }

    const display_city = displayCityCandidate;
    const continent = await lookupContinentByCountryCode(country_code);
    const region = await lookupRegionByCityCountry(normalizedCity, country);

    // --- Build payload
    const payload = {
      city: normalizedCity,
      display_city,
      country,
      country_code,
      continent,
      region,
      lat,
      lon,
      mode,
      hotels: hotels?.hotels ?? null,
      restaurants: restaurants?.restaurants ?? null,
      attractions: attractions?.attractions ?? null,
      weather: weather || null,
      forecast: forecast || null,
      source: ["google", "openweathermap", "osm"],
      fetched_at: new Date().toISOString(),
    };

    // --- Upsert (insert or update on conflict)
    const { error } = await supabase
      .from("destination_cache")
      .upsert(payload, { onConflict: "city,country" });
    if (error) console.error("[getFullDestination] upsert error", error);

    const response = { fromCache: false, ...payload };
    if (debug) response.debug = { hotelsUrl, restaurantsUrl, attractionsUrl, weatherUrl, forecastUrl };
    return { statusCode: 200, body: JSON.stringify(response) };
  } catch (err) {
    console.error("[getFullDestination] Fatal error", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error", details: err.message }) };
  }
}
