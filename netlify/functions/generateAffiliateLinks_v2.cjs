// netlify/functions/generateAffiliateLinks_v2.5.cjs
// ✅ Adds partner_mappings support, backward-compatible with v2.4
const { createClient } = require("@supabase/supabase-js");
const { logToSupabase } = require("./utils/logger.cjs");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -----------------------------
// Templates (multi-variant)
// -----------------------------
const affiliateTemplates = {
  booking: {
    name: "Booking.com",
    variants: {
      stays: {
        template:
          "https://www.booking.com/searchresults.html?checkin={checkin}&checkout={checkout}&ss={destination}&group_adults={adults}&group_children=0&no_rooms=1",
        params: ["destination", "checkin", "checkout", "adults"],
      },
      attractions: {
        template:
          "https://www.booking.com/attractions/searchresults/{country}/{city_slug}.html",
        params: ["country", "city_slug"],
      },
    },
  },
  expedia: {
    name: "Expedia",
    variants: {
      activities: {
        template:
          "https://www.expedia.com/things-to-do/search?location={destination}&startDate={checkin}&endDate={checkout}&sort=RECOMMENDED",
        params: ["destination", "checkin", "checkout"],
      },
      stays: {
        template:
          "https://www.expedia.com/Hotel-Search?destination={destination}&d1={checkin}&d2={checkout}&adults={adults}&rooms=1",
        params: ["destination", "checkin", "checkout", "adults"],
      },
      flights: {
        template:
          "https://www.expedia.com/Flights-Search?leg1=from:{origin},to:{destination},departure:{depart}TANYT&leg2=from:{destination},to:{origin},departure:{return}TANYT&mode=search&passengers=adults:{adults}",
        params: ["origin", "destination", "depart", "return", "adults"],
      },
    },
  },
  getyourguide: { name: "GetYourGuide", variants: { default: { template: "https://www.getyourguide.com/{slug}-l16/", params: ["slug"] } } },
  tripadvisor: { name: "Tripadvisor", variants: { attractions: { template: "https://www.tripadvisor.com/Attractions-g{slug}-Activities.html", params: ["slug"] } } },
  tiqets: { name: "Tiqets", variants: { default: { template: "https://www.tiqets.com/en/things-to-do-in-{slug}-c66746/", params: ["slug"] } } },
  klook: { name: "Klook", variants: { default: { template: "https://www.klook.com/search/result/?query={destination}&sort=most_relevant", params: ["destination"] } } },
  rentalcars: { name: "Rentalcars", variants: { default: { template: "https://www.rentalcars.com/SearchResults.do?locationName={destination}", params: ["destination"] } } },
  cheapoair: { name: "CheapOair", variants: { default: { template: "https://www.cheapoair.com/air/listing?d1={origin}&d2={destination}&dt1={depart}&dt2={return}&tripType={tripType}", params: ["origin","destination","depart","return","tripType"] } } },
  hostelworld: { name: "Hostelworld", variants: { default: { template: "https://www.hostelworld.com/s?q={destination}&from={checkin}&to={checkout}&guests={adults}", params: ["destination","checkin","checkout","adults"] } } },
  wegotrip: { name: "WeGoTrip", variants: { default: { template: "https://wegotrip.com/{slug}-d3/", params: ["slug"] }, search: { template: "https://wegotrip.com/search?query={destination}", params: ["destination"] } } },
  gocity: { name: "GoCity", variants: { default: { template: "https://gocity.com/en/{slug}/passes", params: ["slug"] }, country: { template: "https://gocity.com/en/{country}/", params: ["country"] } } },
  airalo: { name: "Airalo", variants: { esim: { template: "https://www.airalo.com/{country}-esim", params: ["country"] } } },
  lonelyplanet: {
    name: "Lonely Planet",
    variants: {
      pocket: { template: "https://shop.lonelyplanet.com/products/pocket-{slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program", params: ["slug"] },
      product: { template: "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program", params: ["slug"] },
      elsewhere: { template: "https://www.elsewhere.io/{country}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program", params: ["country"] },
    },
  },
};

// -----------------------------
// Affiliate config
// -----------------------------
const AFFILIATE_CONFIG = {
  marker: "466615",
  trs: "252990",
  partners: {
    booking: { baseUrl: "https://tp.media/r", campaign_id: "84", partner_id: "2076" },
    expedia: { baseUrl: "https://tp.media/r", campaign_id: "594", partner_id: "8645" },
    getyourguide: { baseUrl: "https://tp.media/r", campaign_id: "108", partner_id: "3965" },
    tripadvisor: { baseUrl: "https://tp.media/r", campaign_id: "149", partner_id: "4456" },
    klook: { baseUrl: "https://tp.media/r", campaign_id: "137", partner_id: "4110" },
    tiqets: { baseUrl: "https://tp.media/r", campaign_id: "89", partner_id: "2074" },
    rentalcars: { baseUrl: "https://tp.media/r", campaign_id: "130", partner_id: "3814" },
    cheapoair: { baseUrl: "https://tp.media/r", campaign_id: "146", partner_id: "4426" },
    hostelworld: { baseUrl: "https://tp.media/r", campaign_id: "93", partner_id: "3518" },
    wegotrip: { baseUrl: "https://tp.media/r", campaign_id: "150", partner_id: "4487" },
    gocity: { baseUrl: "https://tp.media/r", campaign_id: "62", partner_id: "1942" },
    airalo: { baseUrl: "https://tp.media/r", campaign_id: "541", partner_id: "8310" },
    lonelyplanet: { baseUrl: "", campaign_id: null, partner_id: null },
  },
};

// -----------------------------
// Helpers
// -----------------------------
function getQuery(e, n, f = undefined) {
  try {
    return (e.queryStringParameters && e.queryStringParameters[n]) || f;
  } catch {
    return f;
  }
}
function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}
function cityToSlug(s) {
  if (!s) return "";
  return String(s).toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}
function fillTemplate(template, data) {
  if (!template) return "";
  return template.replace(/\{(.*?)\}/g, (_, k) => encodeURIComponent(data[k] ?? ""));
}
function buildTpLink({ baseUrl, marker, trs, partner_id, campaign_id, targetUrl }) {
  if (!baseUrl) return targetUrl;
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encodeURIComponent(targetUrl)}&campaign_id=${campaign_id}`;
}
function safePartnerCode(baseKey, variantKey) {
  return variantKey ? `${baseKey}_${variantKey}` : baseKey;
}

// -----------------------------
// Handler
// -----------------------------
exports.handler = async (event) => {
  try {
    const slug = getQuery(event, "slug");
    const name = getQuery(event, "name");
    if (!slug || !name)
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required params" }) };

    const country = getQuery(event, "country", "us").toLowerCase();
    const city = getQuery(event, "city", name);
    const origin = getQuery(event, "origin", "LAX");
    const mode = getQuery(event, "mode", "all");

    const depart = todayISO(1);
    const ret = todayISO(8);
    const checkin = depart;
    const checkout = ret;
    const city_slug = cityToSlug(city);

    const { data: mappingRows } = await supabase.from("partner_mappings").select("*").eq("active", true);
    const partnerOverrides = Array.isArray(mappingRows) ? mappingRows : [];

    const results = [];

    for (const [key, cfg] of Object.entries(AFFILIATE_CONFIG.partners)) {
      const tpl = affiliateTemplates[key];
      if (!tpl) continue;

      for (const [variantKey, variant] of Object.entries(tpl.variants)) {
        const override = partnerOverrides.find(
          (r) => r.partner_code === key && (!r.variant || r.variant === variantKey)
        );
        if (override && override.active === false) continue;

        const data = {
          slug: slug.split("/").pop(),
          destination: override?.destination_override || name,
          city_slug: override?.slug_override || city_slug,
          country: override?.country_override || country,
          origin,
          depart,
          return: ret,
          checkin,
          checkout,
          adults: 2,
        };

        let target = override?.override_url || fillTemplate(variant.template, data);
        const conf = cfg || {};
        const deep_link =
          conf.baseUrl && conf.campaign_id && conf.partner_id && key !== "lonelyplanet"
            ? buildTpLink({
                baseUrl: conf.baseUrl,
                marker: AFFILIATE_CONFIG.marker,
                trs: AFFILIATE_CONFIG.trs,
                partner_id: conf.partner_id,
                campaign_id: conf.campaign_id,
                targetUrl: target,
              })
            : target;

        results.push({
          partner: key,
          variant: variantKey,
          deep_link,
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ status: "ok", count: results.length, links: results }),
    };
  } catch (e) {
    await logToSupabase("error", "Fatal error in v2.5", { error: e.message });
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
