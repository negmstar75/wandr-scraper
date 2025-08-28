// /netlify/functions/getFullDestination.js
import fetch from "node-fetch";

export async function handler(event) {
  const { city, lat, lon, limit = 5, mode = "hybrid" } =
    event.queryStringParameters;

  if (!city) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "City is required" }),
    };
  }

  // ✅ FIX: Always include /.netlify/functions in baseUrl
  const baseUrl =
    process.env.BASE_URL ||
    "https://wandr-scrape.netlify.app/.netlify/functions";

  let debug = {
    baseUrl,
  };

  try {
    if (mode === "modular") {
      // --- Modular mode: call each micro-function directly ---
      const [hotelsRes, restaurantsRes, attractionsRes, weatherRes, forecastRes] =
        await Promise.allSettled([
          fetch(`${baseUrl}/getHotels?city=${encodeURIComponent(city)}&lat=${lat || ""}&lon=${lon || ""}&limit=${limit}`),
          fetch(`${baseUrl}/getRestaurants?city=${encodeURIComponent(city)}&lat=${lat || ""}&lon=${lon || ""}&limit=${limit}`),
          fetch(`${baseUrl}/getCityAttractions?city=${encodeURIComponent(city)}&limit=${limit}`),
          fetch(`${baseUrl}/getWeather?city=${encodeURIComponent(city)}`),
          fetch(`${baseUrl}/getForecast?city=${encodeURIComponent(city)}`),
        ]);

      // Helper to unwrap results
      const unwrap = async (res, label) => {
        if (res.status === "fulfilled") {
          try {
            return await res.value.json();
          } catch (err) {
            debug[`${label}Error`] = err.message;
            return null;
          }
        } else {
          debug[`${label}Error`] = res.reason.message;
          return null;
        }
      };

      const hotels = await unwrap(hotelsRes, "hotels");
      const restaurants = await unwrap(restaurantsRes, "restaurants");
      const attractions = await unwrap(attractionsRes, "attractions");
      const weather = await unwrap(weatherRes, "weather");
      const forecast = await unwrap(forecastRes, "forecast");

      debug.hotelsUrl = `${baseUrl}/getHotels?city=${encodeURIComponent(city)}&limit=${limit}`;
      debug.restaurantsUrl = `${baseUrl}/getRestaurants?city=${encodeURIComponent(city)}&limit=${limit}`;
      debug.attractionsUrl = `${baseUrl}/getCityAttractions?city=${encodeURIComponent(city)}&limit=${limit}`;
      debug.weatherUrl = `${baseUrl}/getWeather?city=${encodeURIComponent(city)}`;
      debug.forecastUrl = `${baseUrl}/getForecast?city=${encodeURIComponent(city)}`;

      return {
        statusCode: 200,
        body: JSON.stringify({
          city,
          hotels: hotels?.hotels || [],
          restaurants: restaurants?.restaurants || [],
          attractions: attractions?.attractions || [],
          weather: weather || null,
          forecast: forecast?.forecast || null,
          mode,
          debug,
        }),
      };
    } else {
      // --- Hybrid/legacy mode placeholder ---
      return {
        statusCode: 200,
        body: JSON.stringify({
          city,
          hotels: [],
          restaurants: [],
          attractions: [],
          weather: null,
          forecast: null,
          mode,
          debug,
          note: "Hybrid mode not fully wired yet, use mode=modular",
        }),
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message, debug }),
    };
  }
}
