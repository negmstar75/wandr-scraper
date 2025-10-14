// netlify/functions/generateAffiliateLinks_v3.cjs
// generateAffiliateLinks_v3.cjs — hybrid generator (templates + base fallbacks)
// Backward-compatible with existing schema; supports partner_mappings overrides.

const { createClient } = require("@supabase/supabase-js");
const { logToSupabase } = require("./utils/logger.cjs");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -----------------------------
// Template & partner config
// (kept intentionally explicit — update templates as new deep-link examples arrive)
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
        // country + city_slug pattern (NY example used country 'us' / city_slug 'new-york')
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
          "https://www.expedia.com/carsearch?locn={destination}&d1={checkin}&d2={checkout}&date1={checkin}&date2={checkout}",
        params: ["destination", "checkin", "checkout"],
      },
    },
  },

  getyourguide: {
    name: "GetYourGuide",
    variants: {
      default: { template: "https://www.getyourguide.com/{slug}/", params: ["slug"] },
    },
  },

  tripadvisor: {
    name: "Tripadvisor",
    variants: {
      attractions: { template: "https://www.tripadvisor.com/Attractions-{slug}-Activities.html", params: ["slug"] },
      hotels: { template: "https://www.tripadvisor.com/Hotels-{slug}-Hotels.html", params: ["slug"] },
      restaurants: { template: "https://www.tripadvisor.com/Restaurants-{slug}.html", params: ["slug"] },
      rentals: { template: "https://www.tripadvisor.com/VacationRentals-{slug}-Reviews.html", params: ["slug"] },
    },
  },

  tiqets: { name: "Tiqets", variants: { default: { template: "https://www.tiqets.com/en/things-to-do-in-{slug}-c66746/", params: ["slug"] } } },
  klook: { name: "Klook", variants: { default: { template: "https://www.klook.com/search/result/?query={destination}&sort=most_relevant", params: ["destination"] } } },
  rentalcars: { name: "Rentalcars", variants: { default: { template: "https://www.rentalcars.com/search-results?locationName={destination}", params: ["destination"] } } },
  cheapoair: {
    name: "CheapOair",
    variants: {
      default: { template: "https://www.cheapoair.com/air/listing?d1={origin}&d2={destination}&dt1={depart}&dt2={return}&tripType={tripType}", params: ["origin", "destination", "depart", "return", "tripType"] },
    },
  },
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

  // Generic fallback for partners that only have base URLs
  generic: { name: "Generic", variants: { default: { template: "https://{partner_domain}/search?query={destination}", params: ["partner_domain", "destination"] } } },
};

// AFFILIATE CONFIG (TP wrapper)
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
    // Add other partner entries for base-only use; examples (some were provided earlier):
    cheapoair_base: { name: "CheapOair", baseUrl: "https://tp.media/r", campaign_id: "146", partner_id: "4426" },
    wayaway: { name: "WayAway", baseUrl: "https://tp.media/r", campaign_id: "200", partner_id: "5976" },
    aviasales: { name: "Aviasales", baseUrl: "https://tp.media/r", campaign_id: "100", partner_id: "4114" },
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
  const encoded = encodeURIComponent(targetUrl || "");
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encoded}&campaign_id=${campaign_id}`;
}

function isLikelyActivityVariant(v) {
  if (!v) return false;
  return /activ|attract|things|pass|tour|ticket|attraction/i.test(v);
}
function isLikelyHotelVariant(v) {
  if (!v) return false;
  return /stay|stays|hotel|hotels|rooms|accommodation/i.test(v);
}
function isLikelyFlightVariant(v) {
  if (!v) return false;
  return /flight|flights|air|leg1/i.test(v);
}
function isLikelyGuideVariant(v) {
  if (!v) return false;
  return /product|pocket|elsewhere|destination|article|guide/i.test(v);
}

// partner-specific slug fixes (fallbacks)
function partnerSlugFix(baseKey, slug) {
  if (!slug) return slug;
  const s = String(slug);
  if (baseKey === "tripadvisor") {
    // TripAdvisor sometimes wants underscores and mixed patterns — preserve provided override if present
    return s.replace(/[^\w\-]/g, "-").replace(/\-+/g, "-");
  }
  if (baseKey === "tiqets") return cityToSlug(s);
  if (baseKey === "getyourguide") return s; // often includes '-l<id>' in mapping
  return cityToSlug(s);
}

// safe decode of partner tp target to store base URL
function decodeTpTarget(tpWrappedUrl) {
  try {
    const u = new URL(tpWrappedUrl);
    const params = new URLSearchParams(u.search);
    const encoded = params.get("u");
    if (!encoded) return null;
    return decodeURIComponent(encoded);
  } catch (e) {
    return null;
  }
}

// -----------------------------
// Main handler
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
    debug = getQuery(event, "debug", "false") === "true";

    if (!slug || !name) {
      await logToSupabase("warn", "Missing required parameters", { slug, name });
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters: slug, name" }) };
    }

    // compute date vars
    const depart = todayISO(1); // tomorrow
    const ret = todayISO(8); // +7
    const checkin = depart;
    const checkout = ret;

    // origin fallback
    if (!origin || String(origin).trim() === "") origin = "LAX";

    // country resolution
    let country = (countryQ && countryQ.trim()) || (slug.split("/")[0] || "us");
    country = String(country).toLowerCase();
    const country_code = country.slice(0, 2);

    const city = cityQ || name;
    const city_slug = cityToSlug(city);
    const destination = name || city;

    await logToSupabase("info", "Start generation v3 (hybrid)", { slug, name, country, city, origin, mode, debug });

    // Load partner_mappings for this destination once (active mappings)
    let mappings = {};
    try {
      const { data: mapRows, error: mapErr } = await supabase
        .from("partner_mappings")
        .select("*")
        .eq("destination_slug", slug)
        .eq("active", true);

      if (mapErr) {
        await logToSupabase("warn", "partner_mappings select returned error (will fallback)", { error: mapErr.message });
      } else if (mapRows && Array.isArray(mapRows)) {
        for (const r of mapRows) {
          const code = String(r.partner_code || "").toLowerCase();
          mappings[code] = r;
        }
      }
    } catch (e) {
      await logToSupabase("warn", "partner_mappings query failed (exception)", { error: e.message });
    }

    // Build partner dataset: prefer template variants when available, apply mapping overrides
    const allPartnersData = [];
    const templateMisses = [];

    for (const [rawKey, pCfg] of Object.entries(AFFILIATE_CONFIG.partners)) {
      const baseKey = normalizeKey(rawKey);
      const tpl = affiliateTemplates[baseKey] || affiliateTemplates["generic"];
      const mapping = mappings[baseKey] || {};

      // If mode filter restricts which variants to include
      const variantEntries = tpl.variants ? Object.entries(tpl.variants) : [["default", { template: tpl.template || "", params: [] }]];

      // Legacy: include a 'legacy' wrapper that uses preferred variant (keeps backwards compatibility)
      // We'll also include each specific variant as separate partner_code_variant entries (so variant column matters)
      for (const [variantKey, variantObj] of variantEntries) {
        // mode filters
        if (mode === "activities") {
          if (!isLikelyActivityVariant(variantKey) && !["getyourguide", "klook", "tiqets", "wegotrip", "gocity", "tripadvisor"].includes(baseKey))
            continue;
        } else if (mode === "hotels") {
          if (!isLikelyHotelVariant(variantKey) && !["booking", "expedia", "hostelworld"].includes(baseKey)) continue;
        } else if (mode === "flights") {
          if (!isLikelyFlightVariant(variantKey) && !["cheapoair", "expedia", "aviasales"].includes(baseKey)) continue;
        }

        // Build template data for this variant
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
        };

        // Apply partner-specific adjustments
        if (baseKey === "airalo") {
          templateData.country = country || destination;
          templateData.destination = templateData.country;
        }
        if (baseKey === "rentalcars") templateData.destination = destination;
        if (baseKey === "hostelworld") templateData.destination = destination;
        if (baseKey === "gocity" && variantKey === "country") templateData.country = (country || destination).toLowerCase();

        // If mapping.override_url exists — prefer it as raw_target (no template fill)
        let raw_target = null;
        let is_fallback = false;
        if (mapping && mapping.override_url) {
          raw_target = mapping.override_url;
          is_fallback = false;
        } else {
          // Some variants require different name for slug fix
          if (variantObj.params && variantObj.params.includes("slug")) {
            templateData.slug = partnerSlugFix(baseKey, templateData.slug);
          }
          // Fill template
          try {
            raw_target = fillTemplate(variantObj.template, templateData);
          } catch (e) {
            templateMisses.push(`${baseKey}:${variantKey}`);
            await logToSupabase("warn", "Template fill failure", { partner: baseKey, variantKey, err: e.message });
            raw_target = "";
          }
        }

        // Validate raw_target (avoid undefined/null in the URL)
        if (!raw_target || /undefined|null/.test(raw_target)) {
          templateMisses.push(`${baseKey}:${variantKey}`);
          await logToSupabase("warn", "Template produced invalid URL; using fallback search", { partner: baseKey, variantKey, templateData });
          raw_target = `https://${baseKey}.com/search?query=${encodeURIComponent(destination || city_slug || country)}`;
          is_fallback = true;
        }

        // Wrap with TP if configured and partner is not lonelyplanet (LP uses raw)
        const partnerConf = pCfg || {};
        const deep_link =
          partnerConf.baseUrl && partnerConf.campaign_id && partnerConf.partner_id && baseKey !== "lonelyplanet"
            ? buildTpLink({
                baseUrl: partnerConf.baseUrl,
                marker: AFFILIATE_CONFIG.marker,
                trs: AFFILIATE_CONFIG.trs,
                partner_id: partnerConf.partner_id,
                campaign_id: partnerConf.campaign_id,
                targetUrl: raw_target,
              })
            : raw_target;

        // determine partner_code variant-safe
        const partner_code = safePartnerCode(baseKey, variantKey);

        // base_url: prefer mapping.base_url or partnerConf.baseUrl raw target decode or partner root
        let base_url = mapping.override_url || partnerConf.baseUrl || null;
        // if base_url is TP-wrapped, decode to get actual base target for diagnostics
        if (base_url && base_url.includes("tp.media")) {
          const decoded = decodeTpTarget(base_url);
          if (decoded) base_url = decoded;
        }

        allPartnersData.push({
          partner_name: (affiliateTemplates[baseKey] && affiliateTemplates[baseKey].name) || partnerConf.name || baseKey,
          partner_code,
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
    // Upsert affiliates and build affiliateId map
    // -----------------------
    const affiliateIdMap = {};
    for (const p of allPartnersData) {
      try {
        const code = p.partner_code;
        if (affiliateIdMap[code]) continue;
        // try select
        const { data: existing, error: selErr } = await supabase.from("affiliates").select("affiliate_id, partner_code").eq("partner_code", code).maybeSingle();
        if (selErr) {
          await logToSupabase("error", "Affiliate select error", { partner_code: code, error: selErr.message });
        }
        let affiliate_id = existing?.affiliate_id;
        if (!affiliate_id) {
          const upsertRow = {
            partner_name: p.partner_name,
            partner_code: code,
            logo_url: p.logo_url || null,
            base_url: p.base_url || p.raw_target || null,
            active: true,
            marker: AFFILIATE_CONFIG.marker,
            trs: AFFILIATE_CONFIG.trs,
          };
          const { data: aff, error: upErr } = await supabase.from("affiliates").upsert([upsertRow], { onConflict: ["partner_code"] }).select("affiliate_id").single();
          if (upErr) {
            await logToSupabase("error", "Affiliate upsert error", { partner_code: code, error: upErr.message });
            // attempt fetch again
            const { data: ex2, error: exErr } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", code).maybeSingle();
            if (exErr) {
              await logToSupabase("error", "Affiliate fetch after upsert failed", { partner_code: code, error: exErr.message });
            } else {
              affiliate_id = ex2?.affiliate_id;
            }
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
        await logToSupabase("error", "Affiliate map error", { error: e.message, partner_code: p.partner_code });
      }
    }

    // -----------------------
    // Build linksToInsert with dedupe (destination+affiliate+variant)
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
        base_url: p.base_url || null,
        deep_link: p.deep_link,
        raw_target: p.raw_target,
        is_fallback: p.is_fallback || false,
        metadata: { template_used: p.template_used || false, generated_at: new Date().toISOString() },
        variant: p.variant || "default",
      });
    }

    if (linksToInsert.length === 0) {
      await logToSupabase("warn", "No links prepared after dedupe", { slug });
      return {
        statusCode: 200,
        body: JSON.stringify({
          status: "ok",
          message: "No links prepared",
          debug: debug ? { allPartnersData, templateMisses } : undefined,
        }),
      };
    }

    // -----------------------
    // Upsert partner_affiliate_links safely in small batches
    // (uses unique constraint on destination_slug, affiliate_id, variant)
    // -----------------------
    const batchSize = 50;
    for (let i = 0; i < linksToInsert.length; i += batchSize) {
      const batch = linksToInsert.slice(i, i + batchSize);
      try {
        const { error: uErr } = await supabase.from("partner_affiliate_links").upsert(batch, { onConflict: ["destination_slug", "affiliate_id", "variant"] });
        if (uErr) {
          await logToSupabase("error", "partner_affiliate_links upsert batch failed", { error: uErr.message, batchIndex: i / batchSize });
          throw uErr;
        }
      } catch (e) {
        await logToSupabase("error", "partner_affiliate_links upsert exception", { error: e.message, batchIndex: i / batchSize });
        throw e;
      }
    }
    await logToSupabase("info", "partner_affiliate_links upserted", { count: linksToInsert.length });

    // -----------------------
    // Specialized inserts (idempotent)
    // Only insert when minimal required fields are present to avoid null-filled rows
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

        // Flights detection
        const isFlight = isLikelyFlightVariant(variant) || ["cheapoair","aviasales","wayaway"].includes(baseCode) || variant.includes("flights");
        if (isFlight) {
          // require origin & depart/return dates to meaningfully insert (we have defaults)
          if (!(await exists("flights"))) {
            const payload = {
              affiliate_id,
              destination_slug: slug,
              origin: origin || null,
              airline: null,
              flight_code: null,
              deep_link,
              price: null,
              currency: null,
              metadata: Object.assign({}, link.metadata || {}, { variant, generated_at: new Date().toISOString(), depart, return: ret, passengers: 1 }),
            };
            const { error } = await supabase.from("flights").insert([payload]);
            if (error) {
              await logToSupabase("warn", "Flights insert failed", { error: error.message, payload });
            } else counts.flights++;
          }
          continue;
        }

        // Hotels detection
        const isHotel = isLikelyHotelVariant(variant) || ["booking","expedia","hostelworld"].includes(baseCode);
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
              metadata: Object.assign({}, link.metadata || {}, { variant, generated_at: new Date().toISOString(), checkin, checkout, adults: 2 }),
            };
            const { error } = await supabase.from("hotels").insert([payload]);
            if (error) {
              await logToSupabase("warn", "Hotels insert failed", { error: error.message, payload });
            } else counts.hotels++;
          }
          continue;
        }

        // Guides (Lonely Planet)
        if (baseCode === "lonelyplanet") {
          if (!(await exists("guides"))) {
            const payload = {
              affiliate_id,
              title: name || slug,
              slug: slug.split("/").pop(),
              category: variant || "guide",
              deep_link,
              language: "en",
              metadata: Object.assign({}, link.metadata || {}, { variant, generated_at: new Date().toISOString() }),
            };
            const { error } = await supabase.from("guides").insert([payload]);
            if (error) await logToSupabase("warn", "Guides insert failed", { error: error.message, payload });
            else counts.guides++;
          }
          continue;
        }

        // Rentalcars -> treat as activity of type car_rental
        if (baseCode === "rentalcars" || baseCode === "getrentacar" || baseCode === "autoeurope") {
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
              metadata: Object.assign({}, link.metadata || {}, { variant, generated_at: new Date().toISOString() }),
            };
            const { error } = await supabase.from("activities").insert([payload]);
            if (error) await logToSupabase("warn", "Rentalcars insert failed", { error: error.message, payload });
            else counts.activities++;
          }
          continue;
        }

        // Activities (GetYourGuide, Klook, Tiqets, WeGoTrip, GoCity, TripAdvisor, Booking attractions, Expedia activities)
        const isActivity = isLikelyActivityVariant(variant) || ["getyourguide","klook","tiqets","wegotrip","gocity","tripadvisor","booking","expedia","eatwith","ticketnetwork","wegotrip"].includes(baseCode);
        if (isActivity) {
          if (!(await exists("activities"))) {
            const payload = {
              affiliate_id,
              destination_slug: slug,
              name: name || null,
              category: "activity",
              deep_link,
              duration: null,
              price: null,
              currency: null,
              rating: null,
              metadata: Object.assign({}, link.metadata || {}, { variant, generated_at: new Date().toISOString() }),
            };
            const { error } = await supabase.from("activities").insert([payload]);
            if (error) await logToSupabase("warn", "Activities insert failed", { error: error.message, payload });
            else counts.activities++;
          }
          continue;
        }

        // Fallback into activities (misc)
        if (!(await exists("activities"))) {
          const payload = {
            affiliate_id,
            destination_slug: slug,
            name: name || null,
            category: "misc",
            deep_link,
            metadata: Object.assign({}, link.metadata || {}, { variant, generated_at: new Date().toISOString() }),
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

    // Final response
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
    await logToSupabase("error", "Fatal error during generateAffiliateLinks_v3", { error: err.message, stack: err.stack });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
