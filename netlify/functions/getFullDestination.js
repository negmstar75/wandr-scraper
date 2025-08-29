import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
