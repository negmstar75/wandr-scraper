// netlify/functions/generateAffiliateLinks_v3.cjs
// generateAffiliateLinks_v3.cjs — revised/fixed (affiliate_id resolution, safe TP wrapping, classification, rental date fixes)

const { createClient } = require("@supabase/supabase-js");
const { logToSupabase } = require("./utils/logger.cjs");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ---------- Templates (trimmed but representative — keep your full list in production) ----------
const affiliateTemplates = {
  booking: {
    name: "Booking.com",
    variants: {
      stays: { template: "https://www.booking.com/searchresults.html?checkin={checkin}&checkout={checkout}&ss={destination}&group_adults={adults}&group_children=0&no_rooms=1", params: ["destination","checkin","checkout","adults"] },
      attractions: { template: "https://www.booking.com/attractions/searchresults/{country}/{city_slug}.html", params: ["country","city_slug"] },
      cars: { template: "https://cars.booking.com/search-results?locationName={destination}&puDay={puDay}&puMonth={puMonth}&puYear={puYear}&driversAge={driversAge}", params: ["destination","puDay","puMonth","puYear","driversAge"] },
    }
  },
  expedia: {
    name: "Expedia",
    variants: {
      stays: { template: "https://www.expedia.com/Hotel-Search?destination={destination}&d1={checkin}&d2={checkout}&adults={adults}&rooms=1", params: ["destination","checkin","checkout","adults"] },
      activities: { template: "https://www.expedia.com/things-to-do/search?location={destination}&startDate={checkin}&endDate={checkout}&sort=RECOMMENDED", params: ["destination","checkin","checkout"] },
      flights: { template: "https://www.expedia.com/Flights-Search?leg1=from:{origin},to:{destination},departure:{depart}TANYT&leg2=from:{destination},to:{origin},departure:{return}TANYT&mode=search&passengers=adults:{adults}", params: ["origin","destination","depart","return","adults"] },
      cars: { template: "https://www.expedia.com/carsearch?locn={destination}&d1={checkin}&d2={checkout}", params: ["destination","checkin","checkout"] },
    }
  },
  getyourguide: { name: "GetYourGuide", variants: { default: { template: "https://www.getyourguide.com/{slug}/", params: ["slug"] } } },
  tripadvisor: { name: "Tripadvisor", variants: { attractions: { template: "https://www.tripadvisor.com/Attractions-{slug}-Activities.html", params:["slug"] }, hotels: { template: "https://www.tripadvisor.com/Hotels-{slug}-Hotels.html", params:["slug"] }, restaurants: { template: "https://www.tripadvisor.com/Restaurants-{slug}.html", params:["slug"] } } },
  tiqets: { name: "Tiqets", variants: { default: { template: "https://www.tiqets.com/en/things-to-do-in-{slug}-c66746/", params:["slug"] } } },
  klook: { name: "Klook", variants: { default: { template: "https://www.klook.com/search/result/?query={destination}&sort=most_relevant", params:["destination"] } } },
  rentalcars: { name: "Rentalcars", variants: { default: { template: "https://www.rentalcars.com/search-results?locationName={destination}", params:["destination"] } } },
  cheapoair: { name: "CheapOair", variants: { default: { template: "https://www.cheapoair.com/air/listing?d1={origin}&d2={destination}&dt1={depart}&dt2={return}&tripType={tripType}", params:["origin","destination","depart","return","tripType"] } } },
  hostelworld: { name: "Hostelworld", variants: { default: { template: "https://www.hostelworld.com/s?q={destination}&from={checkin}&to={checkout}&guests={adults}", params:["destination","checkin","checkout","adults"] } } },
  wegotrip: { name: "WeGoTrip", variants: { default: { template: "https://wegotrip.com/{slug}-d3/", params:["slug"] }, search: { template: "https://wegotrip.com/search?query={destination}", params:["destination"] } } },
  gocity: { name: "GoCity", variants: { default: { template: "https://gocity.com/en/{slug}/passes", params:["slug"] }, country: { template: "https://gocity.com/en/{country}/", params:["country"] } } },
  airalo: { name: "Airalo", variants: { esim: { template: "https://www.airalo.com/{country}-esim", params:["country"] } } },
  lonelyplanet: { name: "Lonely Planet", variants: { product: { template: "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D", params:["slug"] }, pocket: { template: "https://shop.lonelyplanet.com/products/pocket-{slug}?sca_ref=5103006.jxkDNNdC6D", params:["slug"] }, elsewhere: { template: "https://www.elsewhere.io/{country}?sca_ref=5103006.jxkDNNdC6D", params:["country"] }, destination: { template: "https://www.lonelyplanet.com/destinations/{country}/{slug}?sca_ref=5103006.jxkDNNdC6D", params:["country","slug"] }, article: { template: "https://www.lonelyplanet.com/articles/{slug}?sca_ref=5103006.jxkDNNdC6D", params:["slug"] } } },
  generic: { name: "Generic", variants: { default: { template: "https://{partner_domain}/search?query={destination}", params:["partner_domain","destination"] } } }
};

// ---------- AFFILIATE CONFIG (TP wrappers) ----------
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
  }
};

// ---------- Helpers ----------
function getQuery(event, name, fallback = undefined) {
  try { return (event.queryStringParameters && event.queryStringParameters[name]) || fallback; } catch (e) { return fallback; }
}
function todayISO(offset = 0) { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().split("T")[0]; }
function cityToSlug(s) { if (!s) return ""; return String(s).toLowerCase().replace(/[^\w\s-]/g,"").trim().replace(/\s+/g,"-"); }
function normalizeKey(key) { return String(key||"").toLowerCase().replace(/[\s\.\-]+/g,"").replace(/_+/g,"_"); }
function safePartnerCode(baseKey, variantKey){ if(!variantKey||variantKey==="default") return baseKey; return `${baseKey}_${variantKey}`.replace(/[^a-z0-9_]/g,"_"); }
function fillTemplate(template,data){ if(!template) return ""; return template.replace(/\{(.*?)\}/g,(_,k)=>encodeURIComponent(data[k]??"")); }
function buildTpLink({ baseUrl, marker, trs, partner_id, campaign_id, targetUrl }) {
  if (!baseUrl) return targetUrl || "";
  // ensure we don't return bare tp.media/r with no 'u'
  if (!targetUrl) return baseUrl; // fallback: tp.media/r alone (less ideal) but we'll prefer decoded base later
  const encoded = encodeURIComponent(targetUrl || "");
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encoded}&campaign_id=${campaign_id}`;
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
  // expects "YYYY-MM-DD"; returns { day, month, year } as strings (no leading zeros issues)
  try {
    const parts = isoDate.split("-");
    return { year: parts[0], month: parts[1], day: parts[2] };
  } catch (e) { return { year: null, month: null, day: null }; }
}

// Classification map (baseKey -> preferred table)
const CLASSIFICATION_MAP = {
  flights: ["cheapoair","aviasales","wayaway","expedia"],
  hotels: ["booking","expedia","hostelworld"],
  activities: ["getyourguide","klook","tiqets","wegotrip","gocity","tripadvisor","eatwith","ticketnetwork"],
  guides: ["lonelyplanet"]
};

function classify(baseKey, variant) {
  variant = String(variant||"").toLowerCase();
  const b = String(baseKey||"").toLowerCase();
  if (CLASSIFICATION_MAP.flights.includes(b) || variant.includes("flight")) return "flights";
  if (CLASSIFICATION_MAP.hotels.includes(b) || variant.includes("stay") || variant.includes("stays") || variant.includes("hotel")) return "hotels";
  if (CLASSIFICATION_MAP.guides.includes(b) || variant.includes("product") || variant.includes("pocket") || variant.includes("article") || variant.includes("elsewhere")) return "guides";
  if (CLASSIFICATION_MAP.activities.includes(b) || variant.includes("activity") || variant.includes("attract") || variant.includes("pass") || variant.includes("things")) return "activities";
  // fallback
  return "activities";
}

// ---------- Handler ----------
exports.handler = async (event) => {
  let debug = false;
  try {
    const slug = getQuery(event, "slug");
    const name = getQuery(event, "name");
    const countryQ = getQuery(event, "country");
    const cityQ = getQuery(event, "city");
    let origin = getQuery(event, "origin");
    const mode = getQuery(event, "mode", "all"); // all|activities|hotels|flights
    debug = getQuery(event, "debug", "false") === "true";

    if (!slug || !name) {
      await logToSupabase("warn","Missing required params",{slug,name});
      return { statusCode:400, body: JSON.stringify({ error: "Missing required parameters: slug, name" }) };
    }

    const depart = todayISO(1);
    const ret = todayISO(8);
    const checkin = depart;
    const checkout = ret;
    if (!origin || String(origin).trim()==="") origin = "LAX";

    let country = (countryQ && countryQ.trim()) || (slug.split("/")[0] || "us");
    country = String(country).toLowerCase();
    const country_code = country.slice(0,2);
    const city = cityQ || name;
    const city_slug = cityToSlug(city);
    const destination = name || city;

    await logToSupabase("info","Start generation v3 fixed",{ slug,name,country,city,origin,mode });

    // load partner_mappings overrides
    let mappings = {};
    try {
      const { data: mapRows, error: mapErr } = await supabase.from("partner_mappings").select("*").eq("destination_slug", slug).eq("active", true);
      if (mapErr) {
        await logToSupabase("warn","partner_mappings select returned error (will fallback)",{ error: mapErr.message });
      } else if (Array.isArray(mapRows)) {
        for (const r of mapRows) { mappings[(r.partner_code||"").toLowerCase()] = r; }
      }
    } catch (e) {
      await logToSupabase("warn","partner_mappings query exception",{ error: e.message });
    }

    // Build partner data
    const allPartnersData = [];
    const templateMisses = [];

    for (const [rawKey,pCfg] of Object.entries(AFFILIATE_CONFIG.partners)) {
      const baseKey = normalizeKey(rawKey);
      const tpl = affiliateTemplates[baseKey] || affiliateTemplates.generic;
      const mapping = mappings[baseKey] || {};

      const variants = tpl.variants ? Object.entries(tpl.variants) : [["default",{ template: tpl.template||"", params:[] }]];
      for (const [variantKey,variantObj] of variants) {
        // mode filters
        if (mode === "activities") {
          if (!/activ|attract|things|pass|default|search/i.test(variantKey) && !["getyourguide","klook","tiqets","wegotrip","gocity","tripadvisor"].includes(baseKey)) continue;
        } else if (mode === "hotels") {
          if (!/stay|stays|hotel|rooms/i.test(variantKey) && !["booking","expedia","hostelworld"].includes(baseKey)) continue;
        } else if (mode === "flights") {
          if (!/flight|flights|air|leg1/i.test(variantKey) && !["cheapoair","expedia","aviasales","wayaway"].includes(baseKey)) continue;
        }

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

        // Partner-specific adjustments
        if (baseKey === "airalo") { templateData.country = country || destination; templateData.destination = templateData.country; }
        if (baseKey === "rentalcars") { templateData.destination = destination; const pickupParts = datePartsISO(depart); templateData.puDay = pickupParts.day; templateData.puMonth = pickupParts.month; templateData.puYear = pickupParts.year; const dropParts = datePartsISO(ret); templateData.doDay = dropParts.day; templateData.doMonth = dropParts.month; templateData.doYear = dropParts.year; templateData.driversAge = 30; }
        if (baseKey === "booking" && variantKey === "cars") { const pu = datePartsISO(depart); templateData.puDay = pu.day; templateData.puMonth = pu.month; templateData.puYear = pu.year; templateData.driversAge = 30; }

        // If mapping.override_url present — use it directly
        let raw_target = null;
        let is_fallback = false;
        if (mapping && mapping.override_url) {
          raw_target = mapping.override_url;
        } else {
          try { raw_target = fillTemplate(variantObj.template, templateData); } catch (e) { templateMisses.push(`${baseKey}:${variantKey}`); await logToSupabase("warn","Template fill failure",{ partner: baseKey, variantKey, err:e.message }); raw_target = ""; }
        }

        // If raw_target invalid -> fallback to mapping.override_slug or decoded partner base
        if (!raw_target || /undefined|null/.test(raw_target)) {
          templateMisses.push(`${baseKey}:${variantKey}`);
          await logToSupabase("warn","Template produced invalid URL; applying fallback",{ partner: baseKey, variantKey, templateData });
          // prefer mapping.override_slug (if exists)
          if (mapping && mapping.override_slug) {
            // if mapping.override_slug looks like a slug, try to build typical patterns
            raw_target = mapping.override_url || `https://${baseKey}.com/search?query=${encodeURIComponent(mapping.override_slug||destination)}`;
          } else {
            // try decode partnerConf.baseUrl if exists
            const decoded = pCfg && pCfg.baseUrl ? decodeTpTarget(pCfg.baseUrl) : null;
            if (decoded) raw_target = decoded;
            else raw_target = `https://${baseKey}.com/search?query=${encodeURIComponent(destination)}`;
          }
          is_fallback = true;
        }

        // Make sure TP wrapping doesn't produce "tp.media/r" without u param
        let deep_link;
        const partnerConf = pCfg || {};
        if (partnerConf.baseUrl && partnerConf.partner_id && partnerConf.campaign_id && partnerConf.baseUrl.includes("tp.media")) {
          // ensure raw_target exists
          if (!raw_target || raw_target === partnerConf.baseUrl) {
            // prefer decoded base target if available
            const decoded = decodeTpTarget(partnerConf.baseUrl) || raw_target;
            if (!decoded) {
              // absolute fallback (search)
              raw_target = `https://${baseKey}.com/search?query=${encodeURIComponent(destination)}`;
            } else raw_target = decoded;
          }
          deep_link = buildTpLink({ baseUrl: partnerConf.baseUrl, marker: AFFILIATE_CONFIG.marker, trs: AFFILIATE_CONFIG.trs, partner_id: partnerConf.partner_id, campaign_id: partnerConf.campaign_id, targetUrl: raw_target });
        } else {
          deep_link = raw_target;
        }

        // base_url decode for diagnostics (try to decode if TP wrapped)
        let base_url = null;
        if (mapping && mapping.base_url) base_url = mapping.base_url;
        else if (partnerConf && partnerConf.baseUrl) {
          base_url = partnerConf.baseUrl.includes("tp.media") ? decodeTpTarget(partnerConf.baseUrl) || partnerConf.baseUrl : partnerConf.baseUrl;
        }

        const partner_code = safePartnerCode(baseKey, variantKey);

        allPartnersData.push({
          baseKey,
          partner_name: (affiliateTemplates[baseKey] && affiliateTemplates[baseKey].name) || partnerConf.name || baseKey,
          partner_code,
          variant: variantKey,
          deep_link,
          raw_target,
          base_url,
          is_fallback,
          template_used: true
        });
      } // end variant loop
    } // end partners loop

    await logToSupabase("info","Built partner dataset",{ total: allPartnersData.length, templateMisses });

    // ---------------- Upsert affiliates (resolve by baseKey, not variant) ----------------
    const affiliateIdMap = {}; // baseKey -> affiliate_id
    for (const p of allPartnersData) {
      const baseKey = p.baseKey;
      if (affiliateIdMap[baseKey]) continue;
      try {
        const { data: existing, error: selErr } = await supabase.from("affiliates").select("affiliate_id,partner_code").eq("partner_code", baseKey).maybeSingle();
        if (selErr) {
          await logToSupabase("error","Affiliate select error",{ partner_code: baseKey, error: selErr.message });
        }
        let affiliate_id = existing?.affiliate_id;
        if (!affiliate_id) {
          const upRow = { partner_name: p.partner_name, partner_code: baseKey, logo_url: p.logo_url||null, base_url: p.base_url||p.raw_target||null, active: true };
          const { data: aff, error: upErr } = await supabase.from("affiliates").upsert([upRow], { onConflict: ["partner_code"] }).select("affiliate_id,partner_code").single();
          if (upErr) {
            await logToSupabase("error","Affiliate upsert error",{ partner_code: baseKey, error: upErr.message });
            const { data: ex2 } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", baseKey).maybeSingle();
            affiliate_id = ex2?.affiliate_id;
          } else affiliate_id = aff?.affiliate_id;
        }
        if (!affiliate_id) { await logToSupabase("warn","Could not resolve affiliate_id",{ baseKey }); continue; }
        affiliateIdMap[baseKey] = affiliate_id;
      } catch (e) {
        await logToSupabase("error","Affiliate map exception",{ error: e.message, baseKey: p.baseKey });
      }
    }

    // ---------------- Build linksToInsert (dedupe by destination::affiliate::variant) ----------------
    const seen = new Set();
    const linksToInsert = [];
    for (const p of allPartnersData) {
      const affiliate_id = affiliateIdMap[p.baseKey];
      if (!affiliate_id) { await logToSupabase("warn","Skipping partner, no affiliate_id",{ partner_code: p.partner_code }); continue; }
      const key = `${slug}::${affiliate_id}::${p.variant}`;
      if (seen.has(key)) continue;
      seen.add(key);

      linksToInsert.push({
        destination_slug: slug,
        affiliate_id,
        partner_code: p.partner_code,
        base_url: p.base_url || null,
        deep_link: p.deep_link || p.raw_target || p.base_url || null,
        raw_target: p.raw_target || null,
        is_fallback: !!p.is_fallback,
        metadata: { template_used: p.template_used, generated_at: new Date().toISOString() },
        variant: p.variant || "default"
      });
    }

    if (linksToInsert.length === 0) {
      await logToSupabase("warn","No links prepared after dedupe",{ slug });
      return { statusCode:200, body: JSON.stringify({ status:"ok", message:"No links prepared", debug: debug ? { allPartnersData, templateMisses } : undefined }) };
    }

    // ---------------- Upsert partner_affiliate_links in batches ----------------
    const batchSize = 50;
    for (let i=0;i<linksToInsert.length;i+=batchSize) {
      const batch = linksToInsert.slice(i,i+batchSize);
      const { error: uErr } = await supabase.from("partner_affiliate_links").upsert(batch, { onConflict: ["destination_slug", "affiliate_id", "variant"] });
      if (uErr) {
        await logToSupabase("error","partner_affiliate_links upsert batch failed",{ error: uErr.message, batchIndex: i/batchSize });
        throw uErr;
      }
    }
    await logToSupabase("info","partner_affiliate_links upserted",{ count: linksToInsert.length });

    // ---------------- Specialized inserts ----------------
    const counts = { flights:0, hotels:0, activities:0, guides:0 };
    for (const link of linksToInsert) {
      try {
        const baseCode = (link.partner_code||"").split("_")[0];
        const variant = (link.variant||"").toLowerCase();
        const classification = classify(baseCode, variant);

        // exists check
        async function existsIn(table) {
          const { data, error } = await supabase.from(table).select("id").eq("affiliate_id", link.affiliate_id).eq("deep_link", link.deep_link).limit(1).maybeSingle();
          if (error) { await logToSupabase("warn","exists check error",{ table, error: error.message }); return false; }
          return !!data;
        }

        if (classification === "flights") {
          if (!(await existsIn("flights"))) {
            const payload = { affiliate_id: link.affiliate_id, destination_slug: slug, origin, airline:null, flight_code:null, deep_link: link.deep_link, price:null, currency:null, metadata: Object.assign({}, link.metadata, { variant }), };
            const { error } = await supabase.from("flights").insert([payload]);
            if (error) await logToSupabase("warn","Flights insert failed",{ error: error.message, payload }); else counts.flights++;
          }
          continue;
        }

        if (classification === "hotels") {
          if (!(await existsIn("hotels"))) {
            const payload = { affiliate_id: link.affiliate_id, destination_slug: slug, name:null, stars:null, address:null, deep_link: link.deep_link, price:null, currency:null, metadata: Object.assign({}, link.metadata, { variant, checkin: checkin, checkout: checkout }) };
            const { error } = await supabase.from("hotels").insert([payload]);
            if (error) await logToSupabase("warn","Hotels insert failed",{ error: error.message, payload }); else counts.hotels++;
          }
          continue;
        }

        if (classification === "guides") {
          if (!(await existsIn("guides"))) {
            const payload = { affiliate_id: link.affiliate_id, title: name, slug: slug.split("/").pop(), category: variant||"guide", deep_link: link.deep_link, language:"en", metadata: Object.assign({}, link.metadata, { variant }) };
            const { error } = await supabase.from("guides").insert([payload]);
            if (error) await logToSupabase("warn","Guides insert failed",{ error: error.message, payload }); else counts.guides++;
          }
          continue;
        }

        // activities fallback
        if (!(await existsIn("activities"))) {
          const payload = { affiliate_id: link.affiliate_id, destination_slug: slug, name: name||null, category:"activity", deep_link: link.deep_link, duration:null, price:null, currency:null, rating:null, metadata: Object.assign({}, link.metadata, { variant }) };
          const { error } = await supabase.from("activities").insert([payload]);
          if (error) await logToSupabase("warn","Activities insert failed",{ error: error.message, payload }); else counts.activities++;
        }
      } catch (e) {
        await logToSupabase("error","Specialized insert error",{ error: e.message });
      }
    }

    await logToSupabase("info","Specialized inserts finished",counts);

    return {
      statusCode:200,
      body: JSON.stringify({
        status:"ok",
        message: `Affiliate links generated for ${name}`,
        partners_prepared: allPartnersData.length,
        partners_upserted: linksToInsert.length,
        specialized_insert_counts: counts,
        debug: debug ? { allPartnersData, templateMisses, linksToInsert } : undefined
      })
    };
  } catch (err) {
    await logToSupabase("error","Fatal error during generateAffiliateLinks_v3_fixed",{ error: err.message, stack: err.stack });
    return { statusCode:500, body: JSON.stringify({ error: err.message }) };
  }
};
