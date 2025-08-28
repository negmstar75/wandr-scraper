// /netlify/functions/getDestinationDetails.js
import fetch from "node-fetch";

export async function handler(event) {
  const { xid, place_id } = event.queryStringParameters;

  if (!xid && !place_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "xid (OTM) or place_id (Google) is required" }),
    };
  }

  try {
    let details = {};
    let debug = {};

    // --- Case 1: OpenTripMap xid (via RapidAPI) ---
    if (xid) {
      const otmUrl = `https://${process.env.OPENTRIPMAP_RAPID_HOST}/en/places/xid/${xid}`;
      const otmRes = await fetch(otmUrl, {
        headers: {
          "X-RapidAPI-Key": process.env.OPENTRIPMAP_RAPID_KEY,
          "X-RapidAPI-Host": process.env.OPENTRIPMAP_RAPID_HOST,
        },
      });
      const otmData = await otmRes.json();
      debug.opentripmap = otmData;

      if (!otmData.error) {
        details = {
          id: otmData.xid,
          name: otmData.name || null,
          description: otmData.wikipedia_extracts?.text || otmData.info?.descr || null,
          url: otmData.url || otmData.wikipedia || null,
          lat: otmData.point?.lat || null,
          lon: otmData.point?.lon || null,
          address: otmData.address || null,
          categories: otmData.kinds ? otmData.kinds.split(",") : [],
          photos: otmData.preview ? [otmData.preview.source] : [],
        };
      }
    }

    // --- Case 2: Google Place Details fallback ---
    if (!details.name && place_id && process.env.GOOGLE_PLACES_API_KEY) {
      const googleUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=name,rating,formatted_address,geometry,types,photos,url,editorial_summary&key=${process.env.GOOGLE_PLACES_API_KEY}`;
      const gRes = await fetch(googleUrl);
      const gData = await gRes.json();
      debug.google = gData;

      if (gData.result) {
        const g = gData.result;
        details = {
          id: g.place_id,
          name: g.name || null,
          description: g.editorial_summary?.overview || null,
          url: g.url || null,
          lat: g.geometry?.location?.lat || null,
          lon: g.geometry?.location?.lng || null,
          address: g.formatted_address || null,
          categories: g.types || [],
          rating: g.rating || null,
          photos: g.photos
            ? g.photos.map(
                (ph) =>
                  `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${ph.photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`
              )
            : [],
        };
      }
    }

    if (!details.name) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "No details found", debug }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ details, debug }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
