// /netlify/functions/getFullDestination.js

import fetch from "node-fetch";

export async function handler(event) {
  const { city, country, limit } = event.queryStringParameters;

  if (!city) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "City is required" }),
    };
  }

  try {
    const MAX_ATTRACTIONS = parseInt(limit) || 5; // default 5 detailed attractions
    let debug = {};

    // --- 1. Get Attractions (calls our endpoint) ---
    const attrUrl = `${process.env.BASE_URL}/.netlify/functions/getCityAttractions?city=${encodeURIComponent(
      city
    )}${country ? "&country=" + encodeURIComponent(country) : ""}`;
    const attrRes = await fetch(attrUrl);
    const attrData = await attrRes.json();
    debug.attractions = attrData.debug || {};

    let attractions = attrData.attractions || [];

    // --- 2. Enrich first N attractions with details ---
    const detailedAttractions = await Promise.all(
      attractions.slice(0, MAX_ATTRACTIONS).map(async (a) => {
        try {
          const detailUrl = `${process.env.BASE_URL}/.netlify/functions/getDestinationDetails?id=${a.id}&source=${a.source}`;
          const dRes = await fetch(detailUrl);
          const dData = await dRes.json();
          return { ...a, ...dData.details };
        } catch (err) {
          return { ...a, error: err.message };
        }
      })
    );

    // --- 3. Hotels ---
    const hotelsUrl = `${process.env.BASE_URL}/.netlify/functions/getHotels?city=${encodeURIComponent(
      city
    )}`;
    const hotelsRes = await fetch(hotelsUrl);
    const hotelsData = await hotelsRes.json();

    // --- 4. Restaurants ---
    const restUrl = `${process.env.BASE_URL}/.netlify/functions/getRestaurants?city=${encodeURIComponent(
      city
    )}`;
    const restRes = await fetch(restUrl);
    const restData = await restRes.json();

    // --- 5. Weather (current) ---
    const weatherUrl = `${process.env.BASE_URL}/.netlify/functions/getWeather?city=${encodeURIComponent(
      city
    )}`;
    const weatherRes = await fetch(weatherUrl);
    const weatherData = await weatherRes.json();

    // --- 6. Forecast (optional extended info) ---
    const forecastUrl = `${process.env.BASE_URL}/.netlify/functions/getForecast?city=${encodeURIComponent(
      city
    )}`;
    const forecastRes = await fetch(forecastUrl);
    const forecastData = await forecastRes.json();

    // --- Response ---
    return {
      statusCode: 200,
      body: JSON.stringify(
        {
          city,
          attractions: detailedAttractions,
          hotels: hotelsData.hotels || [],
          restaurants: restData.restaurants || [],
          weather: weatherData.weather || null,
          forecast: forecastData.forecast || null,
          debug,
        },
        null,
        2
      ),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
