import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

// --------------------
// Supabase client
// --------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --------------------
// Safe URL builder
// --------------------
function safeUrl(base, path) {
  try {
    if (!base || !path) {
      console.error("[safeUrl] Missing base or path", { base, path });
      return null;
    }
    return new URL(path, base).toString();
  } catch (err) {
    console.error("[safeUrl] Invalid URL", { base, path, err });
    return null;
  }
}

// --------------------
// Netlify handler
// --------------------
export async function handler(event, context) {
  try {
    const params = event.queryStringParameters || {};
    const { city, mode = "modular", limit = 5, debug = false } = params;

    // Defensive check
    if (!city) {
      console.error("[getFullDestination] Missing 'city' param", { params });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required 'city' query param" }),
      };
    }

    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      console.error("[getFullDestination] Missing BASE_URL env var");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Server misconfiguration: BASE_URL not set" }),
      };
    }

    // Log inputs
    console.log("[getFullDestination] Input params", { city, mode, limit, baseUrl });

    // --------------------
    // Cache check
    // --------------------
    let { data: cached } = await supabase
      .from("destination_cache")
      .select("*")
      .eq("city", city)
      .maybeSingle();

    if (cached) {
      console.log("[getFullDestination] Cache hit", { city });
      return {
        statusCode: 200,
        body: JSON.stringify({ fromCache: true, ...cached }),
      };
    }

    console.log("[getFullDestination] Cache miss", { city });

    // --------------------
    // Build API URLs
    // --------------------
    const hotelsUrl = safeUrl(baseUrl, `/getHotels?city=${encodeURIComponent(city)}&limit=${limit}`);
    const restaurantsUrl = safeUrl(baseUrl, `/getRestaurants?city=${encodeURIComponent(city)}&limit=${limit}`);
    const attractionsUrl = safeUrl(baseUrl, `/getCityAttractions?city=${encodeURIComponent(city)}&limit=${limit}`);
    const weatherUrl = safeUrl(baseUrl, `/getWeather?city=${encodeURIComponent(city)}`);
    const forecastUrl = safeUrl(baseUrl, `/getForecast?city=${encodeURIComponent(city)}`);

    const urls = { hotelsUrl, restaurantsUrl, attractionsUrl, weatherUrl, forecastUrl };
    console.log("[getFullDestination] Built URLs", urls);

    // --------------------
    // Fetch helpers
    // --------------------
    const fetchJson = async (url, label) => {
      if (!url) return { error: "Invalid URL" };
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        return await resp.json();
      } catch (err) {
        console.error(`[getFullDestination] Fetch failed for ${label}`, { url, err });
        return { error: err.message };
      }
    };

    // --------------------
    // Parallel fetch
    // --------------------
    const [hotels, restaurants, attractions, weather, forecast] = await Promise.all([
      fetchJson(hotelsUrl, "hotels"),
      fetchJson(restaurantsUrl, "restaurants"),
      fetchJson(attractionsUrl, "attractions"),
      fetchJson(weatherUrl, "weather"),
      fetchJson(forecastUrl, "forecast"),
    ]);

    // --------------------
    // Insert into cache
    // --------------------
    const payload = {
      city,
      country: hotels?.country || null,
      region: null,
      continent: null,
      lat: hotels?.lat || null,
      lon: hotels?.lon || null,
      mode,
      hotels: Array.isArray(hotels) ? hotels : null,
      restaurants: Array.isArray(restaurants) ? restaurants : null,
      attractions: Array.isArray(attractions) ? attractions : null,
      weather: weather && !weather.error ? weather : null,
      forecast: forecast && !forecast.error ? forecast : null,
      source: ["google", "openweathermap", "osm"],
      fetched_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from("destination_cache").insert(payload);
    if (insertError) {
      console.error("[getFullDestination] Cache insert failed", insertError);
    } else {
      console.log("[getFullDestination] Cache insert success", { city });
    }

    // --------------------
    // Response
    // --------------------
    const response = { fromCache: false, ...payload };
    if (debug) response.debug = { urls, insertError };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    };

  } catch (err) {
    console.error("[getFullDestination] Fatal error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error", details: err.message }),
    };
  }
}
