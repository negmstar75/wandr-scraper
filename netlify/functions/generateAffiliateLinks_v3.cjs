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
  const { city_slug, country_slug, geo_id } = mapping;
  const { depart, ret } = getFlightRange();

  switch (partner.partner_code) {
    case "booking_kayak":
      return `https://booking.kayak.com/flights/CURRENT-${city_slug.toUpperCase()}/${depart}/${ret}`;

    case "expedia":
      return `https://www.expedia.com/Flights-Search?trip=roundtrip&leg1=from:CURRENT,to:${city_slug},departure:${depart}TANYT&leg2=from:${city_slug},to:CURRENT,departure:${ret}TANYT&mode=search`;

    case "aviasales":
      return `https://www.aviasales.com/search/CURRENT${depart.slice(5, 10).replace("-", "")}${city_slug
        .slice(0, 3)
        .toUpperCase()}${ret.slice(5, 10).replace("-", "")}`;

    case "cheapoair":
      return `https://www.cheapoair.com/air/listing?d1=CURRENT&r1=${city_slug.toUpperCase()}&dt1=${depart}&dtype1=A&rtype1=A&d2=${city_slug.toUpperCase()}&r2=CURRENT&dt2=${ret}&dtype2=A&rtype2=A&tripType=ROUNDTRIP`;

    case "tripadvisor_restaurants":
      return `https://www.tripadvisor.com/Restaurants-${geo_id}-${city_slug}.html`;

    case "tripadvisor_rentals":
      return `https://www.tripadvisor.com/VacationRentals-${geo_id}-Reviews-${city_slug}-Vacation_Rentals.html`;

    case "elsewhere":
      return `https://www.elsewhere.io/${country_slug}`;

    case "gocity":
      return `https://gocity.com/${city_slug}`;

    default:
      return (
        mapping.override_url?.replace("{city_slug}", city_slug) ||
        partner.template_url ||
        partner.base_url
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
    const generation_id = uuidv4(); // ✅ one per batch run
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
