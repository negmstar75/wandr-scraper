// /netlify/functions/getDestinationDetails.js

import fetch from "node-fetch";

export async function handler(event) {
  const { xid, place_id } = event.queryStringParameters;

  if (!xid && !place_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Please provide xid (OpenTripMap) or place_id (Google)" }),
    };
  }

  try {
    let standardized = null;
    let debug = {};

    // --- 1. Try OpenTripMap if xid provided ---
    if (xid) {
      const url = `https://api.opentripmap.com/0.1/en/places/xid/${xid}?apikey=${process.env.OPENTRIPMAP_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      debug.opentripmap = data;

      if (data && !data.error) {
        standardized = {
          name: data.name || null,
          address: data.address ? Object.values(data.address).join(", ") : null,
          description: data.wikipedia_extracts?.text || data.info?.descr || null,
          rating: null, // OTM has no ratings
          categories: data.kinds ? data.kinds.split(",") : [],
          photos: data.preview?.source ? [data.preview.source] : [],
          url: data.wikipedia || data.url || null,
        };
      }
    }

    // --- 2. Fallback to Google if no xid or no usable data ---
    if ((!standardized || !standardized.name) && place_id) {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      debug.google = data;

      if (data.result) {
        standardized = {
          name: data.result.name || null,
          address: data.result.formatted_address || null,
          description: data.result.editorial_summary?.overview || null,
          rating: data.result.rating || null,
          categories: data.result.types || [],
          photos: data.result.photos
            ? data.result.photos.map(
                (p) =>
                  `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${p.photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`
              )
            : [],
          url: data.result.url || null,
        };
      }
    }

    if (!standardized) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "No details found", debug }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        details: standardized,
        debug, // keep raw data here
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
