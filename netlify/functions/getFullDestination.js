import { handler as getHotels } from "./getHotels.js";
import { handler as getRestaurants } from "./getRestaurants.js";
import { handler as getCityAttractions } from "./getCityAttractions.js";
import { handler as getDestinationDetails } from "./getDestinationDetails.js";
import { handler as getWeather } from "./getWeather.js";
import { handler as getForecast } from "./getForecast.js";

export async function handler(event) {
  const { city, country, lat, lon, limit, mode } = event.queryStringParameters || {};

  if (!city) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "City is required" }),
    };
  }

  try {
    // Helper: run imported handler directly
    const runHandler = async (fn, params = {}) => {
      const res = await fn({ queryStringParameters: params });
      return JSON.parse(res.body);
    };

    if (mode === "modular") {
      // 🔹 Old behavior: call external endpoints (good for debugging)
      const BASE_URL = process.env.BASE_URL;
      const urls = {
        hotels: `${BASE_URL}/.netlify/functions/getHotels?city=${city}&lat=${lat}&lon=${lon}`,
        restaurants: `${BASE_URL}/.netlify/functions/getRestaurants?city=${city}&lat=${lat}&lon=${lon}`,
        attractions: `${BASE_URL}/.netlify/functions/getCityAttractions?city=${city}&country=${country}&limit=${limit}`,
        weather: `${BASE_URL}/.netlify/functions/getWeather?city=${city}`,
        forecast: `${BASE_URL}/.netlify/functions/getForecast?city=${city}`,
      };

      const [hotelsRes, restaurantsRes, attractionsRes, weatherRes, forecastRes] = await Promise.all(
        Object.values(urls).map((url) => fetch(url).then((r) => r.json()))
      );

      return {
        statusCode: 200,
        body: JSON.stringify({
          city,
          country,
          hotels: hotelsRes.hotels || [],
          restaurants: restaurantsRes.restaurants || [],
          attractions: attractionsRes.attractions || [],
          weather: weatherRes.weather || null,
          forecast: forecastRes.forecast || null,
          mode: "modular",
        }),
      };
    } else {
      // 🔹 Fast mode: run imported functions directly
      const [hotels, restaurants, attractions, weather, forecast] = await Promise.all([
        runHandler(getHotels, { city, lat, lon }),
        runHandler(getRestaurants, { city, lat, lon }),
        runHandler(getCityAttractions, { city, country, limit }),
        runHandler(getWeather, { city }),
        runHandler(getForecast, { city }),
      ]);

      return {
        statusCode: 200,
        body: JSON.stringify({
          city,
          country,
          hotels: hotels.hotels || [],
          restaurants: restaurants.restaurants || [],
          attractions: attractions.attractions || [],
          weather: weather.weather || null,
          forecast: forecast.forecast || null,
          mode: "direct",
        }),
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
