// netlify/functions/getFullDestination.js
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

// --- Helpers ---
async function fetchJson(url, label) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${label} fetch failed (${res.status})`);
    return await res.json();
  } catch (err) {
    console.error(`[getFullDestination] ${label} error:`, err.message);
    return null;
  }
}

async function resolveRegionAndContinent(city, country) {
  let region = null;
  let continent = null;

  if (!country) return { region, continent };

  // 1. Try city_region_map
  try {
    const { data: cityRegion, error: cityErr } = await supabase
      .from("city_region_map")
      .select("region")
      .eq("city", city)
      .eq("country", country)
      .maybeSingle();

    if (cityRegion && cityRegion.region) region = cityRegion.region;
    if (cityErr) console.warn("city_region_map lookup error:", cityErr);
  } catch (e) {
    console.warn("city_region_map fetch failed:", e.message);
  }

  // 2. Try country_continent_map
  try {
    const { data: countryMap, error: countryErr } = await supabase
      .from("country_continent_map")
      .select("continent")
      .eq("country_code", country)
      .maybeSingle();

    if (countryMap && countryMap.continent) continent = countryMap.continent;
    if (countryErr) console.warn("country_continent_map lookup error:", countryErr);
  } catch (e) {
    console.warn("country_continent_map fetch failed:", e.message);
  }

  return { region, continent };
}

// --- Main handler ---
export async function handler(req) {
  try {
    const url = new URL(req.url);
    const city = url.searchParams.get("city");
    const limit = url.searchParams.get("limit") || 5;
    const mode = url.searchParams.get("mode") || "modular";
    const debug = url.searchParams.get("debug") === "true";

    if (!city) {
      return new Response(
        JSON.stringify({ error: "Missing required param: city" }),
        { status: 400 }
      );
    }

    // 1. Try cache first
    let { data: cached, error: cacheErr } = await supabase
      .from("destination_cache")
      .select("*")
      .eq("city", city)
      .maybeSingle();

    if (cached && !debug) {
      return new Response(JSON.stringify({ fromCache: true, ...cached }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Get geocode (Google / fallback OSM)
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      city
    )}&format=json&limit=1`;
    const geo = await fetchJson(geocodeUrl, "geocode");

    const lat = geo?.[0]?.lat || null;
    const lon = geo?.[0]?.lon || null;
    const country =
      geo?.[0]?.display_name?.split(",").pop()?.trim() || null;

    // 3. Parallel fetch for hotels, restaurants, attractions, weather, forecast
    const baseUrl = process.env.BASE_URL || "https://wandr-scrape.netlify.app/.netlify/functions";

    const [hotels, restaurants, attractions, weather, forecast] =
      await Promise.all([
        fetchJson(`${baseUrl}/getHotels?city=${city}&lat=${lat}&lon=${lon}&limit=${limit}`, "hotels"),
        fetchJson(`${baseUrl}/getRestaurants?city=${city}&lat=${lat}&lon=${lon}&limit=${limit}`, "restaurants"),
        fetchJson(`${baseUrl}/getCityAttractions?city=${city}&lat=${lat}&lon=${lon}&limit=${limit}`, "attractions"),
        fetchJson(`${baseUrl}/getWeather?city=${city}&lat=${lat}&lon=${lon}`, "weather"),
        fetchJson(`${baseUrl}/getForecast?city=${city}&lat=${lat}&lon=${lon}`, "forecast"),
      ]);

    // 4. Region + Continent resolution
    const { region, continent } = await resolveRegionAndContinent(city, country);

    const payload = {
      fromCache: false,
      city,
      country,
      region,
      continent,
      lat,
      lon,
      mode,
      hotels,
      restaurants,
      attractions,
      weather,
      forecast,
      source: ["google", "openweathermap", "osm"],
      fetched_at: new Date().toISOString(),
    };

    // 5. Upsert into cache
    const { error: upsertErr } = await supabase
      .from("destination_cache")
      .upsert(payload, { onConflict: "city,country" });

    if (upsertErr) {
      console.error("[getFullDestination] cache upsert error:", upsertErr);
    }

    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[getFullDestination] Fatal error:", err);
    return new Response(JSON.stringify({ error: "Server error", details: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
