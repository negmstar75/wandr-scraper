// ====================================================
// 🌍 generateAffiliateLinks_v2.3.cjs
// Safe unified affiliate link generator — stable edition
// ====================================================

const { createClient } = require("@supabase/supabase-js");
const { logToSupabase } = require("./utils/logger.cjs");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------
// 🧱 Affiliate link templates
// ---------------------------------------------------
const affiliateTemplates = {
  booking: {
    name: "Booking.com",
    variants: {
      attractions: {
        template:
          "https://www.booking.com/attractions/searchresults/{country}/{slug}.html",
        params: ["country", "slug"],
      },
    },
  },
  expedia: {
    name: "Expedia",
    variants: {
      activities: {
        template:
          "https://www.expedia.com/things-to-do/search?location={destination}&sort=RECOMMENDED",
        params: ["destination"],
      },
    },
  },
  getyourguide: {
    name: "GetYourGuide",
    variants: {
      default: {
        template: "https://www.getyourguide.com/{slug}-l16/",
        params: ["slug"],
      },
    },
  },
  tripadvisor: {
    name: "Tripadvisor",
    variants: {
      attractions: {
        template:
          "https://www.tripadvisor.com/Attractions-g{slug}-Activities.html",
        params: ["slug"],
      },
    },
  },
  tiqets: {
    name: "Tiqets",
    variants: {
      default: {
        template: "https://www.tiqets.com/en/things-to-do-in-{slug}-c66746/",
        params: ["slug"],
      },
    },
  },
  klook: {
    name: "Klook",
    variants: {
      default: {
        template:
          "https://www.klook.com/search/result/?query={destination}&sort=most_relevant",
        params: ["destination"],
      },
    },
  },
  wegotrip: {
    name: "WeGoTrip",
    variants: {
      default: {
        template: "https://wegotrip.com/{slug}-d3/",
        params: ["slug"],
      },
    },
  },
  gocity: {
    name: "GoCity",
    variants: {
      default: { template: "https://gocity.com/en/{slug}/passes", params: ["slug"] },
    },
  },
  rentalcars: {
    name: "Rentalcars",
    variants: {
      default: {
        template:
          "https://www.rentalcars.com/SearchResults.do?locationName={destination}",
        params: ["destination"],
      },
    },
  },
  cheapoair: {
    name: "CheapOair",
    variants: {
      default: {
        template:
          "https://www.cheapoair.com/air/listing?d1={origin}&d2={destination}&dt1={depart}&dt2={return}&tripType={tripType}",
        params: ["origin", "destination", "depart", "return", "tripType"],
      },
    },
  },
  airalo: {
    name: "Airalo",
    variants: {
      esim: { template: "https://www.airalo.com/{country}-esim", params: ["country"] },
    },
  },
  lonelyplanet: {
    name: "Lonely Planet",
    variants: {
      // Elsewhere expert planning
      elsewhere: {
        template:
          "https://www.elsewhere.io/{country}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program",
        params: ["country"],
      },
      // AI-generated itineraries (used internally)
      itinerary_template: {
        template:
          "https://www.elsewhere.io/trip-template/itinerary/{itinerary_id}",
        params: ["itinerary_id"],
      },
      // Shop books/eBooks
      shop: {
        template:
          "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program",
        params: ["slug"],
      },
    },
  },
};

// ---------------------------------------------------
// 🧾 Travelpayouts partner configuration
// ---------------------------------------------------
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

// ---------------------------------------------------
// 🧩 Helpers
// ---------------------------------------------------
function normalizeKey(k) {
  return String(k || "").toLowerCase().replace(/[\s\.\-]+/g, "").replace(/_+/g, "_");
}
function fillTemplate(template, data) {
  return template.replace(/\{(.*?)\}/g, (_, key) => encodeURIComponent(data[key] ?? ""));
}
function buildTpLink({ baseUrl, marker, trs, partner_id, campaign_id, targetUrl }) {
  const encoded = encodeURIComponent(targetUrl);
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encoded}&campaign_id=${campaign_id}`;
}

// ---------------------------------------------------
// 🏗️ Main handler
// ---------------------------------------------------
exports.handler = async (event) => {
  try {
    const slug = event.queryStringParameters.slug;
    const name = event.queryStringParameters.name;
    const country = event.queryStringParameters.country || "us";
    const city = event.queryStringParameters.city || name;
    const debug = event.queryStringParameters.debug === "true";
    const itinerary_id = event.queryStringParameters.itinerary_id || "default-itin";

    if (!slug || !name)
      return { statusCode: 400, body: JSON.stringify({ error: "Missing slug or name" }) };

    const allPartnersData = [];

    for (const [rawKey, partnerCfg] of Object.entries(AFFILIATE_CONFIG.partners)) {
      const baseKey = normalizeKey(rawKey);
      const tpl = affiliateTemplates[baseKey];
      if (!tpl) continue;

      for (const [variantKey, v] of Object.entries(tpl.variants)) {
        // Skip non-relevant variants (e.g., stays/flights)
        if (variantKey.includes("stays") || variantKey.includes("flights")) continue;

        const filled = fillTemplate(v.template, {
          slug,
          destination: name,
          country,
          city,
          itinerary_id,
        });

        const deep_link =
          partnerCfg.baseUrl && partnerCfg.campaign_id
            ? buildTpLink({
                baseUrl: partnerCfg.baseUrl,
                marker: AFFILIATE_CONFIG.marker,
                trs: AFFILIATE_CONFIG.trs,
                partner_id: partnerCfg.partner_id,
                campaign_id: partnerCfg.campaign_id,
                targetUrl: filled,
              })
            : filled;

        allPartnersData.push({
          partner_name: tpl.name,
          partner_code: `${baseKey}_${variantKey}`,
          deep_link,
          variant: variantKey,
        });
      }
    }

    // ✅ Insert or update affiliates + links + activities/guides
    for (const partner of allPartnersData) {
      const { data: aff } = await supabase
        .from("affiliates")
        .upsert(
          [
            {
              partner_name: partner.partner_name,
              partner_code: partner.partner_code,
              base_url: partner.deep_link,
              active: true,
            },
          ],
          { onConflict: ["partner_code"] }
        )
        .select()
        .single();

      const affiliate_id = aff?.affiliate_id;
      if (!affiliate_id) continue;

      await supabase.from("partner_affiliate_links").upsert(
        [
          {
            destination_slug: slug,
            affiliate_id,
            partner_code: partner.partner_code,
            deep_link: partner.deep_link,
            metadata: { country, city },
            variant: partner.variant,
          },
        ],
        { onConflict: ["destination_slug", "affiliate_id"] }
      );

      // Insert into appropriate specialized table
      if (partner.partner_name === "Lonely Planet") {
        await supabase.from("guides").upsert(
          [
            {
              affiliate_id,
              slug,
              title: name,
              category: partner.variant,
              deep_link: partner.deep_link,
              language: "en",
              metadata: {
                variant: partner.variant,
                generated_at: new Date().toISOString(),
              },
            },
          ],
          { onConflict: ["affiliate_id", "deep_link"] }
        );
      } else {
        await supabase.from("activities").upsert(
          [
            {
              affiliate_id,
              destination_slug: slug,
              name,
              category: "activity",
              deep_link: partner.deep_link,
              metadata: { variant: partner.variant, generated_at: new Date().toISOString() },
            },
          ],
          { onConflict: ["affiliate_id", "deep_link"] }
        );
      }
    }

    await logToSupabase("info", "✅ Affiliate links generated (v2.3)", {
      slug,
      total: allPartnersData.length,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        message: `Affiliate links generated for ${name}`,
        partners: allPartnersData.length,
        debug: debug ? allPartnersData : undefined,
      }),
    };
  } catch (err) {
    await logToSupabase("error", "❌ Affiliate generation failed", {
      error: err.message,
      stack: err.stack,
    });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
