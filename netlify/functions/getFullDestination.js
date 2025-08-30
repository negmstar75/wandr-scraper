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
    path = `${fnNameOrPath}${
      query ? (fnNameOrPath.includes("?") ? `&${query}` : `?${query}`) : ""
    }`;
  } else {
    path = `/.netlify/functions/${fnNameOrPath}${query ? `?${query}` : ""}`;
  }
  return safeUrl(baseUrl, path);
}

// --------------------
// Region + Continent helpers
// --------------------
async function lookupRegionAndContinent(city, country, countryCode) {
  let region = null;
  let continent = null;

  try {
    if (country) {
      const { data: regionRow } = await supabase
        .from("city_region_map")
        .select("region")
        .eq("city", city.toLowerCase())
        .eq("country", country)
        .maybeSingle();
      if (regionRow?.region) region = regionRow.region;
    }

    if (countryCode) {
      const { data: contRow } = await supabase
        .from("country_continent_map")
        .select("continent")
        .eq("country_code", countryCode)
        .maybeSingle();
      if (contRow?.continent) continent = contRow.continent;
    }
  } catch (err) {
    console.error("[lookupRegionAndContinent] Failed", { city, country, err });
  }

  return { region, continent };
}

// --------------------
// Netlify handler
// --------------------
export async function handler(event, context) {
  try {
    const params = event.queryStringParameters || {};
    const { city, mode = "modular", limit = 5 } = params;
    const debug = params.debug === "true" || params.debug === true || false;

    if (!city) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required 'city' query param" }),
      };
    }

    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Server misconfiguration: BASE_URL not set" }),
      };
    }

    // normalize for lookups + display
    const normalizedCity = city.trim().toLowerCase();
    const displayCity =
      city.trim().charAt(0).toUpperCase() + city.trim().slice(1);

    console.log("[getFullDestination] Input params", {
      city,
      normalizedCity,
      displayCity,
      mode,
      limit,
      baseUrl,
    });

    // --------------------
    // Cache check
    // --------------------
    let { data: cached } = await supabase
      .from("destination_cache")
      .select("*")
      .eq("city", normalizedCity)
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
    const hotelsUrl = buildFunctionUrl(
      baseUrl,
      "getHotels",
      `city=${encodeURIComponent(city)}&limit=${limit}`
    );
    const restaurantsUrl = buildFunctionUrl(
      baseUrl,
      "getRestaurants",
      `city=${encodeURIComponent(city)}&limit=${limit}`
    );
    const attractionsUrl = buildFunctionUrl(
      baseUrl,
      "getCityAttractions",
      `city=${encodeURIComponent(city)}&limit=${limit}`
    );
    const weatherUrl = buildFunctionUrl(
      baseUrl,
      "getWeather",
      `city=${encodeURIComponent(city)}`
    );
    const forecastUrl = buildFunctionUrl(
      baseUrl,
      "getForecast",
      `city=${encodeURIComponent(city)}`
    );

    const urls = {
      hotelsUrl,
      restaurantsUrl,
      attractionsUrl,
      weatherUrl,
      forecastUrl,
    };
    console.log("[getFullDestination] Built URLs", urls);

    // --------------------
    // Fetch helper
    // --------------------
    const fetchJson = async (url, label) => {
      if (!url) return { error: "Invalid URL" };
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          let bodyText = null;
          try {
            bodyText = await resp.text();
          } catch {
            bodyText = "<unreadable>";
          }
          console.error(`[getFullDestination] Fetch failed for ${label}`, {
            url,
            status: resp.status,
            body: bodyText,
          });
          return { error: `HTTP ${resp.status}`, body: bodyText };
        }
        return await resp.json();
      } catch (err) {
        console.error(`[getFullDestination] Fetch failed for ${label}`, {
          url,
          err,
        });
        return { error: err.message };
      }
    };

    // --------------------
    // Parallel fetch
    // --------------------
    const [hotels, restaurants, attractions, weather, forecast] =
      await Promise.all([
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

    const country =
      firstHotel.country || firstAttraction.country || firstRestaurant.country;
    const countryCode =
      firstHotel.country_code ||
      firstAttraction.country_code ||
      firstRestaurant.country_code;

    const { region, continent } = await lookupRegionAndContinent(
      normalizedCity,
      country,
      countryCode
    );

    // --------------------
    // Insert into cache
    // --------------------
    const payload = {
      city: normalizedCity,
      display_city: displayCity,
      country: country || null,
      country_code: countryCode || null,
      region: region || null,
      continent: continent || null,
      lat:
        firstHotel.lat || firstAttraction.lat || firstRestaurant.lat || null,
      lon:
        firstHotel.lon || firstAttraction.lon || firstRestaurant.lon || null,
      mode,
      hotels: Array.isArray(hotels?.hotels) ? hotels.hotels : null,
      restaurants: Array.isArray(restaurants?.restaurants)
        ? restaurants.restaurants
        : null,
      attractions: Array.isArray(attractions?.attractions)
        ? attractions.attractions
        : null,
      weather: weather && !weather.error ? weather : null,
      forecast: forecast && !forecast.error ? forecast : null,
      source: ["google", "openweathermap", "osm"],
      fetched_at: new Date().toISOString(),
    };

    console.log(
      "[getFullDestination] Payload before insert",
      JSON.stringify(payload, null, 2)
    );

    const { error: insertError } = await supabase
      .from("destination_cache")
      .insert(payload);
    if (insertError) {
      console.error("[getFullDestination] Cache insert failed", insertError);
    } else {
      console.log("[getFullDestination] Cache insert success", { city });
    }

    // --------------------
    // Response
    // --------------------
    const response = { fromCache: false, ...payload };
    if (debug)
      response.debug = {
        urls,
        hotels,
        restaurants,
        attractions,
        weather,
        forecast,
        insertError,
      };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    };
  } catch (err) {
    console.error("[getFullDestination] Fatal error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error",
        details: err.message,
      }),
    };
  }
}
