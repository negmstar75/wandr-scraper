import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

// Local imports (hybrid mode)
import { handler as getHotels } from "./getHotels.js";
import { handler as getRestaurants } from "./getRestaurants.js";
import { handler as getCityAttractions } from "./getCityAttractions.js";
import { handler as getWeather } from "./getWeather.js";
import { handler as getForecast } from "./getForecast.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL =
  process.env.BASE_URL || "https://wandr-scrape.netlify.app/.netlify/functions";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

export async function handler(event) {
  const {
    city,
    country,
    lat,
    lon,
    limit = "5",
    mode = "hybrid",
    debug = "false",
    refresh = "false",
    ttlHours, // optional override (e.g., &ttlHours=3)
  } = event.queryStringParameters || {};

  if (!city && (!lat || !lon)) {
    return json(400, { error: "City or lat/lon is required" });
  }

  const dbg = {};
  let resolvedLat = lat;
  let resolvedLon = lon;

  // Resolve coords if needed
  try {
    if ((!resolvedLat || !resolvedLon) && city) {
      const geoUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
        city
      )}${country ? "&country=" + encodeURIComponent(country) : ""}&format=json&limit=1`;
      const geoRes = await fetch(geoUrl, { headers: { "User-Agent": "WandrApp/1.0" } });
      const geoData = await geoRes.json();
      if (debug === "true") dbg.nominatim = geoData;
      if (geoData?.[0]) {
        resolvedLat = geoData[0].lat;
        resolvedLon = geoData[0].lon;
      }
    }
  } catch (e) {
    if (debug === "true") dbg.geoError = e.message;
  }

  const ttlMs = parseInt(ttlHours || "6", 10) * 60 * 60 * 1000;
  const cutoffISO = new Date(Date.now() - ttlMs).toISOString();

  // 1) Try cache (if enabled)
  if (supabase && refresh !== "true") {
    try {
      const query = supabase
        .from("destination_cache")
        .select("*")
        .eq("city", city);

      if (country) query.eq("country", country);
      const { data, error } = await query
        .gt("fetched_at", cutoffISO)
        .order("fetched_at", { ascending: false })
        .limit(1);

      if (debug === "true") dbg.cacheLookup = { cutoffISO, city, country, error };

      if (!error && data && data.length > 0) {
        const row = data[0];
        const response = {
          city,
          lat: row.lat ?? resolvedLat ?? null,
          lon: row.lon ?? resolvedLon ?? null,
          hotels: row.hotels || [],
          restaurants: row.restaurants || [],
          attractions: row.attractions || [],
          weather: row.weather || null,
          forecast: row.forecast || null,
          mode: "cache",
        };
        if (debug === "true") response.debug = { ...dbg, cacheHit: true };
        return json(200, response);
      }
    } catch (e) {
      if (debug === "true") dbg.cacheReadError = e.message;
    }
  }

  // 2) Live fetch (hybrid or modular)
  const numericLimit = Number.isFinite(+limit) ? String(limit) : "5";
  let hotels = [];
  let restaurants = [];
  let attractions = [];
  let weather = null;
  let forecast = null;

  const callHandler = async (fn, params, label) => {
    try {
      const res = await fn({ queryStringParameters: params });
      return JSON.parse(res.body);
    } catch (err) {
      if (debug === "true") dbg[`${label}Error`] = err.message;
      return { error: err.message };
    }
  };

  const callHttp = async (url, label) => {
    try {
      const res = await fetch(url);
      return await res.json();
    } catch (err) {
      if (debug === "true") dbg[`${label}Error`] = err.message;
      return { error: err.message };
    }
  };

  try {
    if (mode === "hybrid") {
      const [h, r, a, w, f] = await Promise.all([
        callHandler(getHotels, { city, lat: resolvedLat, lon: resolvedLon, limit: numericLimit }, "hotels"),
        callHandler(getRestaurants, { city, lat: resolvedLat, lon: resolvedLon, limit: numericLimit }, "restaurants"),
        callHandler(getCityAttractions, { city, country, limit: numericLimit }, "attractions"),
        callHandler(getWeather, { city, lat: resolvedLat, lon: resolvedLon }, "weather"),
        callHandler(getForecast, { city, lat: resolvedLat, lon: resolvedLon }, "forecast"),
      ]);
      hotels = h?.hotels || [];
      restaurants = r?.restaurants || [];
      attractions = a?.attractions || [];
      weather = w?.temp ? w : null;
      forecast = f?.forecast || null;
    } else {
      const urls = {
        hotels: `${BASE_URL}/getHotels?city=${encodeURIComponent(city)}&lat=${resolvedLat || ""}&lon=${resolvedLon || ""}&limit=${numericLimit}`,
        restaurants: `${BASE_URL}/getRestaurants?city=${encodeURIComponent(city)}&lat=${resolvedLat || ""}&lon=${resolvedLon || ""}&limit=${numericLimit}`,
        attractions: `${BASE_URL}/getCityAttractions?city=${encodeURIComponent(city)}${country ? "&country=" + encodeURIComponent(country) : ""}&limit=${numericLimit}`,
        weather: `${BASE_URL}/getWeather?city=${encodeURIComponent(city)}`,
        forecast: `${BASE_URL}/getForecast?city=${encodeURIComponent(city)}`,
      };
      if (debug === "true") dbg.urls = urls;

      const [h, r, a, w, f] = await Promise.all([
        callHttp(urls.hotels, "hotels"),
        callHttp(urls.restaurants, "restaurants"),
        callHttp(urls.attractions, "attractions"),
        callHttp(urls.weather, "weather"),
        callHttp(urls.forecast, "forecast"),
      ]);
      hotels = h?.hotels || [];
      restaurants = r?.restaurants || [];
      attractions = a?.attractions || [];
      weather = w?.temp ? w : null;
      forecast = f?.forecast || null;
    }
  } catch (e) {
    if (debug === "true") dbg.fetchError = e.message;
  }

  const result = {
    city,
    lat: resolvedLat || null,
    lon: resolvedLon || null,
    hotels,
    restaurants,
    attractions,
    weather,
    forecast,
    mode,
  };
  if (debug === "true") result.debug = dbg;

  // 3) Save to cache (if Supabase configured)
  if (supabase) {
    try {
      const sources = ["google", "openweather"]; // adjust when you add OTM/Wiki
      const { error } = await supabase
        .from("destination_cache")
        .upsert(
          {
            city,
            country: country || null,
            lat: resolvedLat ? Number(resolvedLat) : null,
            lon: resolvedLon ? Number(resolvedLon) : null,
            mode,
            hotels: hotels.length ? hotels : null,
            restaurants: restaurants.length ? restaurants : null,
            attractions: attractions.length ? attractions : null,
            weather: weather || null,
            forecast: forecast || null,
            source: sources,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "city,country" }
        );

      if (debug === "true") {
        if (error) dbg.cacheWriteError = error.message;
        else dbg.cacheWrite = "ok";
      }
    } catch (e) {
      if (debug === "true") dbg.cacheWriteException = e.message;
    }
  }

  return json(200, result);
}

function json(statusCode, body) {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}
