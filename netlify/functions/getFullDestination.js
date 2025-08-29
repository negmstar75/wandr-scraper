import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🌍 map country → continent
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

    // If cache hit (and not stale) return it
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

    // --- Step 3: Fetch country in English
    let country = null;
    try {
      const reverseUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=en`;
      const rev = await fetch(reverseUrl, {
        headers: { "User-Agent": "wandr-app" }
      }).then((r) => r.json());

      country = rev?.address?.country || null;
    } catch (err) {
      console.error("❌ Failed to fetch country:", err.message);
    }

    const continent = country ? getContinent(country) : null;

    // --- Step 4: Fetch data modular/hybrid (same as before)
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


export const handler = async (event) => {
  const { city, mode = "modular", limit = 2, debug = false } =
    event.queryStringParameters || {};

  if (!city) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing city parameter" }),
    };
  }

  let result = {
    city,
    lat: null,
    lon: null,
    country: null,
    hotels: [],
    restaurants: [],
    attractions: [],
    weather: null,
    forecast: null,
    mode,
  };

  try {
    // 🔹 1. Check cache
    const { data: cached } = await supabase
      .from("destination_cache")
      .select("*")
      .eq("city", city)
      .maybeSingle();

    if (cached) {
      if (debug === "true") {
        return {
          statusCode: 200,
          body: JSON.stringify({ ...cached, _source: "cache" }),
        };
      }
      return {
        statusCode: 200,
        body: JSON.stringify(cached),
      };
    }

    // 🔹 2. Resolve lat/lon + country
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      city
    )}&format=json&addressdetails=1&limit=1`;

    const geocode = await fetch(nominatimUrl, {
      headers: { "User-Agent": "wandr-app" },
    }).then((r) => r.json());

    let resolvedLat, resolvedLon, resolvedCountry;
    if (geocode && geocode.length > 0) {
      resolvedLat = geocode[0].lat;
      resolvedLon = geocode[0].lon;
      resolvedCountry = geocode[0].address?.country || null;
    }

    result.lat = resolvedLat;
    result.lon = resolvedLon;
    result.country = resolvedCountry;

    const baseUrl = process.env.BASE_URL || "https://wandr-scrape.netlify.app/.netlify/functions";

    // 🔹 3. Fetch modular services
    const [hotelsRes, restaurantsRes, attractionsRes, weatherRes, forecastRes] =
      await Promise.allSettled([
        fetch(`${baseUrl}/getHotels?city=${encodeURIComponent(city)}&lat=${resolvedLat}&lon=${resolvedLon}&limit=${limit}`).then(r => r.json()),
        fetch(`${baseUrl}/getRestaurants?city=${encodeURIComponent(city)}&lat=${resolvedLat}&lon=${resolvedLon}&limit=${limit}`).then(r => r.json()),
        fetch(`${baseUrl}/getCityAttractions?city=${encodeURIComponent(city)}&limit=${limit}`).then(r => r.json()),
        fetch(`${baseUrl}/getWeather?city=${encodeURIComponent(city)}`).then(r => r.json()),
        fetch(`${baseUrl}/getForecast?city=${encodeURIComponent(city)}`).then(r => r.json()),
      ]);

    result.hotels = hotelsRes.status === "fulfilled" ? hotelsRes.value : [];
    result.restaurants = restaurantsRes.status === "fulfilled" ? restaurantsRes.value : [];
    result.attractions = attractionsRes.status === "fulfilled" ? attractionsRes.value : [];
    result.weather = weatherRes.status === "fulfilled" ? weatherRes.value : null;
    result.forecast = forecastRes.status === "fulfilled" ? forecastRes.value : null;

    // 🔹 4. Cache result in Supabase
    await supabase.from("destination_cache").upsert(
      {
        city,
        country: result.country,
        lat: result.lat,
        lon: result.lon,
        data: result,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "city" }
    );

    if (debug === "true") {
      result.debug = {
        nominatim: geocode,
        urls: {
          hotels: `${baseUrl}/getHotels?city=${encodeURIComponent(city)}&lat=${resolvedLat}&lon=${resolvedLon}&limit=${limit}`,
          restaurants: `${baseUrl}/getRestaurants?city=${encodeURIComponent(city)}&lat=${resolvedLat}&lon=${resolvedLon}&limit=${limit}`,
          attractions: `${baseUrl}/getCityAttractions?city=${encodeURIComponent(city)}&limit=${limit}`,
          weather: `${baseUrl}/getWeather?city=${encodeURIComponent(city)}`,
          forecast: `${baseUrl}/getForecast?city=${encodeURIComponent(city)}`,
        },
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("getFullDestination error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error", details: err.message }),
    };
  }
};
