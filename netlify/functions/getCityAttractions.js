// /netlify/functions/getCityAttractions.js

import fetch from "node-fetch";

export async function handler(event) {
  const { city, country } = event.queryStringParameters;

  if (!city) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "City is required" }),
    };
  }

  try {
    let standardized = [];
    let debug = {};

    // --- Step 1: Get city coordinates (Nominatim) ---
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
      city
    )}${country ? "&country=" + encodeURIComponent(country) : ""}&format=json&limit=1`;

    const geoRes = await fetch(nominatimUrl, {
      headers: { "User-Agent": process.env.WIKIMEDIA_USER_AGENT || "WandrApp/1.0" },
    });
    const geoData = await geoRes.json();
    debug.nominatim = geoData;

    if (!geoData || !geoData[0]) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "City not found", debug }),
      };
    }

    const { lat, lon } = geoData[0];

    // --- Step 2: Query OpenTripMap (via RapidAPI) ---
    const otmUrl = `https://opentripmap-places-v1.p.rapidapi.com/en/places/radius?radius=10000&lon=${lon}&lat=${lat}&rate=2&limit=20`;
    const poiRes = await fetch(otmUrl, {
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "opentripmap-places-v1.p.rapidapi.com",
      },
    });
    const poiData = await poiRes.json();
    debug.opentripmap = poiData;

    if (poiData && poiData.features) {
      standardized = poiData.features.map((f) => ({
        id: f.properties.xid,
        source: "opentripmap",
        name: f.properties.name || null,
        description: null, // enrich via getDestinationDetails
        rating: null,
        categories: f.properties.kinds ? f.properties.kinds.split(",") : [],
        photos: [],
        url: null,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
      }));
    }

    // --- Step 3: Fallback to Google if OTM empty ---
    if (standardized.length === 0 && process.env.GOOGLE_PLACES_API_KEY) {
      const googleUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=attractions+in+${encodeURIComponent(
        city
      )}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
      const gRes = await fetch(googleUrl);
      const gData = await gRes.json();
      debug.google = gData;

      if (gData.results) {
        standardized = gData.results.map((p) => ({
          id: p.place_id,
          source: "google",
          name: p.name || null,
          description: p.editorial_summary?.overview || null,
          rating: p.rating || null,
          categories: p.types || [],
          photos: p.photos
            ? p.photos.map(
                (ph) =>
                  `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${ph.photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`
              )
            : [],
          url: p.url || null,
          lat: p.geometry?.location?.lat,
          lon: p.geometry?.location?.lng,
        }));
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        city,
        attractions: standardized,
        debug,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
