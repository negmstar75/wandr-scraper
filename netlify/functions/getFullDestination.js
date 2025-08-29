import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

// 🔑 Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🌍 Helper: fetch JSON safely
async function safeFetch(url, label) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "WandrBot/1.0" } });
    if (!res.ok) throw new Error(`${label} fetch failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`❌ Error in ${label}:`, err.message);
    return null;
  }
}

// 🌍 Helper: normalize country/region/continent
function normalizeLocation(nominatimData) {
  if (!nominatimData || !nominatimData[0]) return {};

  const addr = nominatimData[0].address || {};
  return {
    country: addr.country || null,
    region: addr.state || addr.region || null,
    continent: addr.continent || null,
  };
}

export const handler = async (event) => {
  try {
    // ✅ Use Netlify event query params
    const params = event.queryStringParameters || {};
    const city = params.city;
    const lat = params.lat || null;
    const lon = params.lon || null;
    const mode = params.mode || "modular";
    const debug = params.debug === "true";

    if (!city) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "❌ city parameter is required" }),
      };
    }

    // 🔎 1. Check cache
    const { data: cached, error: cacheErr } = await supabase
      .from("destination_cache")
      .select("*")
      .eq("city", city)
      .maybeSingle();

    if (cacheErr) {
      console.error("❌ Supabase cache lookup error:", cacheErr.message);
    }

    if (cached) {
      if (debug) console.log("⚡ Cache hit:", city);
      return {
        statusCode: 200,
        body: JSON.stringify({ fromCache: true, ...cached }),
      };
    }

    if (debug) console.log("🆕 Cache miss, fetching live APIs for:", city);

    // 🔎 2. Resolve location info via Nominatim
    const geoUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
      city
    )}&format=json&limit=1`;
    const geoData = await safeFetch(geoUrl, "Nominatim");
    const { country, region, continent } = normalizeLocation(geoData);

    // 🔎 3. Hotels
    const hotelsUrl = `${process.env.SCRAPER_BASE_URL}/getHotels?city=${encodeURIComponent(
      city
    )}&lat=${lat || ""}&lon=${lon || ""}&limit=2`;
    const hotels = await safeFetch(hotelsUrl, "Hotels");

    // 🔎 4. Restaurants
    const restaurantsUrl = `${process.env.SCRAPER_BASE_URL}/getRestaurants?city=${encodeURIComponent(
      city
    )}&lat=${lat || ""}&lon=${lon || ""}&limit=2`;
    const restaurants = await safeFetch(restaurantsUrl, "Restaurants");

    // 🔎 5. Attractions
    const attractionsUrl = `${process.env.SCRAPER_BASE_URL}/getCityAttractions?city=${encodeURIComponent(
      city
    )}&limit=2`;
    const attractions = await safeFetch(attractionsUrl, "Attractions");

    // 🔎 6. Weather + Forecast
    const weatherUrl = `${process.env.SCRAPER_BASE_URL}/getWeather?city=${encodeURIComponent(
      city
    )}`;
    const forecastUrl = `${process.env.SCRAPER_BASE_URL}/getForecast?city=${encodeURIComponent(
      city
    )}`;
    const weather = await safeFetch(weatherUrl, "Weather");
    const forecast = await safeFetch(forecastUrl, "Forecast");

    // 🔎 7. Build final response
    const result = {
      city,
      country,
      region,
      continent,
      lat: lat || (geoData?.[0]?.lat ?? null),
      lon: lon || (geoData?.[0]?.lon ?? null),
      mode,
      hotels,
      restaurants,
      attractions,
      weather,
      forecast,
      source: ["google", "openweathermap", "osm"],
      fetched_at: new Date().toISOString(),
    };

    // 🔎 8. Insert into Supabase cache
    const { error: insertErr } = await supabase
      .from("destination_cache")
      .insert([result]);

    if (insertErr) {
      console.error("❌ Error inserting cache:", insertErr.message);
    } else {
      console.log("✅ Inserted into cache:", city);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ fromCache: false, ...result }),
    };
  } catch (err) {
    console.error("💥 Fatal error in getFullDestination:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
