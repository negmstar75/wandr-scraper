// netlify/functions/getCityAttractions.js
const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const { city } = event.queryStringParameters;
    if (!city) {
      return { statusCode: 400, body: JSON.stringify({ error: "City is required" }) };
    }

    const debug = {};

    // 1. Geocode city with Nominatim
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
      city
    )}&format=json&limit=1`;
    debug.nominatimUrl = nominatimUrl;

    const nomRes = await fetch(nominatimUrl, {
      headers: { "User-Agent": process.env.WIKIMEDIA_USER_AGENT || "Wandr/1.0" },
    });
    const nomData = await nomRes.json();
    debug.nominatimData = nomData;

    if (!nomData || !nomData[0]) {
      return { statusCode: 404, body: JSON.stringify({ error: "City not found" }) };
    }

    const lat = nomData[0].lat;
    const lon = nomData[0].lon;

    // 2. Try OpenTripMap API
    const otmUrl = `https://api.opentripmap.com/0.1/en/places/radius?radius=10000&lon=${lon}&lat=${lat}&rate=2&limit=30&apikey=${process.env.OPENTRIPMAP_API_KEY}`;
    debug.otmUrl = otmUrl;

    const otmRes = await fetch(otmUrl);
    const poiData = await otmRes.json();
    debug.otmData = poiData;

    if (poiData.error && poiData.error.includes("Unauthorized")) {
      // 3. Fallback to Google Places
      const googleUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=attractions+in+${encodeURIComponent(
        city
      )}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
      debug.googleUrl = googleUrl;

      const googleRes = await fetch(googleUrl);
      const googleData = await googleRes.json();
      debug.googleData = googleData;

      if (googleData.results && googleData.results.length > 0) {
        const attractions = googleData.results.map((place) => ({
          name: place.name,
          address: place.formatted_address,
          rating: place.rating,
          place_id: place.place_id,
        }));
        return {
          statusCode: 200,
          body: JSON.stringify({ city, attractions, debug }),
        };
      } else {
        return {
          statusCode: 200,
          body: JSON.stringify({ city, attractions: [], debug }),
        };
      }
    }

    // If OTM worked
    if (poiData && poiData.features) {
      const attractions = poiData.features.map((f) => ({
        name: f.properties.name,
        kinds: f.properties.kinds,
        xid: f.properties.xid,
      }));
      return {
        statusCode: 200,
        body: JSON.stringify({ city, attractions, debug }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ city, attractions: [], debug }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
