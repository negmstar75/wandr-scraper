// /netlify/functions/getDestinationDetails.js

import fetch from "node-fetch";

export async function handler(event) {
  const { id, source } = event.queryStringParameters;

  if (!id || !source) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Both 'id' and 'source' are required" }),
    };
  }

  try {
    let details = {};
    let debug = {};

    // --- Case 1: OpenTripMap via RapidAPI ---
    if (source === "opentripmap") {
      const otmUrl = `https://opentripmap-places-v1.p.rapidapi.com/en/places/xid/${id}`;
      const res = await fetch(otmUrl, {
        headers: {
          "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
          "X-RapidAPI-Host": "opentripmap-places-v1.p.rapidapi.com",
        },
      });
      const data = await res.json();
      debug.opentripmap = data;

      if (!res.ok) {
        return {
          statusCode: res.status,
          body: JSON.stringify({
            error: `OpenTripMap error (${res.status})`,
            debug,
          }),
        };
      }

      details = {
        id: data.xid,
        source: "opentripmap",
        name: data.name || null,
        description: data.wikipedia_extracts?.text || data.info?.descr || null,
        rating: null, // OTM doesn’t provide ratings
        categories: data.kinds ? data.kinds.split(",") : [],
        photos: data.preview ? [data.preview.source] : [],
        url: data.otm || data.wikipedia || null,
        lat: data.point?.lat,
        lon: data.point?.lon,
      };
    }

    // --- Case 2: Google Places ---
    else if (source === "google" && process.env.GOOGLE_PLACES_API_KEY) {
      const googleUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${id}&fields=name,rating,formatted_address,geometry,types,url,photos,editorial_summary&key=${process.env.GOOGLE_PLACES_API_KEY}`;
      const gRes = await fetch(googleUrl);
      const gData = await gRes.json();
      debug.google = gData;

      if (!gRes.ok || gData.status !== "OK") {
        return {
          statusCode: gRes.status,
          body: JSON.stringify({
            error: `Google Places error: ${gData.status}`,
            debug,
          }),
        };
      }

      const p = gData.result;
      details = {
        id,
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
        address: p.formatted_address || null,
        lat: p.geometry?.location?.lat,
        lon: p.geometry?.location?.lng,
      };
    }

    // --- Unknown Source ---
    else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid source (use 'opentripmap' or 'google')" }),
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
