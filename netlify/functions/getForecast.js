// /netlify/functions/getForecast.js
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
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
      city + (country ? "," + country : "")
    )}&appid=${WEATHER_API_KEY}&units=metric`;

    const res = await fetch(forecastUrl);
    const data = await res.json();

    if (data.cod !== "200") {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: data.message || "City not found" }),
      };
    }

    // Group forecast into days
    const days = {};
    data.list.forEach((item) => {
      const date = item.dt_txt.split(" ")[0]; // YYYY-MM-DD
      if (!days[date]) {
        days[date] = [];
      }
      days[date].push({
        time: item.dt_txt,
        temp: item.main.temp,
        feels_like: item.main.feels_like,
        humidity: item.main.humidity,
        condition: item.weather[0].description,
        icon: `https://openweathermap.org/img/wn/${item.weather[0].icon}.png`,
        wind_speed: item.wind.speed,
      });
    });

    // Convert to array with daily averages
    const forecast = Object.entries(days).map(([date, items]) => {
      const avgTemp =
        items.reduce((sum, i) => sum + i.temp, 0) / items.length;
      const avgHumidity =
        items.reduce((sum, i) => sum + i.humidity, 0) / items.length;

      return {
        date,
        avgTemp: avgTemp.toFixed(1),
        avgHumidity: avgHumidity.toFixed(0),
        condition: items[0].condition,
        icon: items[0].icon,
        details: items, // keep full 3-hour breakdown for frontend
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        city: data.city.name,
        country: data.city.country,
        forecast,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
