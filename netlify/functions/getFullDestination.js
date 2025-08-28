import fetch from "node-fetch";

// Utility: safely call another Netlify function (internal modular mode)
async function callFunction(path, params = {}) {
  const url = `${process.env.BASE_URL}/.netlify/functions/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  return res.json();
}

export async function handler(event) {
  const { city, country, mode, forecast } = event.queryStringParameters;

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
    let forecastData = null;

    if (mode === "modular") {
      // 🔹 Hybrid approach: call other deployed Netlify functions
      hotels = await callFunction("getHotels", { city, country }).then(r => r.hotels || []);
      restaurants = await callFunction("getRestaurants", { city, country }).then(r => r.restaurants || []);
      attractions = await callFunction("getCityAttractions", { city, country }).then(r => r.attractions || []);
      weather = await callFunction("getWeather", { city }).then(r => r.weather || null);

      if (forecast === "true") {
        forecastData = await callFunction("getForecast", { city }).then(r => r.forecast || null);
      }
    } else {
      // 🔹 Direct inline API calls (longer-term can migrate to imports)
      const apiKey = process.env.OPENWEATHER_KEY;

      // Hotels via Google Places
      const hotelUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=hotels+in+${encodeURIComponent(
        city
      )}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
      const hRes = await fetch(hotelUrl);
      const hData = await hRes.json();
      hotels =
        hData.results?.map((h) => ({
          id: h.place_id,
          name: h.name,
          address: h.formatted_address,
          rating: h.rating,
        })) || [];

      // Restaurants via Google Places
      const restUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=restaurants+in+${encodeURIComponent(
        city
      )}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
      const rRes = await fetch(restUrl);
      const rData = await rRes.json();
      restaurants =
        rData.results?.map((r) => ({
          id: r.place_id,
          name: r.name,
          address: r.formatted_address,
          rating: r.rating,
        })) || [];

      // Attractions via OTM fallback Google
      attractions = await callFunction("getCityAttractions", { city }).then(r => r.attractions || []);

      // Current Weather
      if (apiKey) {
        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
          city
        )}&appid=${apiKey}&units=metric`;
        const wRes = await fetch(weatherUrl);
        const wData = await wRes.json();
        if (wData.cod === 200) {
          weather = {
            temp: wData.main.temp,
            description: wData.weather[0].description,
            feels_like: wData.main.feels_like,
          };
        }
      }

      // Forecast (optional)
      if (forecast === "true" && apiKey) {
        const fUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(
          city
        )}&appid=${apiKey}&units=metric`;
        const fRes = await fetch(fUrl);
        const fData = await fRes.json();

        if (fData.cod === "200") {
          const grouped = {};
          fData.list.forEach((entry) => {
            const date = entry.dt_txt.split(" ")[0];
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(entry);
          });

          forecastData = Object.entries(grouped).map(([date, entries]) => {
            const temps = entries.map((e) => e.main.temp);
            return {
              date,
              temp_min: Math.min(...temps),
              temp_max: Math.max(...temps),
              description: entries[0].weather[0].description,
            };
          });
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        city,
        hotels,
        restaurants,
        attractions,
        weather,
        forecast: forecastData,
        mode: mode || "inline",
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
