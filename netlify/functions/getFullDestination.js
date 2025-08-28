// /netlify/functions/getFullDestination.js
import fetch from "node-fetch";

// Import local functions directly (hybrid mode)
import { handler as getHotels } from "./getHotels.js";
import { handler as getRestaurants } from "./getRestaurants.js";
import { handler as getCityAttractions } from "./getCityAttractions.js";
import { handler as getWeather } from "./getWeather.js";
import { handler as getForecast } from "./getForecast.js";

export async function handler(event) {
  const { city, lat, lon, limit = 5, mode = "hybrid", debug = "false" } =
    event.queryStringParameters || {};

  if (!city) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "City is required" }),
    };
  }

  try {
    // Utility: Safe JSON parsing
    const safeParse = (res) => {
      try {
        return res && res.body ? JSON.parse(res.body) : null;
      } catch {
        return null;
      }
    };

    // --------- HYBRID MODE (default) ---------
    if (mode === "hybrid") {
      const [hotelsRes, restaurantsRes, attractionsRes, weatherRes, forecastRes] =
        await Promise.allSettled([
          getHotels({ queryStringParameters: { city, lat, lon, limit } }),
          getRestaurants({ queryStringParameters: { city, lat, lon, limit } }),
          getCityAttractions({ queryStringParameters: { city, limit } }),
          getWeather({ queryStringParameters: { city } }),
          getForecast({ queryStringParameters: { city } }),
        ]);

      // Extract results
      const hotels = safeParse(hotelsRes.value)?.hotels || [];
      const restaurants = safeParse(restaurantsRes.value)?.restaurants || [];
      const attractions = safeParse(attractionsRes.value)?.attractions || [];
      const weather = safeParse(weatherRes.value) || null;
      const forecast = safeParse(forecastRes.value)?.forecast || null;

      // Build response
      const response = {
        city,
        hotels,
        restaurants,
        attractions,
        weather,
        forecast,
        mode: "hybrid",
      };

      // Add debug info if requested
      if (debug === "true") {
        response.debug = {
          hotelsRaw: safeParse(hotelsRes.value),
          restaurantsRaw: safeParse(restaurantsRes.value),
          attractionsRaw: safeParse(attractionsRes.value),
          weatherRaw: safeParse(weatherRes.value),
          forecastRaw: safeParse(forecastRes.value),
        };
      }

      return { statusCode: 200, body: JSON.stringify(response) };
    }

    // --------- MODULAR MODE (debug via endpoints) ---------
    else if (mode === "modular") {
      const baseUrl =
        process.env.BASE_URL || "https://wandr-scrape.netlify.app/.netlify/functions";

      const endpoints = {
        hotels: `${baseUrl}/getHotels?city=${encodeURIComponent(city)}&lat=${lat || ""}&lon=${lon || ""}&limit=${limit}`,
        restaurants: `${baseUrl}/getRestaurants?city=${encodeURIComponent(city)}&lat=${lat || ""}&lon=${lon || ""}&limit=${limit}`,
        attractions: `${baseUrl}/getCityAttractions?city=${encodeURIComponent(city)}&limit=${limit}`,
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
          debugInfo[`${key}Error`] = err.message;
          debugInfo[`${key}Url`] = url;
          results[key] = key === "forecast" ? null : [];
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ city, ...results, mode: "modular", debug: debug === "true" ? debugInfo : undefined }),
      };
    }

    // --------- INVALID MODE ---------
    else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid mode. Use 'hybrid' or 'modular'." }),
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
