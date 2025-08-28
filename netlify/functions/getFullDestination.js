import fetch from "node-fetch";

// Local imports (hybrid mode)
import { handler as getHotels } from "./getHotels.js";
import { handler as getRestaurants } from "./getRestaurants.js";
import { handler as getCityAttractions } from "./getCityAttractions.js";
import { handler as getWeather } from "./getWeather.js";
import { handler as getForecast } from "./getForecast.js";

export async function handler(event) {
  const { city, country, lat, lon, limit = 5, mode = "hybrid", debug = "false" } =
    event.queryStringParameters || {};

  if (!city && (!lat || !lon)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "City or lat/lon is required",
      }),
    };
  }

  const debugInfo = {};
  let resolvedLat = lat;
  let resolvedLon = lon;

  try {
    // --- Step 1: Get coordinates if not provided ---
    if ((!resolvedLat || !resolvedLon) && city) {
      const geoUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
        city
      )}${country ? "&country=" + encodeURIComponent(country) : ""}&format=json&limit=1`;
      const geoRes = await fetch(geoUrl, {
        headers: { "User-Agent": "WandrApp/1.0" },
      });
      const geoData = await geoRes.json();
      debugInfo.nominatim = geoData;

      if (geoData?.[0]) {
        resolvedLat = geoData[0].lat;
        resolvedLon = geoData[0].lon;
      }
    }

    // --- Step 2: Decide baseUrl for modular mode ---
    const baseUrl =
      process.env.BASE_URL || "https://wandr-scrape.netlify.app/.netlify/functions";

    // --- Step 3: Utility wrapper ---
    async function callHandler(fn, params, label) {
      try {
        const res = await fn({ queryStringParameters: params });
        return JSON.parse(res.body);
      } catch (err) {
        debugInfo[`${label}Error`] = err.message;
        return [];
      }
    }

    async function callHttp(url, label) {
      try {
        const res = await fetch(url);
        const data = await res.json();
        return data;
      } catch (err) {
        debugInfo[`${label}Error`] = err.message;
        return [];
      }
    }

    // --- Step 4: Parallel requests ---
    let hotels, restaurants, attractions, weather, forecast;

    if (mode === "hybrid") {
      [hotels, restaurants, attractions, weather, forecast] = await Promise.all([
        callHandler(getHotels, { city, lat: resolvedLat, lon: resolvedLon, limit }, "hotels"),
        callHandler(getRestaurants, { city, lat: resolvedLat, lon: resolvedLon, limit }, "restaurants"),
        callHandler(getCityAttractions, { city, country, limit }, "attractions"),
        callHandler(getWeather, { city, lat: resolvedLat, lon: resolvedLon }, "weather"),
        callHandler(getForecast, { city, lat: resolvedLat, lon: resolvedLon }, "forecast"),
      ]);
    } else {
      const urls = {
        hotels: `${baseUrl}/getHotels?city=${encodeURIComponent(city)}&lat=${resolvedLat || ""}&lon=${
          resolvedLon || ""
        }&limit=${limit}`,
        restaurants: `${baseUrl}/getRestaurants?city=${encodeURIComponent(city)}&lat=${
          resolvedLat || ""
        }&lon=${resolvedLon || ""}&limit=${limit}`,
        attractions: `${baseUrl}/getCityAttractions?city=${encodeURIComponent(city)}${
          country ? "&country=" + encodeURIComponent(country) : ""
        }&limit=${limit}`,
        weather: `${baseUrl}/getWeather?city=${encodeURIComponent(city)}`,
        forecast: `${baseUrl}/getForecast?city=${encodeURIComponent(city)}`,
      };

      if (debug === "true") debugInfo.urls = urls;

      [hotels, restaurants, attractions, weather, forecast] = await Promise.all([
        callHttp(urls.hotels, "hotels"),
        callHttp(urls.restaurants, "restaurants"),
        callHttp(urls.attractions, "attractions"),
        callHttp(urls.weather, "weather"),
        callHttp(urls.forecast, "forecast"),
      ]);
    }

    // --- Step 5: Standardize outputs ---
    const response = {
      city,
      lat: resolvedLat || null,
      lon: resolvedLon || null,
      hotels: hotels?.hotels || hotels || [],
      restaurants: restaurants?.restaurants || restaurants || [],
      attractions: attractions?.attractions || attractions || [],
      weather: weather?.temp ? weather : null,
      forecast: forecast?.forecast || forecast || null,
      mode,
    };

    if (debug === "true") response.debug = debugInfo;

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message,
        debug: debug === "true" ? debugInfo : undefined,
      }),
    };
  }
}
