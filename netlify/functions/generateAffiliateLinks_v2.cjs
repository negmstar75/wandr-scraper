// netlify/functions/generateAffiliateLinks_v2.cjs
// generateAffiliateLinks_v2.4 — fixes for wrong destinations, duplicates & routing
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
        // country code (e.g. "fr") + city slug (e.g. "paris")
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
function getQuery(event, name, fallback = undefined) {
  try {
    return (event.queryStringParameters && event.queryStringParameters[name]) || fallback;
  } catch (e) {
    return fallback;
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
function slugToCountry(slug) {
  if (!slug || typeof slug !== "string") return null;
  const parts = slug.split("/");
  return parts.length > 1 ? parts[0] : null;
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
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encodeURIComponent(targetUrl)}&campaign_id=${campaign_id}`;
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
    const cityQ = getQuery(event, "city");
    let origin = getQuery(event, "origin");
    const mode = getQuery(event, "mode", "all"); // all | activities | hotels | flights
    const itinerary_id = getQuery(event, "itinerary_id");
    debug = getQuery(event, "debug", "false") === "true";

    if (!slug || !name) {
      await logToSupabase("warn", "Missing required parameters", { slug, name });
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters: slug, name" }) };
    }

    // compute date vars
    const depart = todayISO(1); // tomorrow
    const ret = todayISO(8); // tomorrow +7
    const checkin = depart;
    const checkout = ret;

    // origin fallback
    if (!origin || String(origin).trim() === "") origin = "LAX";

    // country resolution
    let country = (countryQ && countryQ.trim()) || slugToCountry(slug) || "us";
    country = String(country).toLowerCase();
    const country_code = country.slice(0, 2);

    const city = cityQ || name;
    const city_slug = cityToSlug(city);
    const destination = name || city;

    await logToSupabase("info", "Start generation v2.4 (refined)", { slug, name, country, city, origin, mode, debug });

    const allPartnersData = [];
    const templateMisses = [];

    // Build partner candidates
    for (const [rawKey, pCfg] of Object.entries(AFFILIATE_CONFIG.partners)) {
      const baseKey = rawKey;
      const tpl = affiliateTemplates[baseKey];
      if (!tpl) {
        await logToSupabase("warn", "Missing template set", { partner: rawKey });
        continue;
      }

      for (const [variantKey, variantObj] of Object.entries(tpl.variants)) {
        // Mode filter
        if (mode === "activities") {
          // allow attraction/activity variants and known activity partners
          const allowActivity = variantKey.match(/(attract|activ|default|search|country|pocket|product|elsewhere)/i)
            || ["getyourguide","klook","tiqets","wegotrip","gocity","tripadvisor"].includes(baseKey);
          if (!allowActivity) continue;
        } else if (mode === "hotels") {
          if (!variantKey.match(/(stays|default)/i) && !["booking","expedia","hostelworld","rentalcars"].includes(baseKey)) continue;
        } else if (mode === "flights") {
          if (!variantKey.match(/(flight|flights)/i) && !["cheapoair","expedia"].includes(baseKey)) continue;
        }

        // Build template data priority:
        // - if variant needs 'slug' use city_slug
        // - if needs 'destination' use destination
        // - if needs 'country' use country
        const templateData = {
          slug: slug.split("/").pop(),
          city_slug,
          destination,
          city,
          country,
          country_code,
          origin,
          depart,
          return: ret,
          checkin,
          checkout,
          adults: variantObj.params && variantObj.params.includes("adults") ? 2 : 1,
          tripType: "ROUNDTRIP",
          itinerary_id,
        };

        // Lonely Planet product variants: create multiple shop attempts (pocket, product, fallback)
        if (baseKey === "lonelyplanet" && (variantKey === "product" || variantKey === "pocket")) {
          const shopVariants = [ `pocket-${city_slug}`, city_slug, `${city_slug}-travel-guide`, `${city_slug}-guide` ];
          for (const s of shopVariants) {
            const target = fillTemplate(variantObj.template, { slug: s });
            // LP shop links are direct (no tp.media wrapping)
            allPartnersData.push({
              partner_name: tpl.name,
              partner_code: safePartnerCode(baseKey, `${variantKey}_${s}`),
              deep_link: target,
              variant: `${variantKey}_${s}`,
              raw_target: target,
            });
          }
          continue;
        }

        // For partners that require city slugs (prefer citySlug), ensure we use it
        let targetUrl;
        try {
          // If the variant expects 'slug' and we have a city_slug, use that.
          // If variant expects 'country' (Elsewhere), ensure we pass country.
          targetUrl = fillTemplate(variantObj.template, templateData);
        } catch (e) {
          templateMisses.push(`${baseKey}:${variantKey}`);
          await logToSupabase("warn", "Template fill failure", { partner: baseKey, variantKey, err: e.message });
          continue;
        }

        // sanity check: avoid producing URLs containing 'undefined' or 'null'
        if (!targetUrl || /undefined|null/.test(targetUrl)) {
          templateMisses.push(`${baseKey}:${variantKey}`);
          await logToSupabase("warn", "Template produced invalid URL; using fallback search", { partner: baseKey, variantKey, templateData });
          targetUrl = `https://${baseKey}.com/search?query=${encodeURIComponent(destination || city_slug || country)}`;
        }

        // Use partner config safely
        const partnerConf = pCfg || {};

        // Wrap with tp.media if available and not LonelyPlanet
        const deep_link = (partnerConf.baseUrl && partnerConf.campaign_id && partnerConf.partner_id && baseKey !== "lonelyplanet")
          ? buildTpLink({
              baseUrl: partnerConf.baseUrl,
              marker: AFFILIATE_CONFIG.marker,
              trs: AFFILIATE_CONFIG.trs,
              partner_id: partnerConf.partner_id,
              campaign_id: partnerConf.campaign_id,
              targetUrl,
            })
          : targetUrl;

        allPartnersData.push({
          partner_name: tpl.name,
          partner_code: safePartnerCode(baseKey, variantKey),
          deep_link,
          raw_target: targetUrl,
          variant: variantKey,
        });
      } // end variant loop
    } // end partners loop

    await logToSupabase("info", "Built partner dataset", { total: allPartnersData.length, templateMisses });

    // -----------------------
    // Upsert affiliates and build affiliateId map
    // -----------------------
    const affiliateIdMap = {};
    for (const p of allPartnersData) {
      try {
        const code = p.partner_code;
        if (affiliateIdMap[code]) continue;
        const { data: existing, error: selErr } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", code).maybeSingle();
        if (selErr) {
          await logToSupabase("error", "Affiliate select error", { partner_code: code, error: selErr.message });
        }
        let affiliate_id = existing?.affiliate_id;
        if (!affiliate_id) {
          const { data: aff, error: upErr } = await supabase.from("affiliates").upsert(
            [{ partner_name: p.partner_name, partner_code: code, base_url: p.deep_link, active: true }],
            { onConflict: ["partner_code"] }
          ).select().single();
          if (upErr) {
            await logToSupabase("error", "Affiliate upsert error", { partner_code: code, error: upErr.message });
            const { data: ex2 } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", code).maybeSingle();
            affiliate_id = ex2?.affiliate_id;
          } else affiliate_id = aff?.affiliate_id;
        }
        if (!affiliate_id) {
          await logToSupabase("warn", "Could not resolve affiliate_id", { partner_code: code });
          continue;
        }
        affiliateIdMap[code] = affiliate_id;
      } catch (e) {
        await logToSupabase("error", "Affiliate map error", { error: e.message });
      }
    }

    // -----------------------
    // Build linksToInsert with dedupe (include variant to avoid ON CONFLICT second time)
    // -----------------------
    const seen = new Set();
    const linksToInsert = [];
    for (const p of allPartnersData) {
      const affiliate_id = affiliateIdMap[p.partner_code];
      if (!affiliate_id) {
        await logToSupabase("warn", "Skipping partner - no affiliate_id", { partner_code: p.partner_code });
        continue;
      }
      const key = `${slug}::${affiliate_id}::${p.variant}`;
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

    // -----------------------
    // Upsert partner_affiliate_links safely in small batches to avoid ON CONFLICT issues
    // -----------------------
    const batchSize = 50;
    for (let i = 0; i < linksToInsert.length; i += batchSize) {
      const batch = linksToInsert.slice(i, i + batchSize);
      const { error: uErr } = await supabase.from("partner_affiliate_links").upsert(batch, { onConflict: ["destination_slug", "affiliate_id", "variant"] });
      if (uErr) {
        await logToSupabase("error", "partner_affiliate_links upsert batch failed", { error: uErr.message, batchIndex: i / batchSize });
        throw uErr;
      }
    }
    await logToSupabase("info", "partner_affiliate_links upserted", { count: linksToInsert.length });

    // -----------------------
    // Specialized inserts (idempotent)
    // -----------------------
    const counts = { flights: 0, hotels: 0, activities: 0, guides: 0 };

    for (const link of linksToInsert) {
      try {
        const affiliate_id = link.affiliate_id;
        const deep_link = link.deep_link;
        const variant = (link.variant || "").toLowerCase();
        const baseCode = link.partner_code.split("_")[0];

        async function exists(table) {
          const { data, error } = await supabase.from(table).select("id").eq("affiliate_id", affiliate_id).eq("deep_link", deep_link).limit(1).maybeSingle();
          if (error) {
            await logToSupabase("warn", "exists check error", { table, error: error.message });
            return false;
          }
          return !!data;
        }

        // Flights: only flight partners/variants
        const isFlight = variant.includes("flight") || ["cheapoair","expedia"].includes(baseCode) && variant.includes("flights");
        if (isFlight) {
          if (!(await exists("flights"))) {
            const payload = {
              affiliate_id,
              destination_slug: slug,
              origin,
              airline: null,
              flight_code: null,
              deep_link,
              price: null,
              currency: null,
              metadata: { variant, generated_at: new Date().toISOString(), depart, return: ret, passengers: 1 },
            };
            const { error } = await supabase.from("flights").insert([payload]);
            if (error) await logToSupabase("warn", "Flights insert failed", { error: error.message, payload });
            else counts.flights++;
          }
          continue;
        }

        // Hotels: booking/expedia/hostelworld stays variants
        const isHotel = variant.includes("stays") || ["booking","expedia","hostelworld"].includes(baseCode);
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
            if (error) await logToSupabase("warn", "Hotels insert failed", { error: error.message, payload });
            else counts.hotels++;
          }
          continue;
        }

        // Guides: Lonely Planet variants map here
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
            if (error) await logToSupabase("warn", "Guides insert failed", { error: error.message, payload });
            else counts.guides++;
          }
          continue;
        }

        // Rentalcars -> treat as car_rental activity (since no separate car table)
        if (baseCode === "rentalcars") {
          if (!(await exists("activities"))) {
            const payload = {
              affiliate_id,
              destination_slug: slug,
              name: `${name} - Car rental`,
              category: "car_rental",
              deep_link,
              duration: null,
              price: null,
              currency: null,
              rating: null,
              metadata: { variant, generated_at: new Date().toISOString() },
            };
            const { error } = await supabase.from("activities").insert([payload]);
            if (error) await logToSupabase("warn", "Rentalcars insert failed", { error: error.message, payload });
            else counts.activities++;
          }
          continue;
        }

        // Activities (GetYourGuide, Klook, Tiqets, WeGoTrip, GoCity, TripAdvisor, Booking attractions, Expedia activities)
        const isActivity = variant.includes("activ") || variant.includes("attract") || ["getyourguide","klook","tiqets","wegotrip","gocity","tripadvisor","booking","expedia"].includes(baseCode);
        if (isActivity) {
          // Special case: booking's 'attractions' should go to activities (not hotels)
          if (!(await exists("activities"))) {
            const payload = {
              affiliate_id,
              destination_slug: slug,
              name,
              category: baseCode === "rentalcars" ? "car_rental" : "activity",
              deep_link,
              duration: null,
              price: null,
              currency: null,
              rating: null,
              metadata: { variant, generated_at: new Date().toISOString() },
            };
            const { error } = await supabase.from("activities").insert([payload]);
            if (error) await logToSupabase("warn", "Activities insert failed", { error: error.message, payload });
            else counts.activities++;
          }
          continue;
        }

        // Fallback into activities
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
          if (error) await logToSupabase("warn", "Activities fallback insert failed", { error: error.message, payload });
          else counts.activities++;
        }
      } catch (e) {
        await logToSupabase("error", "Specialized insert error", { error: e.message });
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
    await logToSupabase("error", "Fatal error during generateAffiliateLinks_v2", { error: err.message, stack: err.stack });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
