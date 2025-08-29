import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// --- Helper: Get coordinates & English country/region/continent ---
async function geocodeCity(city) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
      city
    )}&format=json&addressdetails=1&limit=1`;
    console.log("[Geocode] Request:", url);

    const res = await fetch(url, { headers: { "User-Agent": "WandrApp/1.0" } });
    if (!res.ok) throw new Error(`Geocode HTTP error: ${res.status}`);

    const data = await res.json();
    if (!data || data.length === 0) {
      console.warn("[Geocode] No results for:", city);
      return {};
    }

    const item = data[0];
    const address = item.address || {};

    return {
      lat: item.lat,
      lon: item.lon,
      country: address.country || null,
      region: address.state || address.region || null,
      continent: address.continent || null,
      raw: item,
    };
  } catch (err) {
    console.error("[Geocode] Error:", err.message);
    return {};
  }
}

// --- Helper: Fetch JSON safely ---
async function safeFetchJson(url, label) {
  try {
    console.log(`[Fetch] ${label}:`, url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[Fetch] ${label} failed:`, err.message);
    return { error: err.message };
  }
}

export async function handler(event) {
  try {
    const params = event.queryStringParameters || {};
    const city = params.city;
    const mode = params.mode || "modular";
    const debug = params.debug === "true";

    if (!city) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing ?city=" }),
      };
    }

    // 1. Check cache first
    console.log("[Cache] Checking for city:", city);
    let { data: cached, error: cacheError } = await supabase
      .from("destination_cache")
      .select("*")
      .ilike("city", city)
      .maybeSingle();

    if (cacheError) {
      console.error("[Cache] Select error:", cacheError.message);
    }

    if (cached) {
      console.log("[Cache] HIT:", cached.city, cached.country);
      return {
        statusCode: 200,
        body: JSON.stringify({
          ...cached,
          fromCache: true,
        }),
      };
    }

    console.log("[Cache] MISS → Fetching live APIs");

    // 2. Geocode city → ensure English country/region/continent
    const geo = await geocodeCity(city);
    const { lat, lon, country, region, continent } = geo;

    // 3. Build URLs for modular mode
    const baseUrl = process.env.BASE_URL || "https://wandr-scrape.netlify.app/.netlify/functions";

    const urls = {
      hotels: `${baseUrl}/getHotels?city=${encodeURIComponent(city)}&lat=${lat || ""}&lon=${lon || ""}&limit=2`,
      restaurants: `${baseUrl}/getRestaurants?city=${encodeURIComponent(city)}&lat=${lat || ""}&lon=${lon || ""}&limit=2`,
      attractions: `${baseUrl}/getCityAttractions?city=${encodeURIComponent(city)}&limit=2`,
      weather: `${baseUrl}/getWeather?city=${encodeURIComponent(city)}`,
      forecast: `${baseUrl}/getForecast?city=${encodeURIComponent(city)}`,
    };

    // 4. Fetch in parallel
    const [hotels, restaurants, attractions, weather, forecast] = await Promise.all([
      safeFetchJson(urls.hotels, "Hotels"),
      safeFetchJson(urls.restaurants, "Restaurants"),
      safeFetchJson(urls.attractions, "Attractions"),
      safeFetchJson(urls.weather, "Weather"),
      safeFetchJson(urls.forecast, "Forecast"),
    ]);

    // 5. Prepare cache row (English country enforced)
    const cacheRow = {
      city,
      country: country || null,
      region: region || null,
      continent: continent || null,
      lat: lat ? parseFloat(lat) : null,
      lon: lon ? parseFloat(lon) : null,
      mode,
      hotels,
      restaurants,
      attractions,
      weather,
      forecast,
      source: ["google", "openweathermap"],
      fetched_at: new Date().toISOString(),
    };

    // 6. UPSERT to Supabase
    console.log("[Cache] UPSERT row:", cacheRow);

    const { data: upsertData, error: upsertError } = await supabase
      .from("destination_cache")
      .upsert(cacheRow, { onConflict: ["city", "country"] })
      .select()
      .single();

    if (upsertError) {
      console.error("[Cache] Upsert error:", upsertError.message);
    } else {
      console.log("[Cache] Upsert success:", upsertData.city, upsertData.country);
    }

    // 7. Return final response
    return {
      statusCode: 200,
      body: JSON.stringify({
        ...cacheRow,
        fromCache: false,
        debug: debug ? { geo, urls } : undefined,
      }),
    };
  } catch (err) {
    console.error("[Handler] Fatal error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error", details: err.message }),
    };
  }
}
