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
            envKeys: Object.keys(process.env), // shows what keys are available
          },
        }),
      };
    }

    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
      city
    )}&appid=${apiKey}&units=metric`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.cod !== "200") {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: data.message, debug: data }),
      };
    }

    // Group forecast into daily summaries (since free tier gives 3h intervals)
    const grouped = {};
    data.list.forEach((entry) => {
      const date = entry.dt_txt.split(" ")[0];
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(entry);
    });

    const daily = Object.entries(grouped).map(([date, entries]) => {
      const temps = entries.map((e) => e.main.temp);
      const descriptions = entries.map((e) => e.weather[0].description);

      return {
        date,
        temp_min: Math.min(...temps),
        temp_max: Math.max(...temps),
        description: descriptions[0], // just take the first description
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        city: data.city.name,
        forecast: daily,
        debug: { url }, // request URL for debugging
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
