import fetch from "node-fetch";

export async function handler(event) {
  const { city, country, mode = "monolithic", limit = 5 } =
    event.queryStringParameters;

  if (!city) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "City is required" }),
    };
  }

  try {
    let hotels = [];
    let restaurants = [];
    let attractions = [];
    let weather = null;
    let forecast = null;

    // ✅ Modular Mode (calls your own endpoints)
    if (mode === "modular") {
      const baseUrl =
        process.env.BASE_URL ||
        "https://wandr-scrape.netlify.app/.netlify/functions";

      // Hotels
      try {
        const hotelsRes = await fetch(
          `${baseUrl}/getHotels?city=${encodeURIComponent(city)}&limit=${limit}`
        );
        const hotelsJson = await hotelsRes.json();
        hotels = hotelsJson.hotels || [];
      } catch (err) {
        hotels = [];
      }

      // Restaurants
      try {
        const restRes = await fetch(
          `${baseUrl}/getRestaurants?city=${encodeURIComponent(
            city
          )}&limit=${limit}`
        );
        const restJson = await restRes.json();
        restaurants = restJson.restaurants || [];
      } catch (err) {
        restaurants = [];
      }

      // Attractions
      try {
        const attrRes = await fetch(
          `${baseUrl}/getCityAttractions?city=${encodeURIComponent(
            city
          )}&limit=${limit}`
        );
        const attrJson = await attrRes.json();
        attractions = attrJson.attractions || [];
      } catch (err) {
        attractions = [];
      }

      // Weather
      try {
        const weatherRes = await fetch(
          `${baseUrl}/getWeather?city=${encodeURIComponent(city)}`
        );
        const weatherJson = await weatherRes.json();
        weather = weatherJson || null;
      } catch (err) {
        weather = null;
      }

      // Forecast
      try {
        const forecastRes = await fetch(
          `${baseUrl}/getForecast?city=${encodeURIComponent(city)}`
        );
        const forecastJson = await forecastRes.json();
        forecast = forecastJson.forecast || null;
      } catch (err) {
        forecast = null;
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          city,
          hotels,
          restaurants,
          attractions,
          weather,
          forecast,
          mode: "modular",
        }),
      };
    }

    // ✅ Monolithic Mode (direct API calls inline)
    // 👉 You can leave this as a fallback, but since we’ve modularized everything,
    // most of your usage will be modular.
    return {
      statusCode: 200,
      body: JSON.stringify({
        city,
        hotels,
        restaurants,
        attractions,
        weather,
        forecast,
        mode: "monolithic",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
