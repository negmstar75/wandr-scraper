import fetch from "node-fetch";

export async function handler(event) {
  const { city = "Tokyo" } = event.queryStringParameters;

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
      city
    )}&appid=${process.env.OPENWEATHERMAP_API_KEY}&units=metric`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.cod !== 200) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: data.message }),
      };
    }

    const weather = {
      city: data.name,
      country: data.sys.country,
      temp: data.main.temp,
      feels_like: data.main.feels_like,
      temp_min: data.main.temp_min,
      temp_max: data.main.temp_max,
      humidity: data.main.humidity,
      wind_speed: data.wind.speed,
      description: data.weather[0].description,
      icon: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
    };

    return {
      statusCode: 200,
      body: JSON.stringify(weather),
    };
  } catch (err) {
    console.error("❌ Error in getWeather:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
