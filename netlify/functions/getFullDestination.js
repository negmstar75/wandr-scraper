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
// Ensures we call the actual function path: / .netlify/functions/{name}
// Accepts either a function name (getHotels) or a full path (/.netlify/functions/getHotels)
function buildFunctionUrl(baseUrl, fnNameOrPath, query = "") {
  // If caller passed a full path starting with /.netlify/functions, use it.
  let path;
  if (fnNameOrPath.startsWith("/.netlify/functions/")) {
    path = `${fnNameOrPath}${query ? (fnNameOrPath.includes("?") ? `&${query}` : `?${query}`) : ""}`;
  } else {
    // fnNameOrPath is a short name like "getHotels"
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
    // note: query params are strings; keep your previous defaults
    const { city, mode = "modular", limit = 5 } = params;
    // debug param might be a string; treat existence as true
    const debug = params.debug === "true" || params.debug === true || false;

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
    // Build API URLs (correct Netlify functions path)
    // --------------------
    const hotelsUrl = buildFunctionUrl(baseUrl, "getHotels", `city=${encodeURIComponent(city)}&limit=${limit}`);
    const restaurantsUrl = buildFunctionUrl(baseUrl, "getRestaurants", `city=${encodeURIComponent(city)}&limit=${limit}`);
    const attractionsUrl = buildFunctionUrl(baseUrl, "getCityAttractions", `city=${encodeURIComponent(city)}&limit=${limit}`);
    const weatherUrl = buildFunctionUrl(baseUrl, "getWeather", `city=${encodeURIComponent(city)}`);
    const forecastUrl = buildFunctionUrl(baseUrl, "getForecast", `city=${encodeURIComponent(city)}`);

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
          // attempt to capture response body for debugging (text first, fallback to status)
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
        // parse JSON safely
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
    const [
      hotels,
      restaurants,
      attractions,
      weather,
      forecast
    ] = await Promise.all([
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
