// /netlify/functions/getFullDestination.js
import fetch from "node-fetch";

const OPENTRIPMAP_API_KEY = process.env.OPENTRIPMAP_API_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const OPENWEATHERMAP_API_KEY = process.env.OPENWEATHERMAP_API_KEY;
const EVENTBRITE_API_KEY = process.env.EVENTBRITE_API_KEY;
const WIKIMEDIA_USER_AGENT = process.env.WIKIMEDIA_USER_AGENT || "Wandr/1.0";

export async function handler(event) {
  const { city, country } = event.queryStringParameters;

  if (!city) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "City parameter is required" }),
    };
  }

  try {
    // 1. Resolve coordinates with OpenTripMap or Google fallback
    let lat, lon;

    const geoUrl = `https://api.opentripmap.com/0.1/en/places/geoname?name=${encodeURIComponent(
      city
    )}&apikey=${OPENTRIPMAP_API_KEY}`;
    let geoData = await fetch(geoUrl).then((res) => res.json());

    if (geoData && geoData.lat && geoData.lon) {
      lat = geoData.lat;
      lon = geoData.lon;
    } else {
      const googleGeoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        city + (country ? `, ${country}` : "")
      )}&key=${GOOGLE_PLACES_API_KEY}`;
      const googleGeo = await fetch(googleGeoUrl).then((res) => res.json());

      if (
        googleGeo.results &&
        googleGeo.results.length > 0 &&
        googleGeo.results[0].geometry
      ) {
        lat = googleGeo.results[0].geometry.location.lat;
        lon = googleGeo.results[0].geometry.location.lng;
      }
    }

    if (!lat || !lon) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "City not found" }),
      };
    }

    // 2. Attractions
    let attractions = [];
    try {
      const radiusUrl = `https://api.opentripmap.com/0.1/en/places/radius?radius=10000&lon=${lon}&lat=${lat}&rate=2&limit=10&apikey=${OPENTRIPMAP_API_KEY}`;
      const poiData = await fetch(radiusUrl).then((res) => res.json());

      if (poiData.features) {
        attractions = poiData.features.map((p) => ({
          xid: p.properties.xid,
          name: p.properties.name,
          kind: p.properties.kinds,
        }));
      }
    } catch (e) {
      attractions = [];
    }

    // 3. Hotels (Google Places)
    let hotels = [];
    try {
      const hotelsUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=hotels+in+${encodeURIComponent(
        city
      )}&key=${GOOGLE_PLACES_API_KEY}`;
      const hotelData = await fetch(hotelsUrl).then((res) => res.json());

      if (hotelData.results) {
        hotels = hotelData.results.slice(0, 10).map((h) => ({
          name: h.name,
          address: h.formatted_address,
          rating: h.rating,
          user_ratings_total: h.user_ratings_total,
          place_id: h.place_id,
        }));
      }
    } catch (e) {
      hotels = [];
    }

    // 4. Restaurants (Google Places)
    let restaurants = [];
    try {
      const restaurantUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=restaurants+in+${encodeURIComponent(
        city
      )}&key=${GOOGLE_PLACES_API_KEY}`;
      const restaurantData = await fetch(restaurantUrl).then((res) => res.json());

      if (restaurantData.results) {
        restaurants = restaurantData.results.slice(0, 10).map((r) => ({
          name: r.name,
          address: r.formatted_address,
          rating: r.rating,
          user_ratings_total: r.user_ratings_total,
          place_id: r.place_id,
        }));
      }
    } catch (e) {
      restaurants = [];
    }

    // 5. Events (Eventbrite API)
    let events = [];
    try {
      const eventsUrl = `https://www.eventbriteapi.com/v3/events/search/?q=${encodeURIComponent(
        city
      )}&location.address=${encodeURIComponent(
        city
      )}&token=${EVENTBRITE_API_KEY}`;
      const eventData = await fetch(eventsUrl).then((res) => res.json());

      if (eventData.events) {
        events = eventData.events.slice(0, 5).map((ev) => ({
          name: ev.name.text,
          url: ev.url,
          start: ev.start.local,
          end: ev.end.local,
        }));
      }
    } catch (e) {
      events = [];
    }

    // 6. Current weather
    let weather = {};
    try {
      const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHERMAP_API_KEY}`;
      const weatherData = await fetch(weatherUrl).then((res) => res.json());

      if (weatherData && weatherData.main) {
        weather = {
          temp: weatherData.main.temp,
          feels_like: weatherData.main.feels_like,
          description: weatherData.weather[0].description,
          icon: weatherData.weather[0].icon,
        };
      }
    } catch (e) {
      weather = {};
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        city,
        coordinates: { lat, lon },
        attractions,
        hotels,
        restaurants,
        events,
        weather,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
