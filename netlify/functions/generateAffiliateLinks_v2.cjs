// netlify/functions/generateAffiliateLinks_v2.cjs
// generateAffiliateLinks_v2.4.cjs
// - dynamic flights/hotels dates
// - origin param fallback LAX (client should send origin if available)
// - country resolution priority: query param > slug prefix > fallback 'us'
// - Lonely Planet: elsewhere (country), itinerary_template (if provided), shop variants
// - activities-only filtering for activity partners by default (mode param)
// - robust logging and idempotent upserts

const { createClient } = require("@supabase/supabase-js");
const { logToSupabase } = require("./utils/logger.cjs");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -----------------------------
// Templates (cleaned)
// -----------------------------
const affiliateTemplates = {
  booking: {
    name: "Booking.com",
    variants: {
      stays: {
        template:
          "https://www.booking.com/searchresults.html?checkin={checkin}&checkout={checkout}&ss={destination}&group_adults={adults}&group_children={children}&no_rooms=1",
        params: ["destination", "checkin", "checkout", "adults", "children"],
      },
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
          "https://www.expedia.com/Flights-Search?leg1=from:{origin},to:{destination},departure:{depart}TANYT&leg2=from:{destination},to:{origin},departure:{return}TANYT&passengers=adults:{adults}",
        params: ["origin", "destination", "depart", "return", "adults"],
      },
    },
  },
  getyourguide: {
    name: "GetYourGuide",
    variants: { default: { template: "https://www.getyourguide.com/{slug}-l16/", params: ["slug"] } },
  },
  tripadvisor: {
    name: "Tripadvisor",
    variants: { attractions: { template: "https://www.tripadvisor.com/Attractions-g{slug}-Activities.html", params: ["slug"] } },
  },
  tiqets: {
    name: "Tiqets",
    variants: { default: { template: "https://www.tiqets.com/en/things-to-do-in-{slug}-c66746/", params: ["slug"] } },
  },
  klook: {
    name: "Klook",
    variants: { default: { template: "https://www.klook.com/search/result/?query={destination}&sort=most_relevant", params: ["destination"] } },
  },
  rentalcars: {
    name: "Rentalcars",
    variants: { default: { template: "https://www.rentalcars.com/SearchResults.do?locationName={destination}", params: ["destination"] } },
  },
  cheapoair: {
    name: "CheapOair",
    variants: { default: { template: "https://www.cheapoair.com/air/listing?d1={origin}&d2={destination}&dt1={depart}&dt2={return}&tripType={tripType}", params: ["origin", "destination", "depart", "return", "tripType"] } },
  },
  hostelworld: {
    name: "Hostelworld",
    variants: { default: { template: "https://www.hostelworld.com/s?q={destination}&from={checkin}&to={checkout}&guests={adults}", params: ["destination", "checkin", "checkout", "adults"] } },
  },
  wegotrip: { name: "WeGoTrip", variants: { default: { template: "https://wegotrip.com/{slug}-d3/", params: ["slug"] } } },
  gocity: { name: "GoCity", variants: { default: { template: "https://gocity.com/en/{slug}/passes", params: ["slug"] }, country: { template: "https://gocity.com/en/{country}/", params: ["country"] } } },
  airalo: { name: "Airalo", variants: { esim: { template: "https://www.airalo.com/{country}-esim", params: ["country"] } } },
  lonelyplanet: {
    name: "Lonely Planet",
    variants: {
      elsewhere: {
        template:
          "https://www.elsewhere.io/{country}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program",
        params: ["country"],
      },
      itinerary_template: {
        template: "https://www.elsewhere.io/trip-template/itinerary/{itinerary_id}",
        params: ["itinerary_id"],
      },
      // shop: we will produce multiple shop variants below
      shop: {
        template: "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program",
        params: ["slug"],
      },
    },
  },
};

// AFFILIATE CONFIG
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
function normalizeKey(k) {
  return String(k || "").toLowerCase().replace(/[\s\.\-]+/g, "").replace(/_+/g, "_");
}
function safePartnerCode(baseKey, variantKey) {
  if (!variantKey) return baseKey;
  return `${baseKey}_${variantKey}`.replace(/[^a-z0-9_]/g, "_");
}
function fillTemplate(template, data) {
  if (!template) return "";
  return template.replace(/\{(.*?)\}/g, (_, key) => encodeURIComponent(data[key] ?? ""));
}
function buildTpLink({ baseUrl, marker, trs, partner_id, campaign_id, targetUrl }) {
  if (!baseUrl) return targetUrl;
  const encoded = encodeURIComponent(targetUrl || "");
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encoded}&campaign_id=${campaign_id}`;
}
function getQuery(event, name, fallback = undefined) {
  try {
    return (event.queryStringParameters && event.queryStringParameters[name]) || fallback;
  } catch (e) {
    return fallback;
  }
}
function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}
function slugToCountry(slug) {
  // slug examples: "france/paris" or "usa/new-york"
  if (!slug || typeof slug !== "string") return null;
  const parts = slug.split("/");
  return parts.length > 1 ? parts[0] : null;
}

// -----------------------------
// Handler
// -----------------------------
exports.handler = async (event) => {
  let debug = false;
  try {
    const slug = getQuery(event, "slug");
    const name = getQuery(event, "name");
    const countryQ = getQuery(event, "country");
    const city = getQuery(event, "city");
    let origin = getQuery(event, "origin"); // recommended to be provided by client (geolocation)
    const itinerary_id = getQuery(event, "itinerary_id");
    debug = getQuery(event, "debug", "false") === "true";
    const mode = getQuery(event, "mode", "all"); // "all" or "activities" or "hotels" or "flights"

    if (!slug || !name) {
      await logToSupabase("warn", "Missing required parameters", { slug, name });
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters: slug, name" }) };
    }

    // origin fallback
    if (!origin || origin.trim() === "") {
      origin = "LAX";
      await logToSupabase("info", "Using fallback origin", { origin });
    }

    // country resolution priority: query param > slug prefix > 'us'
    let country = (countryQ && countryQ.trim()) || slugToCountry(slug) || "us";
    country = String(country).toLowerCase();

    // dates
    const depart = todayISO(1); // tomorrow
    const ret = todayISO(8); // +7 days after tomorrow (i.e., tomorrow +7)
    const checkin = depart;
    const checkout = ret;
    const adultsFlights = 1;
    const adultsHotels = 2;

    await logToSupabase("info", "Start affiliate generation v2.4", { slug, name, country, city, origin, mode, debug });

    const partners = AFFILIATE_CONFIG.partners;
    const allPartnersData = [];
    const templateMisses = [];

    // Build partner links with mode-aware filtering
    for (const [rawKey, partnerCfg] of Object.entries(partners)) {
      const baseKey = normalizeKey(rawKey);
      const tpl = affiliateTemplates[baseKey];
      if (!tpl) {
        await logToSupabase("warn", "No template for partner", { partner: rawKey });
        continue;
      }

      // For 'activities' mode, only include activity/attraction variants
      // For 'hotels' mode, include stays variants only
      // For 'flights' mode, include flights variants only
      // For 'all', include everything (but we will route inserts to appropriate tables)
      for (const [variantKey, variantObj] of Object.entries(tpl.variants)) {
        // mode filtering
        if (mode === "activities") {
          // allow attractions/activity variants only
          if (!variantKey.match(/(attract|activ|default|search|country|itinerary|shop|elsewhere)/i)) continue;
        } else if (mode === "hotels") {
          if (!variantKey.match(/(stays|stays|default)/i)) continue;
        } else if (mode === "flights") {
          if (!variantKey.match(/(flight|flights)/i)) continue;
        }

        // Prepare template data
        const templateData = {
          slug: slug.split("/").pop(),
          destination: name || city,
          city: city || name,
          country,
          origin,
          depart,
          return: ret,
          checkin,
          checkout,
          adults: variantObj.params && variantObj.params.includes("adults") ? adultsHotels : adultsFlights,
          tripType: "ROUNDTRIP",
          itinerary_id,
        };

        // Lonely Planet 'shop' forgiving variants: generate multiple shop slugs
        if (baseKey === "lonelyplanet" && variantKey === "shop") {
          // produce several variants for shop product handles (pocket-, slug, slug-travel-guide)
          const shopSlugs = [
            `pocket-${templateData.slug}`,
            templateData.slug,
            `${templateData.slug}-travel-guide`,
            `${templateData.slug}-guide`,
          ];
          for (const shopSlug of shopSlugs) {
            const target = fillTemplate(variantObj.template, { slug: shopSlug });
            const deep_link = target; // LP shop links are direct
            allPartnersData.push({
              partner_name: tpl.name,
              partner_code: safePartnerCode(baseKey, `shop_${shopSlug}`),
              deep_link,
              variant: `shop_${shopSlug}`,
              resolved: !!target,
            });
          }
          // also include Elsewhere and itinerary if present in variants; they are handled below in main loop
          continue;
        }

        // Build target URL
        let targetUrl = "";
        try {
          targetUrl = fillTemplate(variantObj.template, templateData);
        } catch (e) {
          templateMisses.push(`${baseKey}:${variantKey}`);
          await logToSupabase("warn", "Template fill error", { partner: baseKey, variantKey, err: e.message });
          continue;
        }

        // Very small sanity checks (avoid strings with 'undefined' or 'null')
        if (!targetUrl || /undefined|null/.test(targetUrl)) {
          templateMisses.push(`${baseKey}:${variantKey}`);
          await logToSupabase("warn", "Template produced empty or invalid url; falling back", { partner: baseKey, variantKey, templateData });
          // fallback to a generic search on partner domain
          targetUrl = `https://${baseKey}.com/search?query=${encodeURIComponent(templateData.destination || templateData.slug || country)}`;
        }

        // Wrap with tp.media if partner defined and not LP direct partners (LP handled direct)
        const partnerCfg = partnerCfg || {};
        const deep_link = (partnerCfg.baseUrl && partnerCfg.campaign_id && partnerCfg.partner_id && baseKey !== "lonelyplanet")
          ? buildTpLink({
              baseUrl: partnerCfg.baseUrl,
              marker: AFFILIATE_CONFIG.marker,
              trs: AFFILIATE_CONFIG.trs,
              partner_id: partnerCfg.partner_id,
              campaign_id: partnerCfg.campaign_id,
              targetUrl,
            })
          : targetUrl;

        allPartnersData.push({
          partner_name: tpl.name,
          partner_code: safePartnerCode(baseKey, variantKey),
          deep_link,
          variant: variantKey,
          template_used: true,
          raw_target: targetUrl,
        });
      } // end variants
    } // end partners

    await logToSupabase("info", "Built partner dataset", { total: allPartnersData.length, templateMisses });

    // --- Upsert affiliates & build map
    const affiliateIdMap = {};
    for (const p of allPartnersData) {
      try {
        const code = p.partner_code;
        if (affiliateIdMap[code]) continue;
        const { data: existing } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", code).maybeSingle();
        let affiliate_id = existing?.affiliate_id;
        if (!affiliate_id) {
          const { data: aff, error: upsertErr } = await supabase.from("affiliates").upsert(
            [{ partner_name: p.partner_name, partner_code: code, base_url: p.deep_link, active: true }],
            { onConflict: ["partner_code"] }
          ).select().single();
          if (upsertErr) {
            await logToSupabase("error", "Affiliate upsert error", { partner_code: code, error: upsertErr.message });
            // try fetch again
            const { data: existingAff } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", code).maybeSingle();
            affiliate_id = existingAff?.affiliate_id;
          } else {
            affiliate_id = aff?.affiliate_id;
          }
        }
        if (!affiliate_id) {
          await logToSupabase("warn", "Could not resolve affiliate_id", { partner_code: code });
          continue;
        }
        affiliateIdMap[code] = affiliate_id;
      } catch (e) {
        await logToSupabase("error", "Affiliate processing error", { error: e.message });
      }
    }

    // Build linksToInsert and dedupe
    const seen = new Set();
    const linksToInsert = [];
    for (const p of allPartnersData) {
      const affiliate_id = affiliateIdMap[p.partner_code];
      if (!affiliate_id) {
        await logToSupabase("warn", "Skip link - no affiliate_id", { partner_code: p.partner_code });
        continue;
      }
      const key = `${slug}::${affiliate_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      linksToInsert.push({
        destination_slug: slug,
        affiliate_id,
        partner_code: p.partner_code,
        deep_link: p.deep_link,
        metadata: { variant: p.variant, raw_target: p.raw_target || null },
        variant: p.variant,
      });
    }

    if (linksToInsert.length === 0) {
      await logToSupabase("warn", "No links prepared after dedupe", { slug });
      return { statusCode: 200, body: JSON.stringify({ status: "ok", message: "No links prepared", debug: debug ? { allPartnersData, templateMisses } : undefined }) };
    }

    // Upsert into partner_affiliate_links
    const { error: linksErr } = await supabase.from("partner_affiliate_links").upsert(linksToInsert, { onConflict: ["destination_slug", "affiliate_id"] });
    if (linksErr) {
      await logToSupabase("error", "partner_affiliate_links upsert failed", { error: linksErr.message });
      throw linksErr;
    }
    await logToSupabase("info", "partner_affiliate_links upserted", { count: linksToInsert.length });

    // Insert into specialized tables (flights/hotels/activities/guides)
    const counts = { flights: 0, hotels: 0, activities: 0, guides: 0 };

    for (const link of linksToInsert) {
      try {
        const affiliate_id = link.affiliate_id;
        const deep_link = link.deep_link;
        const variant = (link.variant || "").toLowerCase();
        const baseCode = link.partner_code.split("_")[0];

        // helper exists
        async function exists(table) {
          const { data, error } = await supabase.from(table).select("id").eq("affiliate_id", affiliate_id).eq("deep_link", deep_link).limit(1).maybeSingle();
          if (error) {
            await logToSupabase("warn", "exists check error", { table, error: error.message });
            return false;
          }
          return !!data;
        }

        // Flights: variants containing 'flight' or partners recognized for flights
        const isFlight = variant.includes("flight") || ["cheapoair", "expedia"].includes(baseCode);
        if (isFlight) {
          if (!(await exists("flights"))) {
            // build standardized flight payload (origin, destination slug, depart/return, passengers=1)
            const payload = {
              affiliate_id,
              destination_slug: slug,
              origin: origin || "LAX",
              airline: null,
              flight_code: null,
              deep_link,
              price: null,
              currency: null,
              metadata: { variant, generated_at: new Date().toISOString(), depart, return: ret, passengers: 1 },
            };
            const { error } = await supabase.from("flights").insert([payload]);
            if (error) await logToSupabase("warn", "flights insert failed", { error: error.message, payload });
            else counts.flights++;
          }
          continue; // flights kept separate (don't duplicate into activities/hotels)
        }

        // Hotels: variants containing 'stays' or partners known for hotels
        const isHotel = variant.includes("stays") || ["booking", "expedia", "hostelworld", "rentalcars"].includes(baseCode);
        if (isHotel) {
          if (!(await exists("hotels"))) {
            const payload = {
              affiliate_id,
              destination_slug: slug,
              name: null,
              stars: null,
              address: null,
              deep_link,
              price: null,
              currency: null,
              metadata: { variant, generated_at: new Date().toISOString(), checkin, checkout, adults: 2 },
            };
            const { error } = await supabase.from("hotels").insert([payload]);
            if (error) await logToSupabase("warn", "hotels insert failed", { error: error.message, payload });
            else counts.hotels++;
          }
          continue;
        }

        // Guides / LP variants
        if (baseCode === "lonelyplanet") {
          if (!(await exists("guides"))) {
            const payload = {
              affiliate_id,
              title: name,
              destination_slug: slug,
              category: variant || "guide",
              deep_link,
              language: "en",
              metadata: { variant, generated_at: new Date().toISOString() },
            };
            const { error } = await supabase.from("guides").insert([payload]);
            if (error) await logToSupabase("warn", "guides insert failed", { error: error.message, payload });
            else counts.guides++;
          }
          continue;
        }

        // Activities (default for activities partners)
        const isActivity = variant.includes("activ") || variant.includes("attract") || ["getyourguide","klook","tiqets","wegotrip","gocity","tripadvisor"].includes(baseCode);
        if (isActivity) {
          if (!(await exists("activities"))) {
            const payload = {
              affiliate_id,
              destination_slug: slug,
              name,
              category: "activity",
              deep_link,
              duration: null,
              price: null,
              currency: null,
              rating: null,
              metadata: { variant, generated_at: new Date().toISOString() },
            };
            const { error } = await supabase.from("activities").insert([payload]);
            if (error) await logToSupabase("warn", "activities insert failed", { error: error.message, payload });
            else counts.activities++;
          }
          continue;
        }

        // Fallback: insert into activities if nothing else matched
        if (!(await exists("activities"))) {
          const payload = {
            affiliate_id,
            destination_slug: slug,
            name,
            category: "misc",
            deep_link,
            metadata: { variant, generated_at: new Date().toISOString() },
          };
          const { error } = await supabase.from("activities").insert([payload]);
          if (error) await logToSupabase("warn", "activities fallback insert failed", { error: error.message, payload });
          else counts.activities++;
        }
      } catch (err) {
        await logToSupabase("error", "Error during specialized inserts", { error: err.message });
      }
    }

    await logToSupabase("info", "Specialized inserts finished", counts);

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        message: `Affiliate links generated for ${name}`,
        partners_prepared: allPartnersData.length,
        partners_upserted: linksToInsert.length,
        specialized_insert_counts: counts,
        debug: debug ? { allPartnersData, templateMisses, linksToInsert } : undefined,
      }),
    };
  } catch (err) {
    await logToSupabase("error", "Fatal error during affiliate generation v2.4", { error: err.message, stack: err.stack });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
