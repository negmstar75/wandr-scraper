// netlify/functions/generateAffiliateLinks.cjs
const { createClient } = require("@supabase/supabase-js");
const { logToSupabase } = require("./utils/logger.cjs");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ------------------------------------------------------
// 🌍 Deep-link templates
// (unchanged keys — ensure keys match AFFILIATE_CONFIG partner keys)
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
function normalizeKey(key) {
  // produce consistent keys for lookup and partner_code
  return String(key || "")
    .toLowerCase()
    .replace(/[\s\.\-]+/g, "")
    .replace(/_+/g, "_");
}

function buildTpLink({ baseUrl, marker, trs, partner_id, campaign_id, targetUrl }) {
  if (!baseUrl) return targetUrl || "";
  const encoded = encodeURIComponent(targetUrl || "");
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encoded}&campaign_id=${campaign_id}`;
}

function fillTemplate(template, data) {
  if (!template) return "";
  return template.replace(/\{(.*?)\}/g, (_, key) => encodeURIComponent(data[key] ?? ""));
}

// Safely extract query param
function getQueryParam(event, name, fallback = undefined) {
  try {
    return (event.queryStringParameters && event.queryStringParameters[name]) || fallback;
  } catch (e) {
    return fallback;
  }
}

// ------------------------------------------------------
// 🏗️ Handler
// ------------------------------------------------------
exports.handler = async (event) => {
  let debug = false;
  try {
    const slug = getQueryParam(event, "slug");
    const name = getQueryParam(event, "name");
    const country = getQueryParam(event, "country");
    const city = getQueryParam(event, "city");
    debug = getQueryParam(event, "debug", "false") === "true";

    if (!slug || !name) {
      await logToSupabase("warn", "Missing required parameters", { slug, name, country, city });
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters: slug, name" }) };
    }

    await logToSupabase("info", "Start affiliate link generation", { slug, name, country, city, debug });

    const { marker, trs } = AFFILIATE_CONFIG;
    const partnersEntries = Object.entries(AFFILIATE_CONFIG.partners || {});
    const partnersData = [];
    const templateMisses = [];

    // --- Build partner links ---
    for (const [rawKey, p] of partnersEntries) {
      try {
        const key = normalizeKey(rawKey); // should match affiliateTemplates keys
        const template = affiliateTemplates[key];

        // Build basic data payload for templates
        const templateData = {
          slug,
          destination: name || city || country || "",
          checkin: "2025-10-06",
          checkout: "2025-10-12",
          adults: 2,
          children: 0,
          origin: "CAI",
          depart: "2025-10-06",
          return: "2025-10-12",
          tripType: "ROUNDTRIP",
        };

        let targetUrl = "";

        if (template && template.template) {
          targetUrl = fillTemplate(template.template, templateData);
        } else {
          // Log miss and create a safe fallback
          templateMisses.push(key);
          await logToSupabase("warn", `No template found for partner key: ${key}`, { partner: p.name, key });
          const fallbackDomain = key.replace(/_/g, "");
          const fallbackDest = encodeURIComponent(templateData.destination || "");
          targetUrl = `https://${fallbackDomain}.com/search?query=${fallbackDest}`;
        }

        // Build final deep link: some partners (like Lonely Planet) should not be TP-wrapped
        let deep_link;
        const normalizedName = String(p.name || "").toLowerCase();
        if (normalizedName.includes("lonely") || !p.baseUrl) {
          // preserve direct targetUrl for partners without TP config
          deep_link = targetUrl;
        } else {
          deep_link = buildTpLink({
            baseUrl: p.baseUrl,
            marker,
            trs,
            partner_id: p.partner_id,
            campaign_id: p.campaign_id,
            targetUrl,
          });
        }

        partnersData.push({
          partner_name: p.name,
          partner_code: key.replace(/[^a-z0-9_]/g, "_"), // safe partner_code for DB
          deep_link,
          logo_url: template?.logo_url || "",
          template_used: !!template,
        });
      } catch (innerErr) {
        // non-fatal for one partner: log and continue building others
        await logToSupabase("error", "Error building partner link", {
          partner: p.name,
          error: innerErr.message,
        });
      }
    }

    await logToSupabase("info", "Built partner link array", { count: partnersData.length, templateMisses });

    // --- Insert or update affiliate data ---
    const linksToInsert = [];

    for (const partner of partnersData) {
      try {
        // defensive: check select error
        const { data: existing, error: selectErr } = await supabase
          .from("affiliates")
          .select("affiliate_id")
          .eq("partner_code", partner.partner_code)
          .maybeSingle();

        if (selectErr) {
          await logToSupabase("error", "Error selecting affiliate", { partner: partner.partner_code, error: selectErr.message });
          throw selectErr;
        }

        let affiliate_id = existing?.affiliate_id;

        if (!affiliate_id) {
          await logToSupabase("info", "Upserting affiliate record", { partner: partner.partner_name, partner_code: partner.partner_code });

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

          if (insertErr) {
            await logToSupabase("error", "Affiliate upsert error", { partner: partner.partner_code, error: insertErr.message });
            throw insertErr;
          }

          affiliate_id = aff?.affiliate_id;

          // double-check
          if (!affiliate_id) {
            const { data: existingAff, error: fetchErr } = await supabase
              .from("affiliates")
              .select("affiliate_id")
              .eq("partner_code", partner.partner_code)
              .maybeSingle();

            if (fetchErr) {
              await logToSupabase("error", "Failed to fetch affiliate after upsert", { partner: partner.partner_code, error: fetchErr.message });
              throw fetchErr;
            }
            affiliate_id = existingAff?.affiliate_id;
          }
        }

        if (!affiliate_id) {
          await logToSupabase("error", "Missing affiliate_id after attempts", { partner: partner.partner_code });
          throw new Error(`Missing affiliate_id for partner ${partner.partner_name}`);
        }

        linksToInsert.push({
          destination_slug: slug,
          affiliate_id,
          partner_code: partner.partner_code,
          deep_link: partner.deep_link,
          metadata: { city: city || null, country: country || null },
        });
      } catch (loopErr) {
        // log and continue with other partners
        await logToSupabase("error", "Skipping partner due to error", { partner: partner.partner_code, error: loopErr.message });
      }
    }

    if (linksToInsert.length === 0) {
      await logToSupabase("warn", "No links prepared for upsert", { slug, name, built: partnersData.length });
      return {
        statusCode: 200,
        body: JSON.stringify({
          status: "ok",
          message: `No affiliate links prepared for ${name}. Check logs.`,
          partners_prepared: partnersData.length,
          partners_upserted: 0,
          debug: debug ? { partnersData, templateMisses } : undefined,
        }),
      };
    }

    // --- Safe Upsert into partner_affiliate_links ---
    try {
      const { error: upsertErr } = await supabase
        .from("partner_affiliate_links")
        .upsert(linksToInsert, {
          onConflict: ["destination_slug", "affiliate_id"],
        });

      if (upsertErr) {
        await logToSupabase("error", "Upsert to partner_affiliate_links failed", { error: upsertErr.message });
        throw upsertErr;
      }
    } catch (upsertCatchErr) {
      await logToSupabase("error", "Upsert exception", { error: upsertCatchErr.message });
      throw upsertCatchErr;
    }

    await logToSupabase("info", "Affiliate links successfully inserted", { count: linksToInsert.length });

    // Successful response; include debug data if requested
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        message: `Affiliate links generated for ${name}`,
        partners_prepared: partnersData.length,
        partners_upserted: linksToInsert.length,
        debug: debug ? { partnersData, templateMisses } : undefined,
      }),
    };
  } catch (err) {
    // Top-level error handler
    await logToSupabase("error", "Fatal error during affiliate link generation", { error: err.message, stack: err.stack });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
