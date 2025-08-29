import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

// --- Helper: Standardize location (country, code, region, continent) ---
async function getLocationDetails(city) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
        city
      )}&format=json&addressdetails=1&limit=1`
    );
    const data = await res.json();

    if (!data || !data[0]) {
      console.warn(`[getLocationDetails] No results for city: ${city}`);
      return {};
    }

    const addr = data[0].address || {};
    const country = addr.country || null;
    const countryCode = addr.country_code ? addr.country_code.toUpperCase() : null;
    const region = addr.state || null;

    // Fetch continent from mapping table
    let continent = null;
    if (countryCode) {
      const { data: continentRow, error: continentErr } = await supabase
        .from("country_continent_map")
        .select("continent")
        .eq("country_code", countryCode)
        .maybeSingle();

      if (continentErr) {
        console.error("[getLocationDetails] Error fetching continent:", continentErr);
      } else if (continentRow) {
        continent = continentRow.continent;
      }
    }

    return { country, countryCode, region, continent };
  } catch (err) {
    console.error("[getLocationDetails] Exception:", err);
    return {};
  }
}

// --- Helper: Cache lookup ---
async function getCachedDestination(city, mode) {
  const { data, error } = await supabase
    .from("destination_cache")
    .select("*")
    .eq("city", city)
    .eq("mode", mode)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[Supabase] Cache fetch error:", error);
    return null;
  }

  if (!data) return null;

  // Expiry: 24h
  const cacheAge = Date.now() - new Date(data.fetched_at).getTime();
  if (cacheAge > 24 * 60 * 60 * 1000) {
    console.log(`[Cache] Expired for ${city} (${Math.round(cacheAge / 1000)}s old)`);
    return null;
  }

  console.log(`[Cache] Hit for ${city}`);
  return data;
}

// --- Helper: Store cache ---
async function storeDestinationCache(entry) {
  try {
    const { data, error } = await supabase
      .from("destination_cache")
      .upsert(entry, { onConflict: "city,country" })
      .select();

    if (error) {
      console.error("[Supabase] Cache insert error:", error);
    } else {
      console.log("[Supabase] Cache inserted/updated:", data);
    }
  } catch (err) {
    console.error("[Supabase] Exception inserting cache:", err);
  }
}

// --- Main handler ---
export default async (req, res) => {
  try {
    const { city, mode = "modular", debug } = req.query;

    if (!city) {
      return res.status(400).json({ error: "Missing city param" });
    }

    // 1. Try cache
    const cached = await getCachedDestination(city, mode);
    if (cached) {
      return res.json({ ...cached, fromCache: true });
    }

    // 2. Fetch new location details (normalized)
    const { country, countryCode, region, continent } = await getLocationDetails(city);

    // 3. Fetch external APIs
    const baseUrl = process.env.BASE_URL || "https://wandr-scrape.netlify.app/.netlify/functions";
    const endpoints = {
      hotels: `${baseUrl}/getHotels?city=${city}&lat=&lon=&limit=2`,
      restaurants: `${baseUrl}/getRestaurants?city=${city}&lat=&lon=&limit=2`,
      attractions: `${baseUrl}/getCityAttractions?city=${city}&limit=2`,
      weather: `${baseUrl}/getWeather?city=${city}`,
      forecast: `${baseUrl}/getForecast?city=${city}`,
    };

    const [hotels, restaurants, attractions, weather, forecast] = await Promise.all([
      fetch(endpoints.hotels).then((r) => r.json()).catch(() => null),
      fetch(endpoints.restaurants).then((r) => r.json()).catch(() => null),
      fetch(endpoints.attractions).then((r) => r.json()).catch(() => null),
      fetch(endpoints.weather).then((r) => r.json()).catch(() => null),
      fetch(endpoints.forecast).then((r) => r.json()).catch(() => null),
    ]);

    // 4. Build entry
    const result = {
      city,
      country,
      country_code: countryCode,
      region,
      continent,
      mode,
      hotels,
      restaurants,
      attractions,
      weather,
      forecast,
      fetched_at: new Date().toISOString(),
      source: ["google", "openweathermap"],
      debug: debug ? { endpoints } : undefined,
    };

    // 5. Store in cache
    await storeDestinationCache(result);

    // 6. Return response
    return res.json(result);
  } catch (err) {
    console.error("[getFullDestination] Fatal error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
};
