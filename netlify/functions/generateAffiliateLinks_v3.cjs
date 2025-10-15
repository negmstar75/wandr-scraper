// netlify/functions/generateAffiliateLinks_v3.cjs
// generateAffiliateLinks_v3.cjs
// Robust, idempotent affiliate generator with partner_mappings support and variant-aware upserts.

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
        template: "https://www.booking.com/attractions/searchresults/{country}/{city_slug}.html",
        params: ["country", "city_slug"],
      },
      cars: {
        template:
          "https://cars.booking.com/search-results?locationName={destination}&puDay={puDay}&puMonth={puMonth}&puYear={puYear}&driversAge={driversAge}",
        params: ["destination", "puDay", "puMonth", "puYear", "driversAge"],
      },
    },
  },
  expedia: {
    name: "Expedia",
    variants: {
      stays: {
        template:
          "https://www.expedia.com/Hotel-Search?destination={destination}&d1={checkin}&d2={checkout}&adults={adults}&rooms=1",
        params: ["destination", "checkin", "checkout", "adults"],
      },
      activities: {
        template:
          "https://www.expedia.com/things-to-do/search?location={destination}&startDate={checkin}&endDate={checkout}&sort=RECOMMENDED",
        params: ["destination", "checkin", "checkout"],
      },
      flights: {
        template:
          "https://www.expedia.com/Flights-Search?leg1=from:{origin},to:{destination},departure:{depart}TANYT&leg2=from:{destination},to:{origin},departure:{return}TANYT&mode=search&passengers=adults:{adults}",
        params: ["origin", "destination", "depart", "return", "adults"],
      },
      cars: {
        template:
          "https://www.expedia.com/carsearch?locn={destination}&d1={checkin}&d2={checkout}",
        params: ["destination", "checkin", "checkout"],
      },
    },
  },
  getyourguide: { name: "GetYourGuide", variants: { default: { template: "https://www.getyourguide.com/{slug}/", params: ["slug"] } } },
  tripadvisor: {
    name: "Tripadvisor",
    variants: {
      attractions: { template: "https://www.tripadvisor.com/Attractions-{slug}-Activities.html", params: ["slug"] },
      hotels: { template: "https://www.tripadvisor.com/Hotels-{slug}-Hotels.html", params: ["slug"] },
      restaurants: { template: "https://www.tripadvisor.com/Restaurants-{slug}.html", params: ["slug"] },
    },
  },
  tiqets: { name: "Tiqets", variants: { default: { template: "https://www.tiqets.com/en/things-to-do-in-{slug}-c66746/", params: ["slug"] } } },
  klook: { name: "Klook", variants: { default: { template: "https://www.klook.com/search/result/?query={destination}&sort=most_relevant", params: ["destination"] } } },
  rentalcars: { name: "Rentalcars", variants: { default: { template: "https://www.rentalcars.com/search-results?locationName={destination}", params: ["destination"] } } },
  cheapoair: { name: "CheapOair", variants: { default: { template: "https://www.cheapoair.com/air/listing?d1={origin}&d2={destination}&dt1={depart}&dt2={return}&tripType={tripType}", params: ["origin", "destination", "depart", "return", "tripType"] } } },
  hostelworld: { name: "Hostelworld", variants: { default: { template: "https://www.hostelworld.com/s?q={destination}&from={checkin}&to={checkout}&guests={adults}", params: ["destination", "checkin", "checkout", "adults"] } } },
  wegotrip: { name: "WeGoTrip", variants: { default: { template: "https://wegotrip.com/{slug}-d3/", params: ["slug"] }, search: { template: "https://wegotrip.com/search?query={destination}", params: ["destination"] } } },
  gocity: { name: "GoCity", variants: { default: { template: "https://gocity.com/en/{slug}/passes", params: ["slug"] }, country: { template: "https://gocity.com/en/{country}/", params: ["country"] } } },
  airalo: { name: "Airalo", variants: { esim: { template: "https://www.airalo.com/{country}-esim", params: ["country"] } } },
  lonelyplanet: {
    name: "Lonely Planet",
    variants: {
      product: { template: "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D", params: ["slug"] },
      pocket: { template: "https://shop.lonelyplanet.com/products/pocket-{slug}?sca_ref=5103006.jxkDNNdC6D", params: ["slug"] },
      elsewhere: { template: "https://www.elsewhere.io/{country}?sca_ref=5103006.jxkDNNdC6D", params: ["country"] },
      destination: { template: "https://www.lonelyplanet.com/destinations/{country}/{slug}?sca_ref=5103006.jxkDNNdC6D", params: ["country", "slug"] },
      article: { template: "https://www.lonelyplanet.com/articles/{slug}?sca_ref=5103006.jxkDNNdC6D", params: ["slug"] },
    },
  },
  generic: { name: "Generic", variants: { default: { template: "https://{partner_domain}/search?query={destination}", params: ["partner_domain", "destination"] } } },
};

// -----------------------------
// AFFILIATE CONFIG (TP wrapper info)
// -----------------------------
const AFFILIATE_CONFIG = {
  marker: "466615",
  trs: "252990",
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
    wayaway: { name: "WayAway", baseUrl: "https://tp.media/r", campaign_id: "200", partner_id: "5976" },
    aviasales: { name: "Aviasales", baseUrl: "https://tp.media/r", campaign_id: "100", partner_id: "4114" },
  },
};

// -----------------------------
// Helpers
// -----------------------------
function getQuery(event, name, fallback = undefined) {
  try { return (event.queryStringParameters && event.queryStringParameters[name]) || fallback; } catch (e) { return fallback; }
}
function todayISO(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().split("T")[0];
}
function cityToSlug(s) {
  if (!s) return "";
  return String(s).toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}
function normalizeKey(key) {
  return String(key || "").toLowerCase().replace(/[\s\.\-]+/g, "").replace(/_+/g, "_");
}
function safePartnerCode(baseKey, variantKey) {
  if (!variantKey || variantKey === "default") return baseKey;
  return `${baseKey}_${variantKey}`.replace(/[^a-z0-9_]/g, "_");
}
function fillTemplate(template, data) {
  if (!template) return "";
  return template.replace(/\{(.*?)\}/g, (_, key) => encodeURIComponent(data[key] ?? ""));
}
function buildTpLink({ baseUrl, marker, trs, partner_id, campaign_id, targetUrl }) {
  if (!baseUrl) return targetUrl || "";
  if (!targetUrl) return baseUrl;
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encodeURIComponent(targetUrl)}&campaign_id=${campaign_id}`;
}
function decodeTpTarget(tpWrappedUrl) {
  try {
    const u = new URL(tpWrappedUrl);
    const params = new URLSearchParams(u.search);
    const enc = params.get("u");
    if (!enc) return null;
    return decodeURIComponent(enc);
  } catch (e) { return null; }
}
function datePartsISO(isoDate) {
  try {
    const [y, m, d] = isoDate.split("-");
    return { year: y, month: m, day: d };
  } catch (e) { return { year: null, month: null, day: null }; }
}

const CLASSIFICATION_MAP = {
  flights: ["cheapoair", "aviasales", "wayaway", "expedia"],
  hotels: ["booking", "expedia", "hostelworld"],
  activities: ["getyourguide", "klook", "tiqets", "wegotrip", "gocity", "tripadvisor", "eatwith", "ticketnetwork", "wegotrip"],
  guides: ["lonelyplanet"],
};

function classify(baseKey, variant) {
  variant = String(variant || "").toLowerCase();
  const b = String(baseKey || "").toLowerCase();
  if (CLASSIFICATION_MAP.flights.includes(b) || variant.includes("flight")) return "flights";
  if (CLASSIFICATION_MAP.hotels.includes(b) || variant.includes("stay") || variant.includes("stays") || variant.includes("hotel")) return "hotels";
  if (CLASSIFICATION_MAP.guides.includes(b) || variant.includes("product") || variant.includes("pocket") || variant.includes("article") || variant.includes("elsewhere")) return "guides";
  if (CLASSIFICATION_MAP.activities.includes(b) || variant.includes("activity") || variant.includes("attract") || variant.includes("pass") || variant.includes("things")) return "activities";
  return "activities";
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

    // compute dates
    const depart = todayISO(1); // tomorrow
    const ret = todayISO(8); // +7
    const checkin = depart;
    const checkout = ret;

    if (!origin || String(origin).trim() === "") origin = "LAX";

    // country / city
    let country = (countryQ && countryQ.trim()) || slug.split("/")[0] || "us";
    country = String(country).toLowerCase();
    const country_code = country.slice(0, 2);
    const city = cityQ || name;
    const city_slug = cityToSlug(city);
    const destination = name || city;

    await logToSupabase("info", "Start affiliate generation v3", { slug, name, country, city, origin, mode });

    // load partner_mappings for this destination (safe if table or columns missing)
    let mappings = {};
    try {
      const { data: mapRows, error: mapErr } = await supabase.from("partner_mappings").select("*").eq("destination_slug", slug);
      if (mapErr) {
        await logToSupabase("warn", "partner_mappings select returned error (will fallback)", { error: mapErr.message });
      } else if (Array.isArray(mapRows)) {
        for (const r of mapRows) {
          const code = String(r.partner_code || "").toLowerCase();
          mappings[code] = r;
        }
      }
    } catch (e) {
      await logToSupabase("warn", "partner_mappings query exception (will fallback)", { error: e.message });
    }

    // Build partner dataset
    const allPartnersData = [];
    const templateMisses = [];

    for (const [rawKey, pCfg] of Object.entries(AFFILIATE_CONFIG.partners)) {
      const baseKey = normalizeKey(rawKey);
      const tpl = affiliateTemplates[baseKey] || affiliateTemplates.generic;
      const mapping = mappings[baseKey] || {};
      const variants = tpl.variants ? Object.entries(tpl.variants) : [["default", { template: tpl.template || "", params: [] }]];

      for (const [variantKey, variantObj] of variants) {
        // mode filters
        if (mode === "activities") {
          if (!/(activ|attract|default|search|country|pocket|product|elsewhere)/i.test(variantKey) &&
              !["getyourguide","klook","tiqets","wegotrip","gocity","tripadvisor"].includes(baseKey)) continue;
        } else if (mode === "hotels") {
          if (!/(stays|default)/i.test(variantKey) && !["booking","expedia","hostelworld","rentalcars"].includes(baseKey)) continue;
        } else if (mode === "flights") {
          if (!/(flight|flights)/i.test(variantKey) && !["cheapoair","expedia","aviasales","wayaway"].includes(baseKey)) continue;
        }

        // template data
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

        // partner-specific adjustments
        if (baseKey === "airalo") { templateData.country = country || destination; templateData.destination = templateData.country; }
        if (baseKey === "rentalcars") {
          templateData.destination = destination;
          const pu = datePartsISO(depart); templateData.puDay = pu.day; templateData.puMonth = pu.month; templateData.puYear = pu.year;
          const doP = datePartsISO(ret); templateData.doDay = doP.day; templateData.doMonth = doP.month; templateData.doYear = doP.year;
          templateData.driversAge = 30;
        }
        if (baseKey === "booking" && variantKey === "cars") {
          const pu = datePartsISO(depart); templateData.puDay = pu.day; templateData.puMonth = pu.month; templateData.puYear = pu.year; templateData.driversAge = 30;
        }

        // override_url if provided in partner_mappings
        let raw_target = null;
        let is_fallback = false;
        if (mapping && mapping.override_url) {
          raw_target = mapping.override_url;
        } else {
          try {
            raw_target = fillTemplate(variantObj.template, templateData);
          } catch (e) {
            templateMisses.push(`${baseKey}:${variantKey}`);
            await logToSupabase("warn", "Template fill failure", { partner: baseKey, variantKey, err: e.message });
            raw_target = "";
          }
        }

        if (!raw_target || /undefined|null/.test(raw_target)) {
          templateMisses.push(`${baseKey}:${variantKey}`);
          await logToSupabase("warn", "Template produced invalid URL; using fallback", { partner: baseKey, variantKey, templateData });
          if (mapping && mapping.override_slug) {
            raw_target = mapping.override_url || `https://${baseKey}.com/search?query=${encodeURIComponent(mapping.override_slug || destination)}`;
          } else {
            raw_target = `https://${baseKey}.com/search?query=${encodeURIComponent(destination || city_slug || country)}`;
          }
          is_fallback = true;
        }

        const partnerConf = pCfg || {};
        let deep_link;
        if (partnerConf.baseUrl && partnerConf.partner_id && partnerConf.campaign_id && partnerConf.baseUrl.includes("tp.media") && baseKey !== "lonelyplanet") {
          deep_link = buildTpLink({
            baseUrl: partnerConf.baseUrl,
            marker: AFFILIATE_CONFIG.marker,
            trs: AFFILIATE_CONFIG.trs,
            partner_id: partnerConf.partner_id,
            campaign_id: partnerConf.campaign_id,
            targetUrl: raw_target,
          });
        } else {
          deep_link = raw_target;
        }

        let base_url = mapping && mapping.base_url ? mapping.base_url : (partnerConf && partnerConf.baseUrl ? (partnerConf.baseUrl.includes("tp.media") ? decodeTpTarget(partnerConf.baseUrl) || partnerConf.baseUrl : partnerConf.baseUrl) : null);

        allPartnersData.push({
          baseKey,
          partner_name: (tpl && tpl.name) || partnerConf.name || baseKey,
          partner_code: safePartnerCode(baseKey, variantKey),
          variant: variantKey,
          deep_link,
          raw_target,
          base_url,
          is_fallback,
          template_used: true,
        });
      } // end variant loop
    } // end partners loop

    await logToSupabase("info", "Built partner dataset", { total: allPartnersData.length, templateMisses });

    // -----------------------
    // Resolve affiliates
    // -----------------------
    const affiliateIdMap = {}; // baseKey -> affiliate_id
    for (const p of allPartnersData) {
      const baseKey = p.baseKey;
      if (affiliateIdMap[baseKey]) continue;
      try {
        const { data: existing, error: selErr } = await supabase.from("affiliates").select("affiliate_id,partner_code,base_url").eq("partner_code", baseKey).maybeSingle();
        if (selErr) {
          await logToSupabase("error", "Affiliate select error", { partner_code: baseKey, error: selErr.message });
        }
        let affiliate_id = existing?.affiliate_id;
        if (!affiliate_id) {
          const upRow = { partner_name: p.partner_name, partner_code: baseKey, logo_url: p.logo_url || null, base_url: p.base_url || p.raw_target || null, active: true };
          const { data: aff, error: upErr } = await supabase.from("affiliates").upsert([upRow], { onConflict: ["partner_code"] }).select("affiliate_id,partner_code").single();
          if (upErr) {
            await logToSupabase("error", "Affiliate upsert error", { partner_code: baseKey, error: upErr.message });
            const { data: ex2 } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", baseKey).maybeSingle();
            affiliate_id = ex2?.affiliate_id;
          } else affiliate_id = aff?.affiliate_id;
        }
        if (!affiliate_id) {
          await logToSupabase("warn", "Unable to resolve affiliate_id for partner", { baseKey });
          continue;
        }
        affiliateIdMap[baseKey] = affiliate_id;
      } catch (e) {
        await logToSupabase("error", "Affiliate map exception", { error: e.message, baseKey: p.baseKey });
      }
    }

    // -----------------------
    // Build candidate links and dedupe against DB existing rows
    // -----------------------
    const candidateLinks = [];
    const affiliateIdsSet = new Set();
    for (const p of allPartnersData) {
      const affiliate_id = affiliateIdMap[p.baseKey];
      if (!affiliate_id) {
        await logToSupabase("warn", "Skipping partner - no affiliate_id", { partner_code: p.partner_code });
        continue;
      }
      candidateLinks.push({
        destination_slug: slug,
        affiliate_id,
        partner_code: p.partner_code,
        base_url: p.base_url || null,
        deep_link: p.deep_link || p.raw_target || p.base_url || null,
        raw_target: p.raw_target || null,
        is_fallback: !!p.is_fallback,
        metadata: { template_used: p.template_used, variant: p.variant, generated_at: new Date().toISOString() },
        variant: p.variant || "default",
      });
      affiliateIdsSet.add(affiliate_id);
    }

    const affiliateIdsArray = Array.from(affiliateIdsSet);
    const existingKeySet = new Set();

    if (affiliateIdsArray.length > 0) {
      try {
        // We query existing rows for this destination and affiliate ids to avoid duplicates.
        const { data: existingRows, error: existingErr } = await supabase
          .from("partner_affiliate_links")
          .select("destination_slug,affiliate_id,variant")
          .eq("destination_slug", slug)
          .in("affiliate_id", affiliateIdsArray);

        if (existingErr) {
          await logToSupabase("warn", "partner_affiliate_links select existing failed (will dedupe in-memory only)", { error: existingErr.message });
        } else if (Array.isArray(existingRows)) {
          for (const r of existingRows) {
            existingKeySet.add(`${r.destination_slug}::${r.affiliate_id}::${(r.variant || "default")}`);
          }
        }
      } catch (e) {
        await logToSupabase("warn", "Exception reading existing partner_affiliate_links (will dedupe in-memory)", { error: e.message });
      }
    }

    // in-memory dedupe + filter existing
    const seenKeys = new Set();
    const linksToInsert = [];
    for (const c of candidateLinks) {
      const keyWithVariant = `${c.destination_slug}::${c.affiliate_id}::${c.variant || "default"}`;
      if (existingKeySet.has(keyWithVariant)) continue;
      if (seenKeys.has(keyWithVariant)) continue;
      seenKeys.add(keyWithVariant);
      linksToInsert.push(c);
    }

    if (linksToInsert.length === 0) {
      await logToSupabase("info", "No new links to upsert (all exist already)", { slug, candidates: candidateLinks.length });
      return {
        statusCode: 200,
        body: JSON.stringify({
          status: "ok",
          message: `No new affiliate links prepared for ${name}`,
          partners_prepared: allPartnersData.length,
          partners_upserted: 0,
          debug: debug ? { allPartnersData, templateMisses, candidateLinksLength: candidateLinks.length, existingKeyCount: existingKeySet.size } : undefined,
        }),
      };
    }

    // -----------------------
    // Upsert partner_affiliate_links in batches with onConflict including variant
    // -----------------------
    const batchSize = 50;
    for (let i = 0; i < linksToInsert.length; i += batchSize) {
      const batch = linksToInsert.slice(i, i + batchSize);
      const { error: upErr } = await supabase
        .from("partner_affiliate_links")
        .upsert(batch, { onConflict: ["destination_slug", "affiliate_id", "variant"] });

      if (upErr) {
        await logToSupabase("error", "partner_affiliate_links upsert batch failed", { error: upErr.message, batchIndex: i / batchSize, sample: batch.slice(0, 5) });
        throw upErr;
      }
    }
    await logToSupabase("info", "partner_affiliate_links upserted", { count: linksToInsert.length });

    // -----------------------
    // Specialized table inserts (idempotent)
    // -----------------------
    const counts = { flights: 0, hotels: 0, activities: 0, guides: 0 };

    async function existsInTable(table, affiliate_id, deep_link) {
      const { data, error } = await supabase.from(table).select("id").eq("affiliate_id", affiliate_id).eq("deep_link", deep_link).limit(1).maybeSingle();
      if (error) {
        await logToSupabase("warn", "Exists check error", { table, error: error.message });
        return false;
      }
      return !!data;
    }

    for (const link of linksToInsert) {
      try {
        const baseCode = (link.partner_code || "").split("_")[0];
        const variant = (link.variant || "").toLowerCase();
        const classification = classify(baseCode, variant);

        if (classification === "flights") {
          if (!(await existsInTable("flights", link.affiliate_id, link.deep_link))) {
            const payload = {
              affiliate_id: link.affiliate_id,
              destination_slug: slug,
              origin,
              airline: null,
              flight_code: null,
              deep_link: link.deep_link,
              price: null,
              currency: null,
              metadata: Object.assign({}, link.metadata, { variant }),
            };
            const { error } = await supabase.from("flights").insert([payload]);
            if (error) await logToSupabase("warn", "Flights insert failed (non-blocking)", { error: error.message, payload });
            else counts.flights++;
          }
          continue;
        }

        if (classification === "hotels") {
          if (!(await existsInTable("hotels", link.affiliate_id, link.deep_link))) {
            const payload = {
              affiliate_id: link.affiliate_id,
              destination_slug: slug,
              name: null,
              stars: null,
              address: null,
              deep_link: link.deep_link,
              price: null,
              currency: null,
              metadata: Object.assign({}, link.metadata, { variant, checkin, checkout }),
            };
            const { error } = await supabase.from("hotels").insert([payload]);
            if (error) await logToSupabase("warn", "Hotels insert failed (non-blocking)", { error: error.message, payload });
            else counts.hotels++;
          }
          continue;
        }

        if (classification === "guides") {
          if (!(await existsInTable("guides", link.affiliate_id, link.deep_link))) {
            const payload = {
              affiliate_id: link.affiliate_id,
              title: name,
              slug: slug.split("/").pop(),
              category: variant || "guide",
              deep_link: link.deep_link,
              language: "en",
              metadata: Object.assign({}, link.metadata, { variant }),
            };
            const { error } = await supabase.from("guides").insert([payload]);
            if (error) await logToSupabase("warn", "Guides insert failed (non-blocking)", { error: error.message, payload });
            else counts.guides++;
          }
          continue;
        }

        // Activities fallback
        if (!(await existsInTable("activities", link.affiliate_id, link.deep_link))) {
          const payload = {
            affiliate_id: link.affiliate_id,
            destination_slug: slug,
            name: name || null,
            category: "activity",
            deep_link: link.deep_link,
            duration: null,
            price: null,
            currency: null,
            rating: null,
            metadata: Object.assign({}, link.metadata, { variant }),
          };
          const { error } = await supabase.from("activities").insert([payload]);
          if (error) await logToSupabase("warn", "Activities insert failed (non-blocking)", { error: error.message, payload });
          else counts.activities++;
        }
      } catch (e) {
        await logToSupabase("error", "Specialized insert error", { error: e.message, link });
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
        debug: debug ? { allPartnersData, templateMisses, candidateLinksSample: candidateLinks.slice(0, 10), linksToInsertSample: linksToInsert.slice(0, 10) } : undefined,
      }),
    };
  } catch (err) {
    await logToSupabase("error", "Fatal error during generateAffiliateLinks_v3", { error: err.message, stack: err.stack });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
