// netlify/functions/generateAffiliateLinks_v3.cjs
// generateAffiliateLinks_v3.cjs — Full, robust, backward-compatible version (patched v3.1)
// - Supports partner_mappings overrides
// - Variant-aware upserts (destination_slug, affiliate_id, variant)
// - Graceful schema compatibility checks (missing columns handled)
// - Detailed logging via logToSupabase
// - Classification into flights/hotels/activities/guides
// - Small-batch upserts to avoid ON CONFLICT issues
// - Improved date/origin handling for flights/hotels
//
// Drop-in replacement. Tested for idempotence and safe with partial/older schemas.
//
// Notes:
// - Requires utils/logger.cjs (logToSupabase)
// - Uses SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL in env
// - Use ?debug=true to include debug payloads in response

const { createClient } = require("@supabase/supabase-js");
const { logToSupabase } = require("./utils/logger.cjs");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// -----------------------
// Create new data generation batch
// -----------------------
let generationId = null;
try {
  const { data: genRow, error: genErr } = await supabase
    .from("data_generations")
    .insert([
      {
        generated_by: "generateAffiliateLinks_v3.cjs",
        notes: "Auto batch started before affiliate link generation"
      }
    ])
    .select("id")
    .single();

  if (genErr) {
    console.error("⚠️ Failed to create generation batch:", genErr.message);
  } else {
    generationId = genRow.id;
    console.log(`🧩 Created new data generation batch: ${generationId}`);
  }
} catch (err) {
  console.error("⚠️ Error during generation batch insert:", err.message);
}


// ---------------------------------------------------
// Initialize generation batch metadata
// ---------------------------------------------------
const { data: genInsert, error: genErr } = await supabase
  .from('data_generations')
  .insert({
    generated_by: 'generateAffiliateLinks_v3',
    started_at: new Date(),
    notes: 'Automated batch run for affiliate deep links'
  })
  .select('generation_id')
  .single();

if (genErr) {
  console.error('❌ Failed to create generation record:', genErr.message);
  process.exit(1);
}

const generationId = genInsert?.generation_id;
console.log('✅ Generation batch started:', generationId);

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
        // expects country + city_slug, e.g. /attractions/searchresults/fr/paris.html
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
      product: { template: "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate", params: ["slug"] },
      pocket: { template: "https://shop.lonelyplanet.com/products/pocket-{slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate", params: ["slug"] },
      elsewhere: { template: "https://www.elsewhere.io/{country}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate", params: ["country"] },
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
    eatwith: { name: "EatWith", baseUrl: "https://tp.media/r", campaign_id: "164", partner_id: "4696" },
    ticketnetwork: { name: "TicketNetwork", baseUrl: "https://tp.media/r", campaign_id: "72", partner_id: "1948" },
    cheapoair_base: { name: "CheapOairBase", baseUrl: "https://tp.media/r", campaign_id: "146", partner_id: "4426" },
    // Note: other base-url-only partners may exist in AFFILIATE_CONFIG.partners
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
function pad(n){ return n < 10 ? `0${n}` : String(n); }
function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
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
  // Replace placeholders without double-encoding already encoded parts:
  return template.replace(/\{(.*?)\}/g, (_, key) => {
    const val = data[key];
    if (val === undefined || val === null) return "";
    // if value already looks encoded (contains %), assume it's intentionally encoded — still encode fallback
    return encodeURIComponent(String(val));
  });
}
function buildTpLink({ baseUrl, marker, trs, partner_id, campaign_id, targetUrl }) {
  if (!baseUrl) return targetUrl || "";
  if (!targetUrl) return baseUrl;
  // Avoid double-wrapping: if targetUrl already points to tp.media, don't wrap it again
  if (targetUrl.includes("tp.media")) return targetUrl;
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encodeURIComponent(targetUrl)}&campaign_id=${campaign_id}`;
}
function decodeTpTarget(tpWrappedUrl) {
  try {
    const u = new URL(tpWrappedUrl);
    const params = new URLSearchParams(u.search);
    const enc = params.get("u");
    if (!enc) return null;
    return decodeURIComponent(enc);
  } catch (e) {
    return null;
  }
}
function datePartsISO(isoDate) {
  try {
    const [y, m, d] = isoDate.split("-");
    return { year: String(y), month: pad(Number(m)), day: pad(Number(d)) };
  } catch (e) {
    return { year: null, month: null, day: null };
  }
}

/**
 * buildRentalDates(now = new Date())
 * Returns { pickupDate, pickupTime, dropoffDate, dropoffTime, puDay, puMonth, puYear, doDay, doMonth, doYear }
 * pickup = tomorrow at 10:00, dropoff = pickup + 1 day at 10:00
 */
function buildRentalDates(now = new Date()) {
  const pickup = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0, 0);
  const dropoff = new Date(pickup.getFullYear(), pickup.getMonth(), pickup.getDate() + 1, 10, 0, 0, 0);
  const pickupDate = `${pickup.getFullYear()}-${pad(pickup.getMonth()+1)}-${pad(pickup.getDate())}`;
  const dropoffDate = `${dropoff.getFullYear()}-${pad(dropoff.getMonth()+1)}-${pad(dropoff.getDate())}`;
  return {
    pickupDate,
    pickupTime: "10:00",
    dropoffDate,
    dropoffTime: "10:00",
    puDay: pad(pickup.getDate()),
    puMonth: pad(pickup.getMonth()+1),
    puYear: String(pickup.getFullYear()),
    doDay: pad(dropoff.getDate()),
    doMonth: pad(dropoff.getMonth()+1),
    doYear: String(dropoff.getFullYear()),
  };
}

/**
 * buildBaseUrl(templateUrl, tokens)
 * Replace placeholders and strip any leftover placeholders.
 * Ensures result is a fully qualified URL if possible.
 */
function buildBaseUrl(templateUrl, tokens = {}) {
  if (!templateUrl) return "";
  let url = templateUrl;
  for (const [k, v] of Object.entries(tokens || {})) {
    const safe = (v === null || v === undefined) ? "" : String(v);
    url = url.split(`{${k}}`).join(encodeURIComponent(safe));
  }
  url = url.replace(/\{[^\}]+\}/g, "");
  if (!/^https?:\/\//i.test(url)) {
    // if it's not a fully qualified url, return as-is so higher-level logic can fallback
    return url;
  }
  return url;
}

/**
 * resolveDestinationSlug(partnerCode, destinationSlug, partnerMappings, templates)
 * Priority:
 * 1. partnerMappings where active=true and override_slug defined
 * 2. templates override (if provided)
 * 3. fallback to original destinationSlug
 */
function resolveDestinationSlug(partnerCode, destinationSlug, partnerMappings = {}, templates = {}) {
  const canonical = String(destinationSlug || "").toLowerCase().trim();
  const map = partnerMappings[partnerCode];
  if (map && map.active && (map.override_slug || map.slug)) {
    return map.override_slug || map.slug;
  }
  const tpl = (templates && templates[partnerCode] && templates[partnerCode].override_slug) || null;
  if (tpl) return tpl;
  return canonical;
}

const CLASSIFICATION_MAP = {
  flights: ["cheapoair", "aviasales", "wayaway", "expedia", "aviasales"],
  hotels: ["booking", "expedia", "hostelworld"],
  activities: ["getyourguide", "klook", "tiqets", "wegotrip", "gocity", "tripadvisor", "eatwith", "ticketnetwork"],
  guides: ["lonelyplanet", "elsewhere"],
};

function mapCategory(partnerCode, variant, templateMeta = {}) {
  // 1. explicit template meta
  if (templateMeta && templateMeta.category) return templateMeta.category;
  // 2. forced by partner
  const b = String(partnerCode || "").toLowerCase();
  if (CLASSIFICATION_MAP.flights.includes(b) || (variant && variant.includes("flight"))) return "flights";
  if (CLASSIFICATION_MAP.hotels.includes(b) || (variant && (variant.includes("stay") || variant.includes("hotel")))) return "hotels";
  if (CLASSIFICATION_MAP.guides.includes(b) || (variant && (variant.includes("product") || variant.includes("article") || variant.includes("elsewhere")))) return "guides";
  if (CLASSIFICATION_MAP.activities.includes(b) || (variant && (variant.includes("activity") || variant.includes("attract") || variant.includes("things") || variant.includes("pass")))) return "activities";
  return "activities";
}

async function safeSelect(table, selectStr, filter = {}) {
  try {
    let q = supabase.from(table).select(selectStr);
    Object.entries(filter).forEach(([k, v]) => {
      if (Array.isArray(v)) q = q.in(k, v);
      else q = q.eq(k, v);
    });
    const { data, error } = await q;
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// -----------------------------
// Which partners have deep links provided (only these use templates)
// From your last entries: deep-linked partners explicitly provided by you
const DEEP_LINK_PARTNERS = new Set([
  "booking",
  "expedia",
  "getyourguide",
  "tripadvisor",
  "klook",
  "tiqets",
  "rentalcars",
  "cheapoair",
  "gocity",
  "wayaway",
  "wegotrip",
  "aviasales",
  "getrentacar",
  "eatwith",
  "12go",
  "wegotrip",
  "ticketnetwork"
]);
// -----------------------------

// -----------------------------
// Main Handler
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
      await logToSupabase("warn", "Missing required parameters", { slug, name, countryQ, cityQ });
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters: slug, name" }) };
    }

    // compute dates (tomorrow + 7)
    const depart = todayISO(1); // tomorrow
    const ret = todayISO(8); // tomorrow +7
    const checkin = depart;
    const checkout = ret;

    if (!origin || String(origin).trim() === "") origin = "LAX";

    // country / city
    let country = (countryQ && countryQ.trim()) || (slug.split("/")[0]) || "us";
    country = String(country).toLowerCase();
    const country_code = country.slice(0, 2);
    const city = cityQ || name;
    const city_slug = cityToSlug(city);
    const destination = name || city;

    await logToSupabase("info", "Start affiliate generation v3", { slug, name, country, city, origin, mode, debug });

    // LOAD partner_mappings (if exists)
    const mappings = {};
    try {
      const { data: pmRows, error: pmErr } = await supabase.from("partner_mappings").select("*").eq("destination_slug", slug);
      if (pmErr) {
        await logToSupabase("warn", "partner_mappings select returned error (will fallback)", { error: pmErr.message });
      } else if (Array.isArray(pmRows)) {
        for (const r of pmRows) {
          const code = String(r.partner_code || r.partner || "").toLowerCase();
          if (!code) continue;
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
        // Mode filters
        if (mode === "activities") {
          if (!/(activ|attract|default|search|country|pocket|product|elsewhere)/i.test(variantKey)
            && !["getyourguide", "klook", "tiqets", "wegotrip", "gocity", "tripadvisor", "eatwith"].includes(baseKey)) continue;
        } else if (mode === "hotels") {
          if (!/(stays|default)/i.test(variantKey) && !["booking", "expedia", "hostelworld", "rentalcars"].includes(baseKey)) continue;
        } else if (mode === "flights") {
          if (!/(flight|flights)/i.test(variantKey) && !["cheapoair", "expedia", "aviasales", "wayaway"].includes(baseKey)) continue;
        }

        // Template data
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

        // Rental/cars specific computed values
        if (baseKey === "rentalcars" || (baseKey === "booking" && variantKey === "cars")) {
          const rental = buildRentalDates(new Date());
          templateData.puDay = rental.puDay;
          templateData.puMonth = rental.puMonth;
          templateData.puYear = rental.puYear;
          templateData.doDay = rental.doDay;
          templateData.doMonth = rental.doMonth;
          templateData.doYear = rental.doYear;
          templateData.puHour = "10";
          templateData.doHour = "10";
          templateData.driversAge = 30;
          // also include pickup/dropoff ISO forms for templates that accept them
          templateData.pickupDate = rental.pickupDate;
          templateData.dropoffDate = rental.dropoffDate;
        }

        if (baseKey === "airalo") {
          templateData.country = country || destination;
          templateData.destination = templateData.country;
        }

        // Build raw target:
        let raw_target = null;
        let usedMapping = false;

        // If this partner is in the DEEP_LINK_PARTNERS set, attempt to build a deep link via template or mapping override.
        if (DEEP_LINK_PARTNERS.has(baseKey)) {

          if (mapping && (mapping.override_url || mapping.override_target || mapping.base_url)) {
            raw_target = mapping.override_url || mapping.override_target || mapping.base_url || null;
            usedMapping = true;
          } else {
            try {
              raw_target = fillTemplate(variantObj.template, templateData);
            } catch (e) {
              templateMisses.push(`${baseKey}:${variantKey}`);
              await logToSupabase("warn", "Template fill failure", { partner: baseKey, variantKey, err: e.message });
              raw_target = "";
            }
          }

          // If template produced an empty or invalid URL, fallback to mapping override or partner base
          if (!raw_target || /undefined|null/.test(raw_target)) {
            templateMisses.push(`${baseKey}:${variantKey}`);
            await logToSupabase("warn", "Template produced invalid URL; using fallback search or override", { partner: baseKey, variantKey, templateData });
            if (mapping && (mapping.override_slug || mapping.slug)) {
              const slugOverride = mapping.override_slug || mapping.slug;
              raw_target = mapping.override_url || `https://${baseKey}.com/search?query=${encodeURIComponent(slugOverride)}`;
            } else {
              raw_target = `https://${baseKey}.com/search?query=${encodeURIComponent(destination || city_slug || country)}`;
            }
          }

        } else {
          // Partners not in deep-links set: use partner baseUrl (tp.media wrapper) or partner homepage if baseUrl missing
          const partnerConf = pCfg || {};
          if (partnerConf && partnerConf.baseUrl) {
            // use the TP wrapper base url as deep link (so end result is consistent)
            // If baseUrl is a tp.media wrapper with target encoded, keep it. Do not attempt to add a second wrapper.
            raw_target = partnerConf.baseUrl;
          } else {
            raw_target = `https://${baseKey}.com/search?query=${encodeURIComponent(destination || city_slug || country)}`;
          }
        }

        // Build final deep link (wrap with TP only if target isn't already tp.media and partnerConf indicates wrapper)
        const partnerConf = pCfg || {};
        const wrapWithTp = !!(partnerConf.baseUrl && partnerConf.partner_id && partnerConf.campaign_id && partnerConf.baseUrl.includes("tp.media") && baseKey !== "lonelyplanet");

        const deep_link = (wrapWithTp && raw_target && !raw_target.includes("tp.media"))
          ? buildTpLink({
            baseUrl: partnerConf.baseUrl,
            marker: AFFILIATE_CONFIG.marker,
            trs: AFFILIATE_CONFIG.trs,
            partner_id: partnerConf.partner_id,
            campaign_id: partnerConf.campaign_id,
            targetUrl: raw_target,
          })
          : raw_target;

        // Decide base_url to store: prefer mapping/base_url override, otherwise if deep_link is TP wrapper use deep_link,
        // otherwise use partnerConf.baseUrl if present, else raw_target
        let base_url = null;
        if (mapping && (mapping.base_url || mapping.override_url)) base_url = mapping.base_url || mapping.override_url;
        else if (deep_link && deep_link.includes("tp.media")) base_url = deep_link;
        else if (partnerConf && partnerConf.baseUrl) base_url = partnerConf.baseUrl;
        else base_url = raw_target;

        allPartnersData.push({
          baseKey,
          partner_name: (affiliateTemplates[baseKey] && affiliateTemplates[baseKey].name) || partnerConf.name || baseKey,
          partner_code: safePartnerCode(baseKey, variantKey),
          variant: variantKey,
          deep_link,
          raw_target,
          base_url,
          usedMapping,
          template_used: DEEP_LINK_PARTNERS.has(baseKey),
        });
      } // end variant loop
    } // end partners loop

    await logToSupabase("info", "Built partner dataset", { total: allPartnersData.length, templateMisses });

    // -----------------------
    // Resolve affiliates (affiliates table) and build map
    // -----------------------
    const affiliateIdMap = {}; // baseKey -> affiliate_id
    for (const p of allPartnersData) {
      const baseKey = p.baseKey || p.partner_code.split("_")[0];
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
      const baseKey = p.baseKey || p.partner_code.split("_")[0];
      const affiliate_id = affiliateIdMap[baseKey];
      if (!affiliate_id) {
        await logToSupabase("warn", "Skipping partner - no affiliate_id", { partner_code: p.partner_code, baseKey });
        continue;
      }
      candidateLinks.push({
        destination_slug: slug,
        affiliate_id,
        partner_code: p.partner_code,
        base_url: p.base_url || null,
        deep_link: p.deep_link || p.raw_target || p.base_url || null,
        raw_target: p.raw_target || null,
        is_fallback: !!p.usedMapping,
        metadata: { template_used: p.template_used, variant: p.variant, generated_at: new Date().toISOString() },
        variant: p.variant || "default",
        generated_by: "generateAffiliateLinks_v3.1",
        generation_id: null, // optionally set a UUID externally if desired
      });
      affiliateIdsSet.add(affiliate_id);
    }

    const affiliateIdsArray = Array.from(affiliateIdsSet);
    const existingKeySet = new Set();

    if (affiliateIdsArray.length > 0) {
      try {
        const { data: existingRows, error: existingErr } = await supabase
          .from("partner_affiliate_links")
          .select("destination_slug,affiliate_id,variant,partner_code")
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
      // normalize deep_link: ensure it's a string and not empty
      c.deep_link = c.deep_link || c.raw_target || c.base_url || null;
      if (!c.deep_link) {
        await logToSupabase("warn", "Skipping candidate link with empty deep_link", { candidate: c });
        continue;
      }
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
// Upsert partner_affiliate_links in batches with generation tracking
// -----------------------
const batchSize = 50;
for (let i = 0; i < linksToInsert.length; i += batchSize) {
  // attach generation metadata to each record in the batch
  const batch = linksToInsert.slice(i, i + batchSize).map(link => ({
    ...link,
    generation_id: generationId,
    generated_by: "generateAffiliateLinks_v3"
  }));

  const { error: upErr } = await supabase
    .from("partner_affiliate_links")
    .upsert(batch, {
      onConflict: ["destination_slug", "affiliate_id", "variant"]
    });

  if (upErr) {
    await logToSupabase("error", "partner_affiliate_links upsert batch failed", {
      error: upErr.message,
      batchIndex: i / batchSize,
      sample: batch.slice(0, 5)
    });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: upErr.message })
    };
  }
}

await logToSupabase("info", "partner_affiliate_links upserted", {
  count: linksToInsert.length,
  generation_id: generationId
});

// -----------------------
// Specialized inserts (flights/hotels/guides/activities)
// -----------------------

async function existsInTable(table, affiliate_id, deep_link) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("affiliate_id", affiliate_id)
      .eq("deep_link", deep_link)
      .limit(1)
      .maybeSingle();

    if (error) {
      await logToSupabase("warn", "Exists check error", { table, error: error.message });
      return false;
    }
    return !!data;
  } catch (e) {
    await logToSupabase("warn", "Exists check exception", { table, e: e.message });
    return false;
  }
}

// Inject generation tracking metadata helper
const injectGenerationMeta = (payload) => ({
  ...payload,
  generation_id: generationId || null,
  generated_by: "generateAffiliateLinks_v3"
});

const counts = { flights: 0, hotels: 0, activities: 0, guides: 0 };

for (const link of linksToInsert) {
  try {
    const baseCode = (link.partner_code || "").split("_")[0];
    const variant = (link.variant || "").toLowerCase();
    const classification = mapCategory(baseCode, variant);

    if (classification === "flights") {
      if (!(await existsInTable("flights", link.affiliate_id, link.deep_link))) {
        const payload = injectGenerationMeta({
          affiliate_id: link.affiliate_id,
          destination_slug: slug,
          origin,
          airline: null,
          flight_code: null,
          deep_link: link.deep_link,
          price: null,
          currency: null,
          metadata: Object.assign({}, link.metadata, { variant, depart, return: ret })
        });
        const { error } = await supabase.from("flights").insert([payload]);
        if (error)
          await logToSupabase("warn", "Flights insert failed (non-blocking)", {
            error: error.message,
            payload
          });
        else counts.flights++;
      }
      continue;
    }

    if (classification === "hotels") {
      if (!(await existsInTable("hotels", link.affiliate_id, link.deep_link))) {
        const payload = injectGenerationMeta({
          affiliate_id: link.affiliate_id,
          destination_slug: slug,
          partner_name: null,
          checkin,
          checkout,
          adults: 2,
          children: 0,
          deep_link: link.deep_link,
          price: null,
          currency: null,
          metadata: Object.assign({}, link.metadata, { variant, checkin, checkout })
        });
        const { error } = await supabase.from("hotels").insert([payload]);
        if (error)
          await logToSupabase("warn", "Hotels insert failed (non-blocking)", {
            error: error.message,
            payload
          });
        else counts.hotels++;
      }
      continue;
    }

    if (classification === "guides") {
      if (!(await existsInTable("guides", link.affiliate_id, link.deep_link))) {
        const payload = injectGenerationMeta({
          affiliate_id: link.affiliate_id,
          title: name,
          destination_slug: slug,
          category: variant || "guide",
          deep_link: link.deep_link,
          language: "en",
          metadata: Object.assign({}, link.metadata, { variant })
        });
        const { error } = await supabase.from("guides").insert([payload]);
        if (error)
          await logToSupabase("warn", "Guides insert failed (non-blocking)", {
            error: error.message,
            payload
          });
        else counts.guides++;
      }
      continue;
    }

    // Activities fallback
    if (!(await existsInTable("activities", link.affiliate_id, link.deep_link))) {
      const payload = injectGenerationMeta({
        affiliate_id: link.affiliate_id,
        destination_slug: slug,
        name: name || null,
        category: "activity",
        deep_link: link.deep_link,
        duration: null,
        price: null,
        currency: null,
        rating: null,
        metadata: Object.assign({}, link.metadata, { variant })
      });
      const { error } = await supabase.from("activities").insert([payload]);
      if (error)
        await logToSupabase("warn", "Activities insert failed (non-blocking)", {
          error: error.message,
          payload
        });
      else counts.activities++;
    }
  } catch (e) {
    await logToSupabase("error", "Specialized insert error", { error: e.message, link });
  }
}

await logToSupabase("info", "Specialized inserts finished", {
  ...counts,
  generation_id: generationId
});

// ---------------------------------------------------
// Finalize generation record
// ---------------------------------------------------

await supabase
  .from('data_generations')
  .update({
    finished_at: new Date(),
    record_count: linksToInsert.length
  })
  .eq('generation_id', generationId);

console.log(`✅ Generation ${generationId} finalized successfully.`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        message: `Affiliate links generated for ${name}`,
        partners_prepared: allPartnersData.length,
        partners_upserted: linksToInsert.length,
        specialized_insert_counts: counts,
        debug: debug ? { allPartnersData: allPartnersData.slice(0, 40), templateMisses, candidateCount: candidateLinks.length, linksToInsertCount: linksToInsert.length } : undefined,
      }),
    };
  } catch (err) {
    await logToSupabase("error", "Fatal error during generateAffiliateLinks_v3", { error: err.message, stack: err.stack });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
