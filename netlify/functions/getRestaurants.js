import fetch from "node-fetch";

export async function handler(event) {
  const { lat = "35.6895", lon = "139.6917", city = "Tokyo" } =
    event.queryStringParameters;

  try {
    const url = `https://api.foursquare.com/v3/places/search?ll=${lat},${lon}&categories=13065&limit=15`; // 13065 = Restaurants

    const res = await fetch(url, {
      headers: {
        Authorization: process.env.FOURSQUARE_API_KEY,
        Accept: "application/json",
      },
    });

    const data = await res.json();

    const restaurants = (data.results || []).map((r) => ({
      name: r.name,
      location: r.location,
      categories: r.categories?.map((c) => c.name),
      rating: r.rating || null,
      fsq_id: r.fsq_id,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ city, restaurants }),
    };
  } catch (err) {
    console.error("❌ Error in getRestaurants:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
