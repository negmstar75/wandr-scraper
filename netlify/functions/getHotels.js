import fetch from "node-fetch";

export async function handler(event) {
  const { lat = "35.6895", lon = "139.6917" } = event.queryStringParameters;

  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=5000&type=lodging&key=${process.env.GOOGLE_PLACES_API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    const hotels = (data.results || []).map((h) => ({
      name: h.name,
      address: h.vicinity,
      rating: h.rating,
      user_ratings_total: h.user_ratings_total,
      place_id: h.place_id,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ hotels }),
    };
  } catch (err) {
    console.error("❌ Error in getHotels:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
