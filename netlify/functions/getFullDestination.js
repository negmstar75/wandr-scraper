// /netlify/functions/getFullDestination.js
import fetch from "node-fetch";

// Import handlers for Hybrid mode
import { handler as getHotels } from "./getHotels.js";
import { handler as getRestaurants } from "./getRestaurants.js";
import { handler as getCityAttractions } from "./getCityAttractions.js";
import { handler as getWeather } from "./getWeather.js";
import { handler as getForecast } from "./getForecast.js";

export async function handler(event) {
  const {
    city,
    lat,
    lon,
    limit = 5,
    mode = "hybrid",
    debug = "false",
  } = event.queryStringParameters || {};

  if (!city) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "City is required" }),
    };
  }

  const safeParse = (res) => {
    try {
      return res && res.body ? JSON.parse(res.body) : null;
    } catch {
      return null;
    }
  };

  try {
    // ========== HYBRID MODE ==========
    if (mode === "hybrid") {
      const [
        hotelsRes,
        restaurantsRes,
        attractionsRes,
        weatherRes,
        forecastRes,
      ] = await Promise.allSettled([
        getHotels({ queryStringParameters: { city, lat, lon, limit } }),
        getRestaurants({ queryStringParameters: { city, lat, lon, limit } }),
        getCityAttractions({ queryStringParameters: { city, limit } }),
        getWeather({ queryStringParameters: { city } }),
        getForecast({ queryStringParameters: { city } }),
      ]);

      const hotels = safeParse(hotelsRes.value)?.hotels || [];
      const restaurants = safeParse(restaurantsRes.value)?.restaurants || [];
      const attractions = safeParse(attractionsRes.value)?.attractions || [];
      const weather = safeParse(weatherRes.value) || null;
      const forecast = safeParse(forecastRes.value)?.forecast || null;

      const response = {
        city,
        hotels,
        restaurants,
        attractions,
        weather,
        forecast,
        mode: "hybrid",
      };

      if (debug === "true") {
        response.debug = {
          hotels: safeParse(hotelsRes.value),
          restaurants: safeParse(restaurantsRes.value),
          attractions: safeParse(attractionsRes.value),
          weather: safeParse(weatherRes.value),
          forecast: safeParse(forecastRes.value),
        };
      }

      return { statusCode: 200, body: JSON.stringify(response) };
    }

    // ========== MODULAR MODE ==========
    if (mode === "modular") {
      const baseUrl =
        process.env.BASE_URL ||
        "https://wandr-scrape.netlify.app/.netlify/functions";

      const endpoints = {
        hotels: `${baseUrl}/getHotels?city=${encodeURIComponent(
          city
        )}&lat=${lat || ""}&lon=${lon || ""}&limit=${limit}`,
        restaurants: `${baseUrl}/getRestaurants?city=${encodeURIComponent(
          city
        )}&lat=${lat || ""}&lon=${lon || ""}&limit=${limit}`,
        attractions: `${baseUrl}/getCityAttractions?city=${encodeURIComponent(
          city
        )}&limit=${limit}`,
        weather: `${baseUrl}/getWeather?city=${encodeURIComponent(city)}`,
        forecast: `${baseUrl}/getForecast?city=${encodeURIComponent(city)}`,
      };

      const results = {};
      const debugInfo = { baseUrl };

      for (const [key, url] of Object.entries(endpoints)) {
        try {
          const res = await fetch(url);
          const data = await res.json();
          results[key] = data[key] || data;
          if (debug === "true") debugInfo[`${key}Response`] = data;
        } catch (err) {
          results[key] = key === "forecast" || key === "weather" ? null : [];
          debugInfo[`${key}Error`] = err.message;
          debugInfo[`${key}Url`] = url;
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          city,
          ...results,
          mode: "modular",
          debug: debug === "true" ? debugInfo : undefined,
        }),
      };
    }

    // ========== INVALID MODE ==========
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Invalid mode. Use 'hybrid' or 'modular'.",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
