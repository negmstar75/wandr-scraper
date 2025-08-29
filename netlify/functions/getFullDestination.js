// netlify/functions/getFullDestination.js
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { city, lat, lon, mode = "modular" } = req.query;

  if (!city || !lat || !lon) {
    return res
      .status(400)
      .json({ error: "Missing required params: city, lat, lon" });
  }

  try {
    // --- Step 1: Check cache ---
    const { data: cached, error: cacheErr } = await supabase
      .from("destination_cache")
      .select("*")
      .eq("city", city)
      .maybeSingle();

    if (cacheErr) console.error("Supabase cache error:", cacheErr);

    if (cached) {
      console.log(`[CACHE HIT] ${city}`);
      return res.json({ fromCache: true, ...cached });
    }

    console.log(`[CACHE MISS] ${city} → fetching live APIs`);

    // --- Step 2: Fetch weather + forecast ---
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
      city
    )}&appid=${process.env.OPENWEATHER_KEY}&units=metric`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
      city
    )}&appid=${process.env.OPENWEATHER_KEY}&units=metric`;

    const [weatherResp, forecastResp] = await Promise.all([
      fetch(weatherUrl),
      fetch(forecastUrl),
    ]);

    const weather = weatherResp.ok ? await weatherResp.json() : null;
    const forecastData = forecastResp.ok ? await forecastResp.json() : null;

    const forecast =
      forecastData?.list
        ?.filter((_, idx) => idx % 8 === 0)
        .map((f) => ({
          date: f.dt_txt.split(" ")[0],
          temp_min: f.main.temp_min,
          temp_max: f.main.temp_max,
          description: f.weather[0].description,
        })) ?? [];

    // --- Step 3: Resolve country (in English) ---
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=en`;
    const geoResp = await fetch(nominatimUrl);
    const geoJson = geoResp.ok ? await geoResp.json() : null;

    const country =
      geoJson?.address?.country ??
      geoJson?.display_name?.split(",").pop()?.trim() ??
      null;
    const countryCode = geoJson?.address?.country_code?.toUpperCase() ?? null;

    // --- Step 4: Region + Continent ---
    let region = null;
    let continent = null;

    try {
      // 4.1 Region lookup table
      const { data: regionRow } = await supabase
        .from("city_region_map")
        .select("region")
        .eq("country", country)
        .eq("city", city)
        .maybeSingle();

      if (regionRow?.region) {
        region = regionRow.region;
      } else {
        // 4.2 Fallback reverse-geocode fields
        region =
          geoJson?.address?.state ||
          geoJson?.address?.province ||
          geoJson?.address?.region ||
          geoJson?.address?.county ||
          geoJson?.address?.district ||
          geoJson?.address?.state_district ||
          geoJson?.address?.prefecture ||
          null;
      }

      // 4.3 Continent lookup
      if (countryCode) {
        const { data: continentRow } = await supabase
          .from("country_continent_map")
          .select("continent")
          .eq("country_code", countryCode)
          .maybeSingle();

        if (continentRow?.continent) {
          continent = continentRow.continent;
        }
      }
    } catch (err) {
      console.error("Region/continent resolution error:", err);
    }

    // --- Step 5: (Placeholder for hotels, restaurants, attractions) ---
    // You already fetch from Google/OTM upstream, keep as is
    const hotels = []; // TODO: plug your hotel API call here
    const restaurants = []; // TODO
    const attractions = []; // TODO

    // --- Step 6: Build payload ---
    const result = {
      city,
      country,
      lat,
      lon,
      mode,
      hotels,
      restaurants,
      attractions,
      weather: weather
        ? {
            city: weather.name,
            temp: weather.main.temp,
            description: weather.weather[0].description,
            feels_like: weather.main.feels_like,
            humidity: weather.main.humidity,
            wind_speed: weather.wind.speed,
          }
        : null,
      forecast,
      region,
      continent,
      source: ["google", "openweathermap", "nominatim"],
      fetched_at: new Date().toISOString(),
    };

    // --- Step 7: Insert into cache ---
    const { error: insertErr } = await supabase
      .from("destination_cache")
      .insert([result]);

    if (insertErr) {
      console.error("Supabase insert error:", insertErr);
    } else {
      console.log(`[CACHE STORE] Inserted ${city}, ${country}`);
    }

    return res.json(result);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
