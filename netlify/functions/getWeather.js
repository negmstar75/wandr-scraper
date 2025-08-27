// /netlify/functions/getWeather.js
import fetch from "node-fetch";

export async function handler(event) {
  try {
    const { city, country } = event.queryStringParameters;

    if (!city) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing city parameter" }),
      };
    }

    const WEATHER_API_KEY = process.env.OPENWEATHERMAP_API_KEY;

    if (!WEATHER_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing OpenWeatherMap API key" }),
      };
    }

    // Build request URL
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
      city + (country ? "," + country : "")
    )}&appid=${WEATHER_API_KEY}&units=metric`;

    // Fetch weather
    const res = await fetch(weatherUrl);
    const data = await res.json();

    if (data.cod !== 200) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: data.message || "City not found" }),
      };
    }

    // Format response
    const weather = {
      city: data.name,
      country: data.sys?.country || "",
      temperature: data.main?.temp,
      feels_like: data.main?.feels_like,
      humidity: data.main?.humidity,
      condition: data.weather?.[0]?.description || "",
      icon: data.weather?.[0]?.icon
        ? `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`
        : null,
      wind_speed: data.wind?.speed,
      clouds: data.clouds?.all,
      sunrise: data.sys?.sunrise,
      sunset: data.sys?.sunset,
    };

    return {
      statusCode: 200,
      body: JSON.stringify(weather),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
