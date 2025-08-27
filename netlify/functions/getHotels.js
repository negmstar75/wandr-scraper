// /netlify/functions/getHotels.js
import fetch from "node-fetch";

export async function handler(event) {
  try {
    const { city, lat, lon } = event.queryStringParameters;

    if (!lat || !lon) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing lat/lon params" }),
      };
    }

    const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
    const FOURSQUARE_KEY = process.env.FOURSQUARE_API_KEY;

    let hotels = [];

    // ---------- 1. Try Google Places ----------
    if (GOOGLE_API_KEY) {
      const googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=5000&type=lodging&key=${GOOGLE_API_KEY}`;
      const googleRes = await fetch(googleUrl);
      const googleData = await googleRes.json();

      if (googleData.results && googleData.results.length > 0) {
        hotels = googleData.results.map((h) => ({
          id: h.place_id,
          name: h.name,
          description: h.vicinity || "",
          rating: h.rating || null,
          categories: h.types || ["hotel"],
          photos: h.photos
            ? h.photos.map(
                (p) =>
                  `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${p.photo_reference}&key=${GOOGLE_API_KEY}`
              )
            : [],
          url: h.business_status ? `https://maps.google.com/?q=${encodeURIComponent(h.name)}` : "",
          lat: h.geometry?.location?.lat,
          lon: h.geometry?.location?.lng,
        }));
      }
    }

    // ---------- 2. Fallback to Foursquare ----------
    if (hotels.length === 0 && FOURSQUARE_KEY) {
      // Foursquare category for hotels = 19014
      const fsqUrl = `https://api.foursquare.com/v3/places/search?ll=${lat},${lon}&radius=5000&categories=19014&limit=20`;
      const fsqRes = await fetch(fsqUrl, {
        headers: { Authorization: FOURSQUARE_KEY },
      });
      const fsqData = await fsqRes.json();

      if (fsqData.results && fsqData.results.length > 0) {
        hotels = fsqData.results.map((h) => ({
          id: h.fsq_id,
          name: h.name,
          description: h.location?.formatted_address || "",
          rating: null, // Foursquare free tier doesn’t return ratings
          categories: h.categories?.map((c) => c.name.toLowerCase()) || ["hotel"],
          photos: [], // could add later from Foursquare photos API
          url: h.link || "",
          lat: h.geocodes?.main?.latitude,
          lon: h.geocodes?.main?.longitude,
        }));
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        city,
        hotels,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
