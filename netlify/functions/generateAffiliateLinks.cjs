// netlify/functions/generateAffiliateLinks.cjs
const { createClient } = require("@supabase/supabase-js");
const { logToSupabase } = require("./utils/logger.cjs");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ------------------------------------------------------
// 🌍 Deep-link templates
// ------------------------------------------------------
const affiliateTemplates = {
  booking: {
    name: "Booking.com",
    category: "hotel",
    template:
      "https://www.booking.com/searchresults.html?checkin={checkin}&checkout={checkout}&ss={destination}&group_adults={adults}&group_children={children}",
    params: ["destination", "checkin", "checkout", "adults", "children"],
  },
  expedia: {
    name: "Expedia",
    category: "hotel",
    template:
      "https://www.expedia.com/Hotel-Search?destination={destination}&d1={checkin}&d2={checkout}&adults={adults}&rooms=1",
    params: ["destination", "checkin", "checkout", "adults"],
  },
  expedia_activities: {
    name: "Expedia - Things to Do",
    category: "activities",
    template:
      "https://www.expedia.com/things-to-do/search?location={destination}&startDate={checkin}&endDate={checkout}&sort=RECOMMENDED",
    params: ["destination", "checkin", "checkout"],
  },
  getyourguide: {
    name: "GetYourGuide",
    category: "activities",
    template: "https://www.getyourguide.com/{slug}-l16/",
    params: ["slug"],
  },
  tripadvisor: {
    name: "Tripadvisor",
    category: "activities",
    template:
      "https://www.tripadvisor.com/Tourism-g187147-{slug}-Vacations.html",
    params: ["slug"],
  },
  tiqets: {
    name: "Tiqets",
    category: "activities",
    template: "https://www.tiqets.com/en/things-to-do-in-{slug}-c66746/",
    params: ["slug"],
  },
  klook: {
    name: "Klook",
    category: "activities",
    template:
      "https://www.klook.com/search/result/?query={destination}&sort=most_relevant",
    params: ["destination"],
  },
  rentalcars: {
    name: "Rentalcars",
    category: "car_rental",
    template:
      "https://www.rentalcars.com/search-results?locationName={destination}&driversAge={age}&puDay={pickup_day}&puMonth={pickup_month}&puYear={pickup_year}&doDay={drop_day}&doMonth={drop_month}&doYear={drop_year}",
    params: [
      "destination",
      "age",
      "pickup_day",
      "pickup_month",
      "pickup_year",
      "drop_day",
      "drop_month",
      "drop_year",
    ],
  },
  cheapoair: {
    name: "CheapOair",
    category: "flights",
    template:
      "https://www.cheapoair.com/air/listing?d1={origin}&d2={destination}&dt1={depart}&dt2={return}&tripType={tripType}",
    params: ["origin", "destination", "depart", "return", "tripType"],
  },
  hostelworld: {
    name: "Hostelworld",
    category: "hotel",
    template:
      "https://www.hostelworld.com/pwa/s?city={destination}&from={checkin}&to={checkout}&guests={adults}",
    params: ["destination", "checkin", "checkout", "adults"],
  },
  wegotrip: {
    name: "WeGoTrip",
    category: "activities",
    template: "https://wegotrip.com/{slug}-d3/",
    params: ["slug"],
  },
  gocity: {
    name: "GoCity",
    category: "activities",
    template: "https://gocity.com/en/{slug}/passes",
    params: ["slug"],
  },
  airalo: {
    name: "Airalo",
    category: "tools",
    template: "https://www.airalo.com/{slug}-esim",
    params: ["slug"],
  },
  lonelyplanet: {
    name: "Lonely Planet",
    category: "guides",
    template:
      "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program",
    params: ["slug"],
  },
};

// ------------------------------------------------------
// 🔗 Affiliate base configuration
// ------------------------------------------------------
const AFFILIATE_CONFIG = {
  marker: "466615",
  trs: "252990",
  lp_ref: "5103006.jxkDNNdC6D",
  partners: {
    booking: { name: "Booking.com", baseUrl: "https://tp.media/r", campaign_id: "84", partner_id: "2076" },
    expedia: { name: "Expedia", baseUrl: "https://tp.media/r", campaign_id: "594", partner_id: "8645" },
    getyourguide: { name: "GetYourGuide", baseUrl: "https://tp.media/r", campaign_id: "108", partner_id: "3965" },
    tripadvisor: { name: "Tripadvisor", baseUrl: "https://tp.media/r", campaign_id: "149", partner_id: "4456" },
    klook: { name: "Klook", baseUrl: "https://tp.media/r", campaign_id: "137", partner_id: "4110" },
    tiqets: { name: "Tiqets", baseUrl: "https://tp.media/r", campaign_id: "89", partner_id: "2074" },
    rentalcars: { name: "Rentalcars", baseUrl: "https://tp.media/r", campaign_id: "130", partner_id: "3814" },
    cheapoair: { name: "CheapOair", baseUrl: "https://tp.media/r", campaign_id: "146", partner_id: "4426" },
    hostelworld: { name: "Hostelworld", baseUrl: "https://tp.media/r", campaign_id: "93", partner_id: "3518" },
    wegotrip: { name: "WeGoTrip", baseUrl: "https://tp.media/r", campaign_id: "150", partner_id: "4487" },
    gocity: { name: "GoCity", baseUrl: "https://tp.media/r", campaign_id: "62", partner_id: "1942" },
    airalo: { name: "Airalo", baseUrl: "https://tp.media/r", campaign_id: "541", partner_id: "8310" },
    lonelyplanet: { name: "Lonely Planet", baseUrl: "", campaign_id: null, partner_id: null },
  },
};

// ------------------------------------------------------
// 🧩 Helpers
// ------------------------------------------------------
function buildTpLink({ baseUrl, marker, trs, partner_id, campaign_id, targetUrl }) {
  const encoded = encodeURIComponent(targetUrl);
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encoded}&campaign_id=${campaign_id}`;
}

function fillTemplate(template, data) {
  return template.replace(/\{(.*?)\}/g, (_, key) => encodeURIComponent(data[key] || ""));
}

// ------------------------------------------------------
// 🏗️ Handler
// ------------------------------------------------------
exports.handler = async (event) => {
  try {
    const { slug, name, country, city } = event.queryStringParameters || {};
    if (!slug || !name)
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters: slug, name" }) };

    await logToSupabase("info", "Start affiliate link generation", { slug, name, country, city });

    const { marker, trs } = AFFILIATE_CONFIG;
    const partners = Object.values(AFFILIATE_CONFIG.partners);
    const partnersData = [];

    // --- Build partner links ---
    for (const p of partners) {
      const template = affiliateTemplates[p.name.toLowerCase().replace(/\s+/g, "")];
      let targetUrl;

      if (template) {
        targetUrl = fillTemplate(template.template, {
          slug,
          destination: name || city || country,
          checkin: "2025-10-06",
          checkout: "2025-10-12",
          adults: 2,
          children: 0,
          origin: "CAI",
          depart: "2025-10-06",
          return: "2025-10-12",
          tripType: "ROUNDTRIP",
        });
      } else {
        await logToSupabase("warn", `No template found for ${p.name}`, { partner: p.name });
        targetUrl = `https://${p.name.toLowerCase().replace(/\s+/g, "")}.com/search?query=${encodeURIComponent(
          name || city || country
        )}`;
      }

      const deep_link =
        p.name === "Lonely Planet"
          ? targetUrl
          : buildTpLink({ baseUrl: p.baseUrl, marker, trs, partner_id: p.partner_id, campaign_id: p.campaign_id, targetUrl });

      partnersData.push({
        partner_name: p.name,
        partner_code: p.name.toLowerCase().replace(/\s+/g, "_"),
        deep_link,
        logo_url: template?.logo_url || "",
      });
    }

    await logToSupabase("info", "Built partner link array", { count: partnersData.length });

    // --- Insert or update affiliate data ---
    const linksToInsert = [];

    for (const partner of partnersData) {
      const { data: existing } = await supabase
        .from("affiliates")
        .select("affiliate_id")
        .eq("partner_code", partner.partner_code)
        .maybeSingle();

      let affiliate_id = existing?.affiliate_id;

      if (!affiliate_id) {
        await logToSupabase("info", "Upserting affiliate record", { partner: partner.partner_name });

        const { data: aff, error: insertErr } = await supabase
          .from("affiliates")
          .upsert(
            [
              {
                partner_name: partner.partner_name,
                partner_code: partner.partner_code,
                logo_url: partner.logo_url,
                base_url: partner.deep_link,
                active: true,
              },
            ],
            { onConflict: ["partner_code"] }
          )
          .select()
          .single();

        if (insertErr) throw insertErr;

        affiliate_id = aff?.affiliate_id;

        if (!affiliate_id) {
          const { data: existingAff, error: fetchErr } = await supabase
            .from("affiliates")
            .select("affiliate_id")
            .eq("partner_code", partner.partner_code)
            .maybeSingle();

          if (fetchErr) throw fetchErr;
          affiliate_id = existingAff?.affiliate_id;
        }
      }

      if (!affiliate_id) {
        throw new Error(`Missing affiliate_id for partner ${partner.partner_name}`);
      }

      linksToInsert.push({
        destination_slug: slug,
        affiliate_id,
        partner_code: partner.partner_code,
        deep_link: partner.deep_link,
        metadata: { city, country },
      });
    }

    // --- Safe Upsert ---
    try {
      const { error: upsertErr } = await supabase
        .from("partner_affiliate_links")
        .upsert(linksToInsert, {
          onConflict: ["destination_slug", "affiliate_id"],
          ignoreDuplicates: false,
        });

      if (upsertErr) throw upsertErr;
    } catch (upsertCatchErr) {
      await logToSupabase("error", "Upsert failed", { error: upsertCatchErr.message });
      throw upsertCatchErr;
    }

    await logToSupabase("info", "Affiliate links successfully inserted", { count: linksToInsert.length });

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        message: `Affiliate links generated for ${name}`,
        partners: linksToInsert.length,
      }),
    };
  } catch (err) {
    await logToSupabase("error", "Fatal error during affiliate link generation", { error: err.message });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
