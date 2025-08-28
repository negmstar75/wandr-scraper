// /netlify/functions/getHotels.js
import fetch from "node-fetch";

export async function handler(event) {
  const { city, lat, lon, limit = 10, debug = "false" } =
    event.queryStringParameters || {};

  if (!city && (!lat || !lon)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "City or lat/lon is required" }),
    };
  }

  const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
  if (!GOOGLE_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing Google Places API key" }),
    };
  }

  let finalLat = lat;
  let finalLon = lon;
  const debugInfo = {};

  try {
    // Step 1: If no lat/lon, geocode city
    if ((!finalLat || !finalLon) && city) {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
        city
      )}&format=json&limit=1`;
      const geoRes = await fetch(nominatimUrl, {
        headers: { "User-Agent": "WandrApp/1.0" },
      });
      const geoData = await geoRes.json();
      debugInfo.nominatim = geoData;

      if (geoData?.[0]) {
        finalLat = geoData[0].lat;
        finalLon = geoData[0].lon;
      }
    }

    // Step 2: Google Places
    let url;
    if (finalLat && finalLon) {
      url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?keyword=hotel&location=${finalLat},${finalLon}&radius=5000&key=${GOOGLE_KEY}`;
    } else {
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=hotels+in+${encodeURIComponent(
        city
      )}&key=${GOOGLE_KEY}`;
    }

    const res = await fetch(url);
    const data = await res.json();
    debugInfo.google = data;

    const hotels = (data.results || []).slice(0, limit).map((h) => ({
      id: h.place_id,
      source: "google",
      name: h.name || null,
      rating: h.rating || null,
      address: h.formatted_address || h.vicinity || null,
      categories: h.types || [],
      photos: h.photos
        ? h.photos.map(
            (ph) =>
              `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${ph.photo_reference}&key=${GOOGLE_KEY}`
          )
        : [],
      lat: h.geometry?.location?.lat,
      lon: h.geometry?.location?.lng,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        city,
        hotels,
        debug: debug === "true" ? debugInfo : undefined,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message, debug: debugInfo }),
    };
  }
}
