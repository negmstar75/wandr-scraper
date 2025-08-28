import fetch from "node-fetch";

export async function handler(event) {
  const { city } = event.queryStringParameters;

  if (!city) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "City is required" }),
    };
  }

  try {
    const apiKey = process.env.OPENWEATHER_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Missing OpenWeatherMap API key",
          debug: {
            envKeys: Object.keys(process.env), // 🔍 shows what keys Netlify exposes
          },
        }),
      };
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
      city
    )}&appid=${apiKey}&units=metric`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.cod !== 200) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: data.message, debug: data }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        city: data.name,
        temp: data.main.temp,
        description: data.weather[0].description,
        feels_like: data.main.feels_like,
        humidity: data.main.humidity,
        wind_speed: data.wind.speed,
        debug: { url }, // 🔍 shows request URL
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
