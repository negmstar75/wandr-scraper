import fetch from "node-fetch";

export async function handler(event) {
  const { city = "Tokyo" } = event.queryStringParameters;

  try {
    // 1️⃣ Attractions (OpenTripMap)
    const geoRes = await fetch(
      `https://api.opentripmap.com/0.1/en/places/geoname?name=${encodeURIComponent(
        city
      )}&apikey=${process.env.OPENTRIPMAP_API_KEY}`
    );
    const geoData = await geoRes.json();
    const { lat, lon } = geoData;

    const attractionsRes = await fetch(
      `https://api.opentripmap.com/0.1/en/places/radius?radius=5000&lon=${lon}&lat=${lat}&rate=2&format=json&limit=10&apikey=${process.env.OPENTRIPMAP_API_KEY}`
    );
    const attractions = await attractionsRes.json();

    // 2️⃣ Images (Wikimedia)
    const wikiRes = await fetch(
      `${process.env.URL}/.netlify/functions/getCityImages?city=${city}`
    );
    const { images } = await wikiRes.json();

    // 3️⃣ Restaurants (Foursquare)
    const fsRes = await fetch(
      `${process.env.URL}/.netlify/functions/getRestaurants?lat=${lat}&lon=${lon}&city=${city}`
    );
    const { restaurants } = await fsRes.json();

    // 4️⃣ Hotels (Google Places)
    const hotelRes = await fetch(
      `${process.env.URL}/.netlify/functions/getHotels?lat=${lat}&lon=${lon}`
    );
    const { hotels } = await hotelRes.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        city,
        coordinates: { lat, lon },
        attractions,
        images,
        restaurants,
        hotels,
      }),
    };
  } catch (err) {
    console.error("❌ Error in getFullDestination:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
