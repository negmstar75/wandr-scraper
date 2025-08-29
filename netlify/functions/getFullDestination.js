import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🌍 country → continent mapping
const CONTINENT_MAP = {
  Asia: ["Japan", "China", "India", "Thailand", "Indonesia", "Vietnam", "Malaysia", "Singapore"],
  Europe: ["France", "Germany", "Spain", "Italy", "United Kingdom", "Netherlands", "Switzerland"],
  North_America: ["United States", "Canada", "Mexico"],
  South_America: ["Brazil", "Argentina", "Chile", "Peru"],
  Africa: ["South Africa", "Egypt", "Morocco", "Kenya"],
  Oceania: ["Australia", "New Zealand", "Fiji"]
};

function getContinent(country) {
  for (const [continent, countries] of Object.entries(CONTINENT_MAP)) {
    if (countries.includes(country)) return continent;
  }
  return null;
}

export async function handler(event) {
  try {
    const params = new URLSearchParams(event.queryStringParameters);
    const city = params.get("city");
    const mode = params.get("mode") || "modular";
    const debug = params.get("debug") === "true";

    if (!city) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing city param" }) };
    }

    // --- Step 1: Check cache
    const { data: cached, error: cacheError } = await supabase
      .from("destination_cache")
      .select("*")
      .eq("city", city)
      .maybeSingle();

    if (cacheError) console.error("❌ Supabase cache error:", cacheError);

    if (cached) {
      const isStale =
        Date.now() - new Date(cached.fetched_at).getTime() >
        1000 * 60 * 60 * 24 * 7; // 7 days
      if (!isStale) {
        return {
          statusCode: 200,
          body: JSON.stringify({ ...cached.data, fromCache: true })
        };
      }
    }

    // --- Step 2: Resolve lat/lon via Nominatim
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
      city
    )}&format=json&limit=1&accept-language=en`;
    const geo = await fetch(nominatimUrl, {
      headers: { "User-Agent": "wandr-app" }
    }).then((r) => r.json());

    if (!geo || geo.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: "City not found" }) };
    }

    const lat = geo[0].lat;
    const lon = geo[0].lon;

    // --- Step 3: Reverse geocode to get country/region (English)
    let country = null;
    let region = null;
    try {
      const reverseUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=en`;
      const rev = await fetch(reverseUrl, {
        headers: { "User-Agent": "wandr-app" }
      }).then((r) => r.json());

      country = rev?.address?.country || null;
      region =
        rev?.address?.state ||
        rev?.address?.region ||
        rev?.address?.county ||
        null;
    } catch (err) {
      console.error("❌ Failed to fetch country/region:", err.message);
    }

    const continent = country ? getContinent(country) : null;

    // --- Step 4: Fetch live data
    const baseUrl = process.env.BASE_URL || "https://wandr-scrape.netlify.app/.netlify/functions";

    const endpoints = {
      hotels: `${baseUrl}/getHotels?city=${encodeURIComponent(city)}&lat=${lat}&lon=${lon}&limit=2`,
      restaurants: `${baseUrl}/getRestaurants?city=${encodeURIComponent(city)}&lat=${lat}&lon=${lon}&limit=2`,
      attractions: `${baseUrl}/getCityAttractions?city=${encodeURIComponent(city)}&limit=2`,
      weather: `${baseUrl}/getWeather?city=${encodeURIComponent(city)}`,
      forecast: `${baseUrl}/getForecast?city=${encodeURIComponent(city)}`
    };

    const [hotels, restaurants, attractions, weather, forecast] = await Promise.allSettled([
      fetch(endpoints.hotels).then((r) => r.json()),
      fetch(endpoints.restaurants).then((r) => r.json()),
      fetch(endpoints.attractions).then((r) => r.json()),
      fetch(endpoints.weather).then((r) => r.json()),
      fetch(endpoints.forecast).then((r) => r.json())
    ]);

    const result = {
      city,
      lat,
      lon,
      country,
      region,
      continent,
      hotels: hotels.value || [],
      restaurants: restaurants.value || [],
      attractions: attractions.value || [],
      weather: weather.value || null,
      forecast: forecast.value || null,
      mode,
      debug: debug ? { nominatim: geo, urls: endpoints } : undefined
    };

    // --- Step 5: Upsert into cache
    await supabase.from("destination_cache").upsert({
      city,
      lat,
      lon,
      country,
      region,
      continent,
      data: result,
      fetched_at: new Date()
    });

    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error("❌ getFullDestination error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
