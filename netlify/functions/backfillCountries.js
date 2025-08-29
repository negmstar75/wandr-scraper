import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async () => {
  try {
    // 1. Find rows missing country
    const { data: rows, error } = await supabase
      .from("destination_cache")
      .select("id, city, lat, lon")
      .is("country", null);

    if (error) {
      console.error("Supabase fetch error:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
      };
    }

    if (!rows?.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No rows need backfill ✅" }),
      };
    }

    const updates = [];

    for (const row of rows) {
      try {
        // 2. Get country via Nominatim
        const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${row.lat}&lon=${row.lon}&format=json&addressdetails=1`;

        const geo = await fetch(nominatimUrl, {
          headers: { "User-Agent": "wandr-app" },
        }).then((r) => r.json());

        const country = geo?.address?.country || null;

        if (country) {
          // 3. Update cache row
          const { error: upErr } = await supabase
            .from("destination_cache")
            .update({ country })
            .eq("id", row.id);

          if (upErr) {
            console.error("Update error:", upErr);
          } else {
            updates.push({ city: row.city, country });
          }
        }
      } catch (err) {
        console.error(`❌ Failed for ${row.city}:`, err.message);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Backfill complete for ${updates.length} rows`,
        updates,
      }),
    };
  } catch (err) {
    console.error("Handler failed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
