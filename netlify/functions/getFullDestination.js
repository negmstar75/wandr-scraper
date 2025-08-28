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
    let debug = {}; // 👈 add debug info

    // ✅ Modular Mode (calls your other endpoints)
    if (mode === "modular") {
      const baseUrl =
  process.env.BASE_URL ||
  "https://wandr-scrape.netlify.app/.netlify/functions";

      debug.baseUrl = baseUrl;

      // Hotels
      try {
        const url = `${baseUrl}/getHotels?city=${encodeURIComponent(
          city
        )}&limit=${limit}`;
        debug.hotelsUrl = url;

        const res = await fetch(url);
        const json = await res.json();
        debug.hotelsResponse = json;
        hotels = json.hotels || [];
      } catch (err) {
        debug.hotelsError = err.message;
        hotels = [];
      }

      // Restaurants
      try {
        const url = `${baseUrl}/getRestaurants?city=${encodeURIComponent(
          city
        )}&limit=${limit}`;
        debug.restaurantsUrl = url;

        const res = await fetch(url);
        const json = await res.json();
        debug.restaurantsResponse = json;
        restaurants = json.restaurants || [];
      } catch (err) {
        debug.restaurantsError = err.message;
        restaurants = [];
      }

      // Attractions
      try {
        const url = `${baseUrl}/getCityAttractions?city=${encodeURIComponent(
          city
        )}&limit=${limit}`;
        debug.attractionsUrl = url;

        const res = await fetch(url);
        const json = await res.json();
        debug.attractionsResponse = json;
        attractions = json.attractions || [];
      } catch (err) {
        debug.attractionsError = err.message;
        attractions = [];
      }

      // Weather
      try {
        const url = `${baseUrl}/getWeather?city=${encodeURIComponent(city)}`;
        debug.weatherUrl = url;

        const res = await fetch(url);
        const json = await res.json();
        debug.weatherResponse = json;
        weather = json || null;
      } catch (err) {
        debug.weatherError = err.message;
        weather = null;
      }

      // Forecast
      try {
        const url = `${baseUrl}/getForecast?city=${encodeURIComponent(city)}`;
        debug.forecastUrl = url;

        const res = await fetch(url);
        const json = await res.json();
        debug.forecastResponse = json;
        forecast = json.forecast || null;
      } catch (err) {
        debug.forecastError = err.message;
        forecast = null;
      }

      return {
        statusCode: 200,
        body: JSON.stringify(
          {
            city,
            hotels,
            restaurants,
            attractions,
            weather,
            forecast,
            mode: "modular",
            debug, // 👈 now included
          },
          null,
          2
        ),
      };
    }

    // 👇 fallback if not modular
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
