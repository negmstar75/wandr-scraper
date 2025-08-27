import fetch from "node-fetch";

export async function handler(event) {
  try {
    const params = event.queryStringParameters;
    const city = params.city || "Tokyo";
    const country = params.country || "";

    // 🌍 Environment Variables
    const OTM_KEY = process.env.OPENTRIPMAP_KEY;     // OpenTripMap
    const GP_KEY = process.env.GOOGLE_PLACES_KEY;   // Google Places
    const WIKI_AGENT = process.env.WIKIMEDIA_USER_AGENT; 
    const FSQ_KEY = process.env.FOURSQUARE_KEY;     // Foursquare
    const WEATHER_KEY = process.env.OPENWEATHER_KEY; // OpenWeatherMap
    const EVENTBRITE_TOKEN = process.env.EVENTBRITE_TOKEN;
    const NEWS_KEY = process.env.NEWSAPI_KEY;

    let response = {
      city,
      country,
      attractions: [],
      details: {},
      images: [],
      foursquare: [],
      wikipedia: {},
      weather: {},
      events: [],
      news: []
    };

    // 1️⃣ OpenTripMap: get city coords + attractions
    const geoRes = await fetch(
      `https://api.opentripmap.com/0.1/en/places/geoname?name=${city}&apikey=${OTM_KEY}`
    );
    const geoData = await geoRes.json();
    if (geoData.lat && geoData.lon) {
      const attractionsRes = await fetch(
        `https://api.opentripmap.com/0.1/en/places/radius?radius=5000&lon=${geoData.lon}&lat=${geoData.lat}&limit=10&apikey=${OTM_KEY}`
      );
      const attractionsData = await attractionsRes.json();
      response.attractions = attractionsData.features?.map(p => ({
        name: p.properties.name,
        kind: p.properties.kinds,
      })) || [];
      response.details.location = { lat: geoData.lat, lon: geoData.lon };
    }

    // 2️⃣ Google Places: city photo + details
    if (GP_KEY) {
      const gpRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${city}&key=${GP_KEY}`
      );
      const gpData = await gpRes.json();
      if (gpData.results?.[0]) {
        const place = gpData.results[0];
        response.details.google = {
          name: place.name,
          rating: place.rating,
          address: place.formatted_address,
        };
        if (place.photos?.length) {
          const photoRef = place.photos[0].photo_reference;
          response.images.push(
            `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoRef}&key=${GP_KEY}`
          );
        }
      }
    }

    // 3️⃣ Wikimedia: city summary
    const wikiRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`,
      { headers: { "User-Agent": WIKI_AGENT } }
    );
    const wikiData = await wikiRes.json();
    if (wikiData.extract) {
      response.wikipedia = {
        title: wikiData.title,
        description: wikiData.description,
        extract: wikiData.extract,
        url: wikiData.content_urls?.desktop?.page,
        image: wikiData.thumbnail?.source,
      };
    }

    // 4️⃣ Foursquare: food & nightlife
    if (FSQ_KEY && response.details.location) {
      const { lat, lon } = response.details.location;
      const fsqRes = await fetch(
        `https://api.foursquare.com/v3/places/search?ll=${lat},${lon}&categories=13065,13003&limit=5`,
        { headers: { Authorization: FSQ_KEY } }
      );
      const fsqData = await fsqRes.json();
      response.foursquare = fsqData.results?.map(f => ({
        name: f.name,
        category: f.categories?.[0]?.name,
        address: f.location?.formatted_address,
      })) || [];
    }

    // 5️⃣ OpenWeatherMap: current weather
    if (WEATHER_KEY && response.details.location) {
      const { lat, lon } = response.details.location;
      const weatherRes = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_KEY}&units=metric`
      );
      const weatherData = await weatherRes.json();
      if (weatherData.weather) {
        response.weather = {
          temp: weatherData.main.temp,
          condition: weatherData.weather[0].description,
          icon: `https://openweathermap.org/img/wn/${weatherData.weather[0].icon}@2x.png`,
        };
      }
    }

    // 6️⃣ Event
