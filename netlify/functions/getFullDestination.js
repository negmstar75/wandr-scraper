// /netlify/functions/getFullDestination.js
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
// Build Netlify function URL helper
// --------------------
function buildFunctionUrl(baseUrl, fnNameOrPath, query = "") {
  let path;
  if (fnNameOrPath.startsWith("/.netlify/functions/")) {
    path = `${fnNameOrPath}${query ? (fnNameOrPath.includes("?") ? `&${query}` : `?${query}`) : ""}`;
  } else {
    path = `/.netlify/functions/${fnNameOrPath}${query ? `?${query}` : ""}`;
  }
  return safeUrl(baseUrl, path);
}

// --------------------
// Netlify handler
// --------------------
export async function handler(event, context) {
  try {
    const params = event.queryStringParameters || {};
    const rawCity = params.city;
    const normalizedCity = rawCity ? rawCity.trim().toLowerCase() : null;

    const { mode = "modular", limit = 5 } = params;
    const debug = params.debug === "true" || params.debug === true || false;

    // Defensive check
    if (!normalizedCity) {
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

    console.log("[getFullDestination] Input params", { rawCity, normalizedCity, mode, limit, baseUrl });

    // --------------------
    // Cache check (case-insensitive)
    // --------------------
    let { data: cached } = await supabase
      .from("destination_cache")
      .select("*")
      .ilike("city", normalizedCity) // case-insensitive match
      .maybeSingle();

    if (cached) {
      console.log("[getFullDestination] Cache hit", { normalizedCity });
      return {
        statusCode: 200,
        body: JSON.stringify({ fromCache: true, ...cached }),
      };
    }

    console.log("[getFullDestination] Cache miss", { normalizedCity });

    // --------------------
    // Build API URLs
    // --------------------
    const hotelsUrl = buildFunctionUrl(baseUrl, "getHotels", `city=${encodeURIComponent(rawCity)}&limit=${limit}`);
    const restaurantsUrl = buildFunctionUrl(baseUrl, "getRestaurants", `city=${encodeURIComponent(rawCity)}&limit=${limit}`);
    const attractionsUrl = buildFunctionUrl(baseUrl, "getCityAttractions", `city=${encodeURIComponent(rawCity)}&limit=${limit}`);
    const weatherUrl = buildFunctionUrl(baseUrl, "getWeather", `city=${encodeURIComponent(rawCity)}`);
    const forecastUrl = buildFunctionUrl(baseUrl, "getForecast", `city=${encodeURIComponent(rawCity)}`);

    const urls = { hotelsUrl, restaurantsUrl, attractionsUrl, weatherUrl, forecastUrl };
    console.log("[getFullDestination] Built URLs", urls);

    // --------------------
    // Fetch helpers
    // --------------------
    const fetchJson = async (url, label) => {
      if (!url) {
        console.error(`[getFullDestination] Invalid URL for ${label}`, { url });
        return { error: "Invalid URL" };
      }
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          let bodyText = null;
          try {
            bodyText = await resp.text();
          } catch (e) {
            bodyText = `<unreadable body: ${e.message}>`;
          }
          const errMsg = `HTTP ${resp.status} - ${bodyText}`;
          console.error(`[getFullDestination] Fetch failed for ${label}`, { url, status: resp.status, body: bodyText });
          return { error: errMsg, status: resp.status, body: bodyText };
        }
        try {
          return await resp.json();
        } catch (parseErr) {
          const txt = await resp.text().catch(() => "<no body>");
          console.error(`[getFullDestination] JSON parse error for ${label}`, { url, parseErr, bodyPreview: txt.slice(0, 1000) });
          return { error: "Failed to parse JSON", body: txt };
        }
      } catch (err) {
        console.error(`[getFullDestination] Fetch failed for ${label}`, { url, err: err.message || err });
        return { error: err.message || String(err) };
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
    // Build metadata
    // --------------------
    const firstHotel = hotels?.hotels?.[0] || {};
    const firstAttraction = attractions?.attractions?.[0] || {};
    const firstRestaurant = restaurants?.restaurants?.[0] || {};

    // --------------------
    // Insert into cache
    // --------------------
    const payload = {
      city: normalizedCity,       // always lowercase for consistency
      display_city: rawCity,      // preserve original input casing
      country: firstHotel.country || firstAttraction.country || firstRestaurant.country || null,
      region: null,
      continent: null,
      lat: firstHotel.lat || firstAttraction.lat || firstRestaurant.lat || null,
      lon: firstHotel.lon || firstAttraction.lon || firstRestaurant.lon || null,
      mode,
      hotels: Array.isArray(hotels?.hotels) ? hotels.hotels : null,
      restaurants: Array.isArray(restaurants?.restaurants) ? restaurants.restaurants : null,
      attractions: Array.isArray(attractions?.attractions) ? attractions.attractions : null,
      weather: weather && !weather.error ? weather : null,
      forecast: forecast && !forecast.error ? forecast : null,
      source: ["google", "openweathermap", "osm"],
      fetched_at: new Date().toISOString(),
    };

    console.log("[getFullDestination] Payload before insert", JSON.stringify(payload, null, 2));

    const { error: insertError } = await supabase.from("destination_cache").insert(payload);
    if (insertError) {
      console.error("[getFullDestination] Cache insert failed", insertError);
    } else {
      console.log("[getFullDestination] Cache insert success", { normalizedCity });
    }

    // --------------------
    // Response
    // --------------------
    const response = { fromCache: false, ...payload };
    if (debug) response.debug = { urls, hotels, restaurants, attractions, weather, forecast, insertError };

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
