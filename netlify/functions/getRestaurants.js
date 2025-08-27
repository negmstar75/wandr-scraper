// /netlify/functions/getRestaurants.js
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

    let restaurants = [];

    // ---------- 1. Try Google Places ----------
    if (GOOGLE_API_KEY) {
      const googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=3000&type=restaurant&key=${GOOGLE_API_KEY}`;
      const googleRes = await fetch(googleUrl);
      const googleData = await googleRes.json();

      if (googleData.results && googleData.results.length > 0) {
        restaurants = googleData.results.map((r) => ({
          id: r.place_id,
          name: r.name,
          description: r.vicinity || "",
          rating: r.rating || null,
          categories: r.types || ["restaurant"],
          photos: r.photos
            ? r.photos.map(
                (p) =>
                  `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${p.photo_reference}&key=${GOOGLE_API_KEY}`
              )
            : [],
          url: r.business_status ? `https://maps.google.com/?q=${encodeURIComponent(r.name)}` : "",
          lat: r.geometry?.location?.lat,
          lon: r.geometry?.location?.lng,
        }));
      }
    }

    // ---------- 2. Fallback to Foursquare if empty ----------
    if (restaurants.length === 0 && FOURSQUARE_KEY) {
      const fsqUrl = `https://api.foursquare.com/v3/places/search?ll=${lat},${lon}&radius=3000&categories=13065&limit=20`; // 13065 = restaurant category
      const fsqRes = await fetch(fsqUrl, {
        headers: { Authorization: FOURSQUARE_KEY },
      });
      const fsqData = await fsqRes.json();

      if (fsqData.results && fsqData.results.length > 0) {
        restaurants = fsqData.results.map((r) => ({
          id: r.fsq_id,
          name: r.name,
          description: r.location?.formatted_address || "",
          rating: null, // Foursquare free API doesn’t return ratings
          categories: r.categories?.map((c) => c.name.toLowerCase()) || ["restaurant"],
          photos: [], // could add later using Foursquare photos endpoint
          url: r.link || "",
          lat: r.geocodes?.main?.latitude,
          lon: r.geocodes?.main?.longitude,
        }));
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        city,
        restaurants,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
