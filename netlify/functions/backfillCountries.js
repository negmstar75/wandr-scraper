import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CONTINENT_MAP = {
  Asia: ["Japan", "China", "India", "Thailand", "Indonesia", "Vietnam", "Malaysia", "Singapore"],
  Europe: ["France", "Germany", "Spain", "Italy", "United Kingdom", "Netherlands", "Switzerland"],
  North_America: ["United States", "Canada", "Mexico"],
  South_America: ["Brazil", "Argentina", "Chile", "Peru"],
  Africa: ["South Africa", "Egypt", "Morocco", "Kenya"],
  Oceania: ["Australia", "New Zealand", "Fiji"]
};

function getContinent(country) {
  for (const [continent, countries] of Object.entries(CONTINENT_MAP)) {
    if (countries.includes(country)) return continent;
  }
  return null;
}

async function backfillCountries() {
  const { data: rows, error } = await supabase
    .from("destination_cache")
    .select("id, city, lat, lon, country, region, continent");

  if (error) throw error;

  const updates = [];

  for (const row of rows) {
    if (row.country && row.region && row.continent) continue;

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${row.lat}&lon=${row.lon}&format=json&addressdetails=1&accept-language=en`;
    const geo = await fetch(url, { headers: { "User-Agent": "wandr-app" } }).then((r) => r.json());

    const country = geo?.address?.country || row.country;
    const region =
      geo?.address?.state ||
      geo?.address?.region ||
      geo?.address?.county ||
      row.region;
    const continent = country ? getContinent(country) : row.continent;

    const { error: updateErr } = await supabase
      .from("destination_cache")
      .update({ country, region, continent })
      .eq("id", row.id);

    if (!updateErr) updates.push({ city: row.city, country, region, continent });
  }

  console.log(JSON.stringify({ message: `Backfill complete for ${updates.length} rows`, updates }, null, 2));
}

backfillCountries().catch((err) => {
  console.error("❌ Backfill error:", err);
  process.exit(1);
});
