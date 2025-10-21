// netlify/functions/generateAffiliateLinks_v3.cjs
// generateAffiliateLinks_v3.cjs — Cleaned, patched v3.2
// Self-contained version (inlined logger). Drop-in replacement.

const { createClient } = require("@supabase/supabase-js");

// -----------------------------
// Helper: Logging to Supabase (safe/inlined)
// -----------------------------
async function logToSupabase(level, message, details = {}) {
  try {
    const sb = globalThis.supabase;
    if (!sb) {
      if (level === "error") console.error(`[${level}] ${message}`, details || {});
      else console.log(`[${level}] ${message}`, details || {});
      return;
    }
    // best-effort insert into affiliate_logs (non-blocking)
    await sb.from("affiliate_logs").insert([
      {
        timestamp: new Date().toISOString(),
        function_name: "generateAffiliateLinks_v3",
        level,
        message,
        context: details || {},
      },
    ]);
  } catch (err) {
    try {
      console.warn("logToSupabase failure:", err.message);
    } catch (e) { /* swallow */ }
  }
}

// -----------------------------
// Helpers (single source of truth)
// -----------------------------
function pad(n) { return n < 10 ? `0${n}` : String(n); }

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
  return template.replace(/\{(.*?)\}/g, (_, key) => {
    const val = data[key];
    if (val === undefined || val === null) return "";
    return encodeURIComponent(String(val));
  });
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

// Fixed TP wrapper generator — correct param order to avoid "missing p" errors
function buildTpLink({ baseUrl, marker, trs, partner_id, campaign_id, targetUrl }) {
  if (!baseUrl) return targetUrl || "";
  if (!targetUrl) return baseUrl;
  if (targetUrl.includes("tp.media")) return targetUrl;
  // Place campaign_id first then marker/trs/p — preserves common TP expectations
  return `${baseUrl}?campaign_id=${campaign_id}&marker=${marker}&trs=${trs}&p=${partner_id}&u=${encodeURIComponent(targetUrl)}`;
}

// Rental dates helper: tomorrow pickup, dropoff +1 day
function buildRentalDates(checkinIso) {
  // If passed iso date, use that as pickup; else tomorrow
  const now = checkinIso ? new Date(checkinIso) : new Date();
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
    driversAge: 30,
  };
}

async function safeSelect(supabase, table, selectStr, filter = {}) {
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
// Affilate templates (single place)
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
          "https://www.booking.com/attractions/searchresults/{country}/{city_slug}.html?start_date={checkin}&end_date={checkout}&aid=818288&label=mkt123sc",
        params: ["country", "city_slug", "checkin", "checkout"],
      },
      cars: {
        template:
          "https://cars.booking.com/search-results?locationName={destination}&puDay={puDay}&puMonth={puMonth}&puYear={puYear}&doDay={doDay}&doMonth={doMonth}&doYear={doYear}&driversAge={driversAge}",
        params: ["destination","puDay","puMonth","puYear","doDay","doMonth","doYear","driversAge"],
      },
    },
  },

  rentalcars: {
    name: "Rentalcars",
    variants: {
      default: {
        template:
          "https://www.rentalcars.com/search-results?locationName={destination}&pickUpDay={puDay}&pickUpMonth={puMonth}&pickUpYear={puYear}&dropOffDay={doDay}&dropOffMonth={doMonth}&dropOffYear={doYear}&driversAge={driversAge}",
        params: ["destination","puDay","puMonth","puYear","doDay","doMonth","doYear","driversAge"],
      },
    },
  },

  expedia: {
    name: "Expedia",
    variants: {
      stays: {
        template:
          "https://www.expedia.com/Hotel-Search?destination={destination}&d1={checkin}&d2={checkout}&adults={adults}&rooms=1",
        params: ["destination","checkin","checkout","adults"],
      },
      activities: {
        template:
          "https://www.expedia.com/things-to-do/search?location={destination}&startDate={checkin}&endDate={checkout}&sort=RECOMMENDED",
        params: ["destination","checkin","checkout"],
      },
      flights: {
        template:
          "https://www.expedia.com/Flights-Search?leg1=from:{origin},to:{destination},departure:{depart}TANYT&leg2=from:{destination},to:{origin},departure:{return}TANYT&mode=search&passengers=adults:{adults}",
        params: ["origin","destination","depart","return","adults"],
      },
      cars: {
        template: "https://www.expedia.com/carsearch?locn={destination}&d1={checkin}&d2={checkout}",
        params: ["destination","checkin","checkout"],
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
      flights: { template: "https://www.tripadvisor.com/CheapFlightsSearchResults-{slug}-a_airport0.{origin}-a_airport1.{destination}-a_date0.{depart}-a_date1.{return}", params: ["slug","origin","destination","depart","return"] }
    },
  },

  hostelworld: {
    name: "Hostelworld",
    variants: {
      default: {
        template: "https://www.hostelworld.com/findabed.php/ChosenCity.{slug}?from={checkin}&to={checkout}&guests={adults}",
        params: ["slug","checkin","checkout","adults"],
      },
    },
  },

  tiqets: { name: "Tiqets", variants: { default: { template: "https://www.tiqets.com/en/things-to-do-in-{slug}-c66746/", params: ["slug"] } } },

  klook: { name: "Klook", variants: { default: { template: "https://www.klook.com/search/result/?query={destination}&sort=most_relevant", params: ["destination"] } } },

  wegotrip: { name: "WeGoTrip", variants: { default: { template: "https://wegotrip.com/{slug}-d3/", params: ["slug"] }, search: { template: "https://wegotrip.com/search?query={destination}", params: ["destination"] } } },

  gocity: { name: "GoCity", variants: { default: { template: "https://gocity.com/en/{slug}/passes", params: ["slug"] }, country: { template: "https://gocity.com/en/{country}/", params: ["country"] } } },

  airalo: { name: "Airalo", variants: { esim: { template: "https://www.airalo.com/{country}-esim", params: ["country"] } } },

  lonelyplanet: {
    name: "Lonely Planet",
    variants: {
      destination: { template: "https://www.lonelyplanet.com/destinations/{country}/{slug}?sca_ref=5103006.jxkDNNdC6D", params: ["country","slug"] },
      elsewhere: { template: "https://www.elsewhere.io/{country}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate", params: ["country"] },
    },
  },

  cheapoair: {
    name: "CheapOair",
    variants: {
      default: {
        template:
          "https://www.cheapoair.com/air/listing?d1={origin}&d2={destination}&dt1={depart}&dt2={return}&tripType={tripType}&adults={adults}",
        params: ["origin","destination","depart","return","tripType","adults"],
      },
    },
  },

  generic: { name: "Generic", variants: { default: { template: "https://{partner_domain}/search?query={destination}", params: ["partner_domain","destination"] } } },
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
  },
};

// -----------------------------
// Deep-link partner set
// -----------------------------
const DEEP_LINK_PARTNERS = new Set([
  "booking","expedia","getyourguide","tripadvisor","klook","tiqets","rentalcars",
  "cheapoair","gocity","wayaway","wegotrip","aviasales","hostelworld","lonelyplanet","airalo"
]);

// -----------------------------
// Hybrid configuration (flights & rentals conditional)
// -----------------------------
const hybridConfig = {
  flights: ["wayaway","aviasales","cheapoair","tripadvisor","expedia","kayak"],
  rentals: ["rentalcars","booking","expedia"],
};

async function handleHybridPartner(baseKey, pCfg, destination, origin, checkin) {
  // Returns an appropriate raw_target (string) for hybrid partners, or null to let normal template logic run
  try {
    let raw_target = "";
    const userHasOrigin = origin && origin.trim().length >= 3;
    const depCode = (origin || "").toUpperCase();
    // make a rough arrival code (3 letters) from destination slug or name — for simple providers only
    const arrCode = (String(destination || "").replace(/[^A-Z0-9]/ig, "").substring(0,3) || "").toUpperCase();

    // Flights
    if (hybridConfig.flights.includes(baseKey)) {
      if (!userHasOrigin) {
        // return base url to avoid malformed deep links
        raw_target = pCfg.baseUrl || `https://${baseKey}.com/`;
      } else {
        const depDate = todayISO(1).replace(/-/g,"");
        const retDate = todayISO(8).replace(/-/g,"");
        switch (baseKey) {
          case "wayaway":
            // wayaway search pattern: /search/DEPDDMMARRRET... simplified
            raw_target = `https://wayaway.io/search/${depCode}${depDate}${arrCode}${retDate}1`;
            break;
          case "aviasales":
            raw_target = `https://www.aviasales.com/search/${depCode}${depDate}${arrCode}${retDate}1`;
            break;
          case "tripadvisor":
            {
              const tripPath = `https://www.tripadvisor.com/CheapFlightsSearchResults-g60763-a_airport0.${depCode}-a_airport1.${arrCode}-a_date0.${depDate}-a_date1.${retDate}`;
              raw_target = buildTpLink({
                baseUrl: pCfg.baseUrl,
                marker: AFFILIATE_CONFIG.marker,
                trs: AFFILIATE_CONFIG.trs,
                partner_id: pCfg.partner_id,
                campaign_id: pCfg.campaign_id,
                targetUrl: tripPath
              });
            }
            break;
          case "expedia":
            raw_target = `https://www.expedia.com/Flights-Search?leg1=from:${depCode},to:${arrCode},departure:${todayISO(1)}TANYT&leg2=from:${arrCode},to:${depCode},departure:${todayISO(8)}TANYT&mode=search`;
            break;
          case "cheapoair":
            raw_target = `https://www.cheapoair.com/air/listing?d1=${depCode}&d2=${arrCode}&dt1=${todayISO(1)}&dt2=${todayISO(8)}&tripType=ROUNDTRIP&adults=1`;
            break;
          default:
            raw_target = pCfg.baseUrl || `https://${baseKey}.com/flights`;
        }
      }
      return raw_target;
    }

    // Rentals
    if (hybridConfig.rentals.includes(baseKey)) {
      if (!destination) {
        raw_target = pCfg.baseUrl || `https://${baseKey}.com/cars`;
      } else {
        const dates = buildRentalDates(checkin);
        if (baseKey === "booking") {
          raw_target =
            `https://cars.booking.com/search-results?locationName=${encodeURIComponent(destination)}` +
            `&puDay=${dates.puDay}&puMonth=${dates.puMonth}&puYear=${dates.puYear}` +
            `&doDay=${dates.doDay}&doMonth=${dates.doMonth}&doYear=${dates.doYear}` +
            `&driversAge=${dates.driversAge}`;
        } else {
          raw_target =
            `https://www.rentalcars.com/search-results?locationName=${encodeURIComponent(destination)}` +
            `&driversAge=${dates.driversAge}` +
            `&puDay=${dates.puDay}&puMonth=${dates.puMonth}&puYear=${dates.puYear}` +
            `&doDay=${dates.doDay}&doMonth=${dates.doMonth}&doYear=${dates.doYear}`;
        }
      }
      return raw_target;
    }

    return null;
  } catch (e) {
    await logToSupabase("warn", "handleHybridPartner exception", { baseKey, e: e.message });
    return null;
  }
}

// ---------------------------------------------------
// Main Netlify handler
// ---------------------------------------------------
exports.handler = async (event, context) => {
  // create supabase client scoped to handler and expose to logger
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  globalThis.supabase = supabase;

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
          notes: "Auto batch started before affiliate link generation",
          started_at: new Date(),
        },
      ])
      .select("id")
      .single();

    if (genErr) {
      await logToSupabase("warn", "Failed to create generation batch", { error: genErr.message });
    } else {
      generationId = genRow.id;
      await logToSupabase("info", "Created new generation", { generationId });
    }
  } catch (err) {
    await logToSupabase("error", "Generation insert exception", { error: err.message, stack: err.stack });
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to initialize data generation batch" }) };
  }

  try {
    // Pull query params
    const slug = (event && event.queryStringParameters && event.queryStringParameters.slug) || getQuery(event, "slug");
    const name = getQuery(event, "name");
    const countryQ = getQuery(event, "country");
    const cityQ = getQuery(event, "city");
    let origin = getQuery(event, "origin");
    const mode = getQuery(event, "mode", "all"); // all | activities | hotels | flights
    const itinerary_id = getQuery(event, "itinerary_id");
    const debug = (getQuery(event, "debug", "false") === "true");

    if (!slug || !name) {
      await logToSupabase("warn", "Missing required parameters", { slug, name, countryQ, cityQ, generationId });
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters: slug, name" }) };
    }

    // ---------------------------------------------------
    // Compute base travel dates per category
    // ---------------------------------------------------
    const now = new Date();
    const tomorrowDate = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    const plus1Date = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const plus7Date = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

    const fmt = d => d.toISOString().split("T")[0];

    // Defaults
    let depart = fmt(tomorrowDate);
    let ret = fmt(plus7Date);
    let checkin = depart;
    let checkout = ret;

    // If caller explicitly sets a mode that implies rentals/activities, shorten to +1
    const typeParam = getQuery(event, "type");
    if (["cars", "rentalcars"].includes((typeParam || "").toLowerCase()) ||
        /cars|rental|attraction|activity/i.test(mode)) {
      ret = fmt(plus1Date);
      checkout = ret;
    }

    await logToSupabase("info", "Computed travel date ranges", { depart, ret, checkin, checkout, generationId });

    if (!origin || String(origin).trim() === "") origin = "LAX";

    // Normalize location data
    let country = (countryQ && countryQ.trim()) || (slug.split("/")[0]) || "us";
    country = String(country).toLowerCase();
    const country_code = country.slice(0, 2);
    const city = cityQ || name;
    const city_slug = cityToSlug(city);
    const destination = name || city;

    await logToSupabase("info", "Start affiliate generation v3", { slug, name, country, city, origin, mode, debug, generationId });

    // LOAD partner_mappings (if exists) — flexible match (case-insensitive contains)
    const mappings = {};
    try {
      // use ilike to match possible slug variants: e.g. 'paris' matches 'fr/paris' or 'paris-france'
      const { data: pmRows, error: pmErr } = await supabase
        .from("partner_mappings")
        .select("*")
        .ilike("destination_slug", `%${slug}%`);

      if (pmErr) {
        await logToSupabase("warn", "partner_mappings select returned error (will fallback)", { error: pmErr.message, generationId });
      } else if (Array.isArray(pmRows)) {
        for (const r of pmRows) {
          const code = String(r.partner_code || r.partner || "").toLowerCase();
          if (!code) continue;
          mappings[code] = r;
        }
      }
    } catch (e) {
      await logToSupabase("warn", "partner_mappings query exception (will fallback)", { error: e.message, generationId });
    }

    // ---------------------------------------------------
    // Build partner dataset & continue core logic
    // ---------------------------------------------------
    const allPartnersData = [];
    const templateMisses = [];

    for (const [rawKey, pCfg] of Object.entries(AFFILIATE_CONFIG.partners)) {
      const baseKey = normalizeKey(rawKey);
      const tpl = affiliateTemplates[baseKey] || affiliateTemplates.generic || { variants: { default: { template: "", params: [] } } };
      const mapping = mappings[baseKey] || {};

      const variants = tpl.variants ? Object.entries(tpl.variants) : [["default", { template: tpl.template || "", params: [] }]];

      for (const [variantKey, variantObj] of variants) {
        // Mode filtering
        if (mode === "activities") {
          if (!/(activ|attract|default|search|country|pocket|product|elsewhere)/i.test(variantKey)
            && !["getyourguide","klook","tiqets","wegotrip","gocity","tripadvisor","eatwith"].includes(baseKey)) continue;
        } else if (mode === "hotels") {
          if (!/(stays|default)/i.test(variantKey) && !["booking","expedia","hostelworld","rentalcars"].includes(baseKey)) continue;
        } else if (mode === "flights") {
          if (!/(flight|flights)/i.test(variantKey) && !["cheapoair","expedia","aviasales","wayaway","tripadvisor"].includes(baseKey)) continue;
        }

        // Prepare template data
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

        // Enforce date rules by partner category (ensures templateData has correct dates)
        const now2 = new Date();
        const tomorrow2 = new Date(now2.getTime() + 1 * 24 * 60 * 60 * 1000);
        const plus12 = new Date(now2.getTime() + 8 * 24 * 60 * 60 * 1000);
        const plusOne = new Date(now2.getTime() + 2 * 24 * 60 * 60 * 1000);
        const fmt2 = d => d.toISOString().split("T")[0];

        // Flights / Hotels -> tomorrow -> +7
        if (/(flight|flights|stays|hotel)/i.test(variantKey) ||
            ["cheapoair","aviasales","wayaway","booking","expedia","hostelworld"].includes(baseKey)) {
          templateData.checkin = fmt2(tomorrow2);
          templateData.checkout = fmt2(plus12);
          templateData.depart = fmt2(tomorrow2);
          templateData.return = fmt2(plus12);
        }

        // Rentals / Cars / Activities -> tomorrow -> +1
        if (/(car|rental|activ|attract|experience)/i.test(variantKey) ||
            ["rentalcars","getyourguide","tiqets","klook","wegotrip","gocity"].includes(baseKey)) {
          templateData.checkin = fmt2(tomorrow2);
          templateData.checkout = fmt2(plusOne);
          templateData.depart = fmt2(tomorrow2);
          templateData.return = fmt2(plusOne);
        }

        // Rental/cars specific computed values
        if (baseKey === "rentalcars" || (baseKey === "booking" && variantKey === "cars")) {
          const rental = buildRentalDates(templateData.checkin);
          Object.assign(templateData, {
            puDay: rental.puDay,
            puMonth: rental.puMonth,
            puYear: rental.puYear,
            doDay: rental.doDay,
            doMonth: rental.doMonth,
            doYear: rental.doYear,
            puHour: "10",
            doHour: "10",
            driversAge: rental.driversAge,
            pickupDate: rental.pickupDate,
            dropoffDate: rental.dropoffDate,
          });
        }

        if (baseKey === "airalo") {
          templateData.country = country || destination;
          templateData.destination = templateData.country;
        }

        // --- First attempt hybrid handler (for flights & rentals) ---
        let raw_target = null;
        try {
          if (hybridConfig.flights.includes(baseKey) || hybridConfig.rentals.includes(baseKey)) {
            const hy = await handleHybridPartner(baseKey, pCfg, destination, origin, templateData.checkin);
            if (hy) raw_target = hy;
          }
        } catch (e) {
          await logToSupabase("warn", "Hybrid handler error", { baseKey, e: e.message, generationId });
          raw_target = null;
        }

        let usedMapping = false;

        // If this partner is flagged for deep links, try mapping override, else template
        if (!raw_target) {
          if (mapping && (mapping.override_url || mapping.override_target || mapping.base_url)) {
            raw_target = mapping.override_url || mapping.override_target || mapping.base_url || null;
            usedMapping = true;
          } else {
            // fill template if available and partner is in DEEP_LINK_PARTNERS
            if (DEEP_LINK_PARTNERS.has(baseKey)) {
              try {
                raw_target = fillTemplate(variantObj.template, templateData);
              } catch (e) {
                templateMisses.push(`${baseKey}:${variantKey}`);
                await logToSupabase("warn", "Template fill failure", { partner: baseKey, variantKey, err: e.message, generationId });
                raw_target = "";
              }
            } else {
              // not a deep-link partner: prefer baseUrl if provided
              raw_target = pCfg && pCfg.baseUrl ? pCfg.baseUrl : `https://${baseKey}.com/search?query=${encodeURIComponent(destination || city_slug || country)}`;
            }
          }
        }

        // Validate raw_target and fallback if invalid
        if (!raw_target || /undefined|null/.test(raw_target)) {
          templateMisses.push(`${baseKey}:${variantKey}`);
          await logToSupabase("warn", "Template produced invalid URL; using fallback", { partner: baseKey, variantKey, templateData, mapping: !!mapping, generationId });
          if (mapping && (mapping.override_slug || mapping.slug)) {
            const slugOverride = mapping.override_slug || mapping.slug;
            raw_target = mapping.override_url || `https://${baseKey}.com/search?query=${encodeURIComponent(slugOverride)}`;
          } else {
            raw_target = `https://${baseKey}.com/search?query=${encodeURIComponent(destination || city_slug || country)}`;
          }
        }

        // Now build final deep_link (wrap with TP if partnerConf indicates)
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

        // Normalize base_url for affiliates table — prefer mapping override, then partnerConf.baseUrl (decoded if needed)
        let base_url = null;
        if (mapping && (mapping.base_url || mapping.override_url)) base_url = mapping.base_url || mapping.override_url;
        else if (partnerConf && partnerConf.baseUrl) {
          // If partnerConf.baseUrl is a tp.media wrapper, decode 'u' to get the actual endpoint if possible; otherwise keep wrapper
          const decoded = decodeTpTarget(partnerConf.baseUrl);
          base_url = decoded || partnerConf.baseUrl;
        } else {
          base_url = raw_target;
        }

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

    await logToSupabase("info", "Built partner dataset", { total: allPartnersData.length, templateMisses, generationId });

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
          await logToSupabase("error", "Affiliate select error", { partner_code: baseKey, error: selErr.message, generationId });
        }
        let affiliate_id = existing?.affiliate_id;
        if (!affiliate_id) {
          const upRow = { partner_name: p.partner_name, partner_code: baseKey, logo_url: p.logo_url || null, base_url: p.base_url || p.raw_target || null, active: true };
          const { data: aff, error: upErr } = await supabase.from("affiliates").upsert([upRow], { onConflict: ["partner_code"] }).select("affiliate_id,partner_code").single();
          if (upErr) {
            await logToSupabase("error", "Affiliate upsert error", { partner_code: baseKey, error: upErr.message, generationId });
            const { data: ex2 } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", baseKey).maybeSingle();
            affiliate_id = ex2?.affiliate_id;
          } else affiliate_id = aff?.affiliate_id;
        }
        if (!affiliate_id) {
          await logToSupabase("warn", "Unable to resolve affiliate_id for partner", { baseKey, generationId });
          continue;
        }
        affiliateIdMap[baseKey] = affiliate_id;
      } catch (e) {
        await logToSupabase("error", "Affiliate map exception", { error: e.message, baseKey: p.baseKey, generationId });
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
        await logToSupabase("warn", "Skipping partner - no affiliate_id", { partner_code: p.partner_code, baseKey, generationId });
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
        generated_by: "generateAffiliateLinks_v3.2",
        generation_id: generationId,
      });
      affiliateIdsSet.add(affiliate_id);
    }

    const affiliateIdsArray = Array.from(affiliateIdsSet);
    const existingKeySet = new Set();

    if (affiliateIdsArray.length > 0) {
      try {
        const { data: existingRows, error: existingErr } = await supabase
          .from("partner_affiliate_links")
          .select("destination_slug,affiliate_id,variant")
          .eq("destination_slug", slug)
          .in("affiliate_id", affiliateIdsArray);

        if (existingErr) {
          await logToSupabase("warn", "partner_affiliate_links select existing failed (will dedupe in-memory only)", { error: existingErr.message, generationId });
        } else if (Array.isArray(existingRows)) {
          for (const r of existingRows) {
            existingKeySet.add(`${r.destination_slug}::${r.affiliate_id}::${(r.variant || "default")}`);
          }
        }
      } catch (e) {
        await logToSupabase("warn", "Exception reading existing partner_affiliate_links (will dedupe in-memory)", { error: e.message, generationId });
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
      c.deep_link = c.deep_link || c.raw_target || c.base_url || null;
      if (!c.deep_link) {
        await logToSupabase("warn", "Skipping candidate link with empty deep_link", { candidate: c, generationId });
        continue;
      }
      linksToInsert.push(c);
    }

    if (linksToInsert.length === 0) {
      await logToSupabase("info", "No new links to upsert (all exist already)", { slug, candidates: candidateLinks.length, generationId });
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
          sample: batch.slice(0, 5),
          generationId
        });
        return { statusCode: 500, body: JSON.stringify({ error: upErr.message }) };
      }
    }

    await logToSupabase("info", "partner_affiliate_links upserted", { count: linksToInsert.length, generation_id: generationId });

    // -----------------------
    // Specialized inserts (flights/hotels/guides/activities)
    // -----------------------
    async function existsInTable(table, affiliate_id, deep_link) {
      try {
        const { data, error } = await supabase.from(table).select("id").eq("affiliate_id", affiliate_id).eq("deep_link", deep_link).limit(1).maybeSingle();
        if (error) {
          await logToSupabase("warn", "Exists check error", { table, error: error.message, generationId });
          return false;
        }
        return !!data;
      } catch (e) {
        await logToSupabase("warn", "Exists check exception", { table, e: e.message, generationId });
        return false;
      }
    }

    const injectGenerationMeta = (payload) => ({ ...payload, generation_id: generationId || null, generated_by: "generateAffiliateLinks_v3" });

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
              metadata: Object.assign({}, link.metadata, { variant, depart, return: ret }),
            });
            const { error } = await supabase.from("flights").insert([payload]);
            if (error) await logToSupabase("warn", "Flights insert failed (non-blocking)", { error: error.message, payload, generationId });
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
              metadata: Object.assign({}, link.metadata, { variant, checkin, checkout }),
            });
            const { error } = await supabase.from("hotels").insert([payload]);
            if (error) await logToSupabase("warn", "Hotels insert failed (non-blocking)", { error: error.message, payload, generationId });
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
              metadata: Object.assign({}, link.metadata, { variant }),
            });
            const { error } = await supabase.from("guides").insert([payload]);
            if (error) await logToSupabase("warn", "Guides insert failed (non-blocking)", { error: error.message, payload, generationId });
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
            metadata: Object.assign({}, link.metadata, { variant }),
          });
          const { error } = await supabase.from("activities").insert([payload]);
          if (error) await logToSupabase("warn", "Activities insert failed (non-blocking)", { error: error.message, payload, generationId });
          else counts.activities++;
        }
      } catch (e) {
        await logToSupabase("error", "Specialized insert error", { error: e.message, link, generationId });
      }
    }

    await logToSupabase("info", "Specialized inserts finished", { ...counts, generation_id: generationId });

    // ---------------------------------------------------
    // Finalize generation record
    // ---------------------------------------------------
    try {
      await supabase.from('data_generations').update({ finished_at: new Date(), record_count: linksToInsert.length }).eq('id', generationId);
    } catch (e) {
      await logToSupabase("warn", "Failed to finalize data_generations record", { generationId, err: e.message });
    }

    // Final response
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        message: `Affiliate links generated for ${name}`,
        partners_prepared: allPartnersData.length,
        partners_upserted: linksToInsert.length,
        specialized_insert_counts: counts,
        debug: debug ? { allPartnersData: allPartnersData.slice(0,40), templateMisses, candidateCount: candidateLinks.length, linksToInsertCount: linksToInsert.length } : undefined,
      }),
    };

  } catch (err) {
    await logToSupabase("error", "Fatal error during generateAffiliateLinks_v3", { error: err.message, stack: err.stack, generationId });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}; // end exports.handler

// -----------------------------
// Utility: mapCategory function (kept last for clarity)
// -----------------------------
function mapCategory(partnerCode, variant, templateMeta = {}) {
  const CLASSIFICATION_MAP = {
    flights: ["cheapoair","aviasales","wayaway","expedia"],
    hotels: ["booking","expedia","hostelworld"],
    activities: ["getyourguide","klook","tiqets","wegotrip","gocity","tripadvisor","eatwith","ticketnetwork"],
    guides: ["lonelyplanet","elsewhere"],
  };
  if (templateMeta && templateMeta.category) return templateMeta.category;
  const b = String(partnerCode || "").toLowerCase();
  if (CLASSIFICATION_MAP.flights.includes(b) || (variant && variant.includes("flight"))) return "flights";
  if (CLASSIFICATION_MAP.hotels.includes(b) || (variant && (variant.includes("stay") || variant.includes("hotel")))) return "hotels";
  if (CLASSIFICATION_MAP.guides.includes(b) || (variant && (variant.includes("product") || variant.includes("article") || variant.includes("elsewhere")))) return "guides";
  if (CLASSIFICATION_MAP.activities.includes(b) || (variant && (variant.includes("activity") || variant.includes("attract") || variant.includes("things") || variant.includes("pass")))) return "activities";
  return "activities";
}
