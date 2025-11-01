/**
 * generateAffiliateLinks_v3.cjs
 * -----------------------------------------------
 * Hybrid affiliate link generator for WANDR (Supabase version)
 * Uses: affiliates, partner_mappings, partner_affiliate_links (+ vw_partner_flight_previews)
 * Compatible with Booking, Expedia, Aviasales, Kayak, Elsewhere, GoCity, etc.
 */

const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4 } = require("uuid");

// ----------------------------------------------------------
// Initialize Supabase client (Server-side, uses Service Role key)
// ----------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------
function formatDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getFlightRange() {
  return { depart: formatDate(7), ret: formatDate(14) };
}

// ----------------------------------------------------------
// Fetchers (Supabase versions)
// ----------------------------------------------------------
async function getActiveAffiliates() {
  const { data, error } = await supabase
    .from("affiliates")
    .select("affiliate_id, partner_code, template_url, base_url")
    .eq("active", true);

  if (error) throw new Error(`Error fetching affiliates: ${error.message}`);
  return data;
}

async function getPartnerMappings(partnerCode) {
  const { data, error } = await supabase
    .from("partner_mappings")
    .select("city_slug, country_slug, country_code, geo_id, override_url, override_slug")
    .eq("partner_code", partnerCode)
    .eq("active", true);

  if (error) throw new Error(`Error fetching mappings for ${partnerCode}: ${error.message}`);
  return data;
}

async function fetchFlightPreviews(partnerCode) {
  const { data, error } = await supabase
    .from("vw_partner_flight_previews")
    .select("partner_code, destination_slug, override_url, city_slug, country_slug, country_code, geo_id")
    .eq("partner_code", partnerCode)
    .eq("active", true);

  if (error) throw new Error(`Error fetching flight previews: ${error.message}`);
  return data;
}

// ----------------------------------------------------------
// Deep link builder
// ----------------------------------------------------------
function buildDeepLink(partner, mapping) {
  const { city_slug, country_slug, country_code, geo_id } = mapping;
  const { depart, ret } = getFlightRange();

  // Prepare template replacement base
  const template = partner.template_url || "";
  const wrap = partner.base_url || "";
  const encoded = encodeURIComponent(
    template
      .replace("{city_slug}", city_slug || "")
      .replace("{country_slug}", country_slug || "")
      .replace("{country_code}", country_code || "")
      .replace("{geo_id}", geo_id || "")
      .replace("{depart}", depart)
      .replace("{return}", ret)
      .replace("{checkin}", depart)
      .replace("{checkout}", ret)
      .replace("{adults}", "2")
  );

  // --- Specific partner deep-link handling ---
  switch (partner.partner_code) {
    case "booking_stays":
      return `${wrap}&u=${encodeURIComponent(`https://www.booking.com/searchresults.html?ss=${city_slug || country_slug}`)}`;
    case "booking_cars":
      return `${wrap}&u=${encodeURIComponent(`https://www.booking.com/cars/index.html?city=${city_slug || country_slug}`)}`;
    case "booking_attractions":
      return `${wrap}&u=${encodeURIComponent(`https://www.booking.com/attractions/searchresults/${country_code}/${city_slug}.html`)}`;
    case "cheapoair":
      return `${wrap}&u=${encodeURIComponent(
        `https://www.cheapoair.com/air/listing?d1=CURRENT&r1=${city_slug.toUpperCase()}&dt1=${depart}&d2=${city_slug.toUpperCase()}&r2=CURRENT&dt2=${ret}&tripType=ROUNDTRIP&adults=2`
      )}`;
    case "expedia_flights":
    case "expedia_cars":
    case "expedia_stays":
    case "expedia_activities":
      return `${wrap}&u=${encoded}`;
    case "tripadvisor_hotels":
    case "tripadvisor_restaurants":
    case "tripadvisor_attractions":
    case "tripadvisor_vacation_rentals":
      return `${wrap}&u=${encoded}`;
    case "gocity":
      return `${wrap}&u=${encodeURIComponent(`https://gocity.com/en/${city_slug || country_slug}`)}`;
    case "elsewhere":
      return `${wrap}&u=${encodeURIComponent(`https://www.elsewhere.io/${country_slug}`)}`;
    case "aviasales":
      return `${wrap}&u=${encodeURIComponent(
        `https://www.aviasales.com/search/CURRENT${depart.slice(5, 10).replace("-", "")}${city_slug
          .slice(0, 3)
          .toUpperCase()}${ret.slice(5, 10).replace("-", "")}`
      )}`;
    default:
      // fallback for any Travelpayouts partner
      if (wrap.includes("tp.media")) {
        return `${wrap}&u=${encoded}`;
      }
      // direct / manual override
      return (
        mapping.override_url?.replace("{city_slug}", city_slug) ||
        template ||
        wrap
      );
  }
}

// ----------------------------------------------------------
// Insert / upsert generated link (Supabase upsert)
// ----------------------------------------------------------
async function insertGeneratedLink({
  affiliate_id,
  destination_slug,
  partner_code,
  deep_link,
  base_url,
  generation_id,
  debug = false,
}) {
  if (debug) {
    console.log("🧪 [DEBUG] Skipping DB write:", partner_code, destination_slug);
    return { id: "debug-mode" };
  }

  const { data, error } = await supabase
    .from("partner_affiliate_links")
    .upsert(
      [
        {
          affiliate_id,
          destination_slug,
          partner_code,
          deep_link,
          base_url,
          generation_id,
          generated_by: "generateAffiliateLinks_v3",
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "destination_slug,partner_code,variant" }
    )
    .select("id")
    .single();

  if (error) throw new Error(`Error inserting link: ${error.message}`);
  return data;
}

// ----------------------------------------------------------
// Main handler (supports Postman test mode)
// ----------------------------------------------------------
exports.handler = async function (event) {
  console.log("🚀 Starting generateAffiliateLinks_v3");

  const body = event.body ? JSON.parse(event.body) : {};
  const { partners = [], limit = 0, debug = false } = body;

  console.log(
    `⚙️ Params => partners:${partners.length ? partners.join(", ") : "all"}, limit:${limit}, debug:${debug}`
  );

  try {
    // Create a data_generation record for tracking this batch
const generation_id = uuidv4();
const { error: genError } = await supabase
  .from("data_generations")
  .insert([
    {
      id: generation_id,
      generated_by: "generateAffiliateLinks_v3",
      started_at: new Date().toISOString(),
      notes: "Automated affiliate link generation batch",
    },
  ]);

if (genError) {
  console.error("⚠️ Failed to create data_generation record:", genError.message);
}

    const affiliates = await getActiveAffiliates();
    const targetAffiliates =
      partners.length > 0
        ? affiliates.filter((a) => partners.includes(a.partner_code))
        : affiliates;

    for (const partner of targetAffiliates) {
      console.log(`\n🔗 Generating links for ${partner.partner_code}...`);
      const mappings = await getPartnerMappings(partner.partner_code);
      const sliced = limit > 0 ? mappings.slice(0, limit) : mappings;

      for (const mapping of sliced) {
        const deepLink = buildDeepLink(partner, mapping);
        const destination_slug = mapping.city_slug || mapping.country_slug;

        await insertGeneratedLink({
          affiliate_id: partner.affiliate_id,
          destination_slug,
          partner_code: partner.partner_code,
          deep_link: deepLink,
          base_url: partner.base_url,
          generation_id,
          debug,
        });

        console.log(`✅ ${partner.partner_code} → ${destination_slug}`);
      }

      // Optional flight previews (debug mode)
      if (
        process.env.DEBUG_FLIGHT_PREVIEWS === "true" &&
        ["booking_kayak", "expedia", "aviasales", "cheapoair"].includes(partner.partner_code)
      ) {
        const previews = await fetchFlightPreviews(partner.partner_code);
        if (previews?.length) {
          console.log(`\n📡 Flight preview (${partner.partner_code}):`);
          previews.slice(0, 3).forEach((r) => console.log(`  ${r.override_url}`));
        }
      }
    }

    console.log("\n🎉 Affiliate link generation complete.");
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Affiliate links generated successfully.", debug }),
    };
  } catch (err) {
    console.error("❌ Error generating affiliate links:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
