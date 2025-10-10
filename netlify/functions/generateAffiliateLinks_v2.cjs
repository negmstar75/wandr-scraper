// netlify/functions/generateAffiliateLinks_v2.cjs
const { createClient } = require("@supabase/supabase-js");
const { logToSupabase } = require("./utils/logger.cjs");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -----------------------------
// Templates (multi-variant, cleaned)
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
          "https://www.booking.com/attractions/searchresults/{country_code}/{city_slug}.html",
        params: ["country_code", "city_slug"],
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
          "https://www.expedia.com/Flights-Search?leg1=from:{origin},to:{destination},departure:{depart}TANYT&leg2=from:{destination},to:{origin},departure:{return}TANYT&trip=roundtrip&passengers=adults:{adults}",
        params: ["origin", "destination", "depart", "return", "adults"],
      },
    },
  },
  getyourguide: { name: "GetYourGuide", variants: { default: { template: "https://www.getyourguide.com/{slug}-l16/", params: ["slug"] } } },
  tripadvisor: { name: "Tripadvisor", variants: { attractions: { template: "https://www.tripadvisor.com/Attractions-g{slug}-Activities.html", params: ["slug"] } } },
  tiqets: { name: "Tiqets", variants: { default: { template: "https://www.tiqets.com/en/things-to-do-in-{slug}-c66746/", params: ["slug"] } } },
  klook: { name: "Klook", variants: { default: { template: "https://www.klook.com/search/result/?query={destination}&sort=most_relevant", params: ["destination"] } } },
  rentalcars: { name: "Rentalcars", variants: { default: { template: "https://www.rentalcars.com/SearchResults.do?locationName={destination}", params: ["destination"] } } },
  cheapoair: { name: "CheapOair", variants: { default: { template: "https://www.cheapoair.com/air/listing?d1={origin}&d2={destination}&dt1={depart}&dt2={return}&tripType={tripType}", params: ["origin", "destination", "depart", "return", "tripType"] } } },
  hostelworld: { name: "Hostelworld", variants: { default: { template: "https://www.hostelworld.com/s?q={destination}&from={checkin}&to={checkout}&guests={adults}", params: ["destination", "checkin", "checkout", "adults"] } } },
  wegotrip: { name: "WeGoTrip", variants: { default: { template: "https://wegotrip.com/{slug}-d3/", params: ["slug"] } } },
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
// AFFILIATE CONFIG (TP wrapper)
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
function slugToCountry(slug) {
  if (!slug || typeof slug !== "string") return null;
  const parts = slug.split("/");
  return parts.length > 1 ? parts[0] : null;
}
function cityToSlug(s) {
  if (!s) return "";
  return String(s).toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
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
    const itinerary_id = getQuery(event, "itinerary_id");
    const mode = getQuery(event, "mode", "all"); // all | activities | hotels | flights
    debug = getQuery(event, "debug", "false") === "true";

    if (!slug || !name) {
      await logToSupabase("warn", "Missing required params", { slug, name });
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters: slug, name" }) };
    }

    // origin fallback and logging
    if (!origin || String(origin).trim() === "") {
      origin = "LAX";
      await logToSupabase("info", "Using fallback origin", { origin });
    }

    // country resolution: query param > slug prefix > 'us'
    let country = (countryQ && String(countryQ).trim()) || slugToCountry(slug) || "us";
    country = String(country).toLowerCase();

    const city = cityQ || name;
    const city_slug = cityToSlug(city);

    // dates
    const depart = todayISO(1); // tomorrow
    const ret = todayISO(8); // tomorrow +7
    const checkin = depart;
    const checkout = ret;

    await logToSupabase("info", "Start affiliate generation", { slug, name, country, city, origin, mode, debug });

    // Build partner link candidates
    const partners = AFFILIATE_CONFIG.partners;
    const allPartnersData = [];
    const templateMisses = [];

    for (const [rawKey, partnerCfg] of Object.entries(partners)) {
      try {
        const baseKey = normalizeKey(rawKey);
        const tpl = affiliateTemplates[baseKey];
        if (!tpl) {
          await logToSupabase("warn", "No template for partner", { partner: rawKey });
          continue;
        }

        for (const [variantKey, variantObj] of Object.entries(tpl.variants)) {
          // mode filtering
          if (mode === "activities") {
            if (!variantKey.match(/(attract|activ|default|elsewhere|product|pocket)/i) && !baseKey.match(/(getyourguide|klook|tiqets|wegotrip|gocity|tripadvisor)/i)) continue;
          } else if (mode === "hotels") {
            if (!variantKey.match(/(stays|stays|default)/i) && !baseKey.match(/(booking|expedia|hostelworld|rentalcars)/i)) continue;
          } else if (mode === "flights") {
            if (!variantKey.match(/(flight|flights)/i) && !baseKey.match(/(cheapoair|expedia)/i)) continue;
          }

          // Special handling for Lonely Planet 'product' / 'pocket' variants: generate both
          if (baseKey === "lonelyplanet" && (variantKey === "product" || variantKey === "pocket")) {
            // produce both product and pocket forms (product already represented in variantKey)
            const shopSlugs = [city_slug, `pocket-${city_slug}`, `${city_slug}-travel-guide`, `${city_slug}-guide`];
            for (const s of shopSlugs) {
              const targetUrl = fillTemplate(variantObj.template, { slug: s });
              const deep_link = targetUrl; // LP direct
              allPartnersData.push({
                partner_name: tpl.name,
                partner_code: safePartnerCode(baseKey, `${variantKey}_${s}`),
                deep_link,
                variant: `${variantKey}_${s}`,
                raw_target: targetUrl,
              });
            }
            continue;
          }

          // For other variants
          const templateData = {
            slug: slug.split("/").pop(),
            destination: name || city,
            city,
            city_slug,
            country,
            country_code: (country || "").slice(0, 2),
            origin,
            depart,
            return: ret,
            checkin,
            checkout,
            adults: variantObj.params && variantObj.params.includes("adults") ? 2 : 1,
            tripType: "ROUNDTRIP",
            itinerary_id,
          };

          let targetUrl;
          try {
            targetUrl = fillTemplate(variantObj.template, templateData);
          } catch (e) {
            templateMisses.push(`${baseKey}:${variantKey}`);
            await logToSupabase("warn", "Template fill error", { partner: baseKey, variantKey, err: e.message });
            continue;
          }

          // sanity fallback
          if (!targetUrl || /undefined|null/.test(targetUrl)) {
            templateMisses.push(`${baseKey}:${variantKey}`);
            await logToSupabase("warn", "Template produced invalid target; using fallback search", { partner: baseKey, variantKey, templateData });
            targetUrl = `https://${baseKey}.com/search?query=${encodeURIComponent(templateData.destination || templateData.slug || country)}`;
          }

          // Use partnerCfg safely (avoid redeclaration bug)
          const partnerConf = partnerCfg || {};

          // Wrap with Travelpayouts if configured and this isn't Lonely Planet direct
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
            variant: variantKey,
            raw_target: targetUrl,
          });
        }
      } catch (outerErr) {
        await logToSupabase("error", "Partner processing error (non-blocking)", { partner: rawKey, error: outerErr.message });
        continue;
      }
    } // end partners loop

    await logToSupabase("info", "Built partner dataset", { total: allPartnersData.length, templateMisses });

    // -----------------------
    // Upsert affiliates -> build map
    // -----------------------
    const affiliateIdMap = {};
    for (const partner of allPartnersData) {
      try {
        const code = partner.partner_code;
        if (affiliateIdMap[code]) continue;

        const { data: existing, error: selectErr } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", code).maybeSingle();
        if (selectErr) {
          await logToSupabase("error", "Error selecting affiliate (non-blocking)", { partner_code: code, error: selectErr.message });
        }
        let affiliate_id = existing?.affiliate_id;

        if (!affiliate_id) {
          const { data: aff, error: upsertErr } = await supabase
            .from("affiliates")
            .upsert(
              [{ partner_name: partner.partner_name, partner_code: code, base_url: partner.deep_link, active: true }],
              { onConflict: ["partner_code"] }
            )
            .select()
            .single();

          if (upsertErr) {
            await logToSupabase("error", "Affiliate upsert error (non-blocking)", { partner_code: code, error: upsertErr.message });
            const { data: existingAff, error: fetchErr } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", code).maybeSingle();
            if (fetchErr) {
              await logToSupabase("error", "Failed to fetch affiliate after upsert", { partner_code: code, error: fetchErr.message });
              continue;
            }
            affiliate_id = existingAff?.affiliate_id;
          } else {
            affiliate_id = aff?.affiliate_id;
          }
        }

        if (!affiliate_id) {
          await logToSupabase("warn", "Unable to resolve affiliate_id", { partner_code: code });
          continue;
        }

        affiliateIdMap[code] = affiliate_id;
      } catch (e) {
        await logToSupabase("error", "Affiliate map error", { error: e.message });
      }
    }

    // -----------------------
    // Build linksToInsert and dedupe
    // -----------------------
    const seen = new Set();
    const linksToInsert = [];
    for (const p of allPartnersData) {
      const affiliate_id = affiliateIdMap[p.partner_code];
      if (!affiliate_id) {
        await logToSupabase("warn", "Skipping partner - no affiliate_id", { partner_code: p.partner_code });
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
        variant: p.variant || "default",
      });
    }

    if (linksToInsert.length === 0) {
      await logToSupabase("warn", "No links prepared after dedupe", { slug });
      return { statusCode: 200, body: JSON.stringify({ status: "ok", message: `No affiliate links prepared for ${name}`, partners_prepared: allPartnersData.length }) };
    }

    // -----------------------
    // Upsert partner_affiliate_links (single batch)
    // -----------------------
    const { error: upsertErr } = await supabase.from("partner_affiliate_links").upsert(linksToInsert, { onConflict: ["destination_slug", "affiliate_id"] });
    if (upsertErr) {
      await logToSupabase("error", "Upsert to partner_affiliate_links failed", { error: upsertErr.message });
      throw upsertErr;
    }
    await logToSupabase("info", "partner_affiliate_links upserted", { count: linksToInsert.length });

    // -----------------------
    // Insert into specialized tables (idempotent checks)
    // -----------------------
    const counts = { flights: 0, hotels: 0, activities: 0, guides: 0 };

    for (const link of linksToInsert) {
      try {
        const affiliate_id = link.affiliate_id;
        const deep_link = link.deep_link;
        const variant = (link.variant || "").toLowerCase();
        const baseCode = link.partner_code.split("_")[0];

        async function existsIn(table) {
          const { data, error } = await supabase.from(table).select("id").eq("affiliate_id", affiliate_id).eq("deep_link", deep_link).limit(1).maybeSingle();
          if (error) {
            await logToSupabase("warn", "Exists check error", { table, error: error.message });
            return false;
          }
          return !!data;
        }

        // Flights
        const isFlight = variant.includes("flight") || ["cheapoair","expedia"].includes(baseCode);
        if (isFlight) {
          if (!(await existsIn("flights"))) {
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
            if (error) await logToSupabase("warn", "Flights insert failed (non-blocking)", { error: error.message, payload });
            else counts.flights++;
          }
          continue;
        }

        // Hotels
        const isHotel = variant.includes("stays") || ["booking","expedia","hostelworld","rentalcars"].includes(baseCode);
        if (isHotel) {
          if (!(await existsIn("hotels"))) {
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
            if (error) await logToSupabase("warn", "Hotels insert failed (non-blocking)", { error: error.message, payload });
            else counts.hotels++;
          }
          continue;
        }

        // Guides (Lonely Planet)
        if (baseCode === "lonelyplanet") {
          if (!(await existsIn("guides"))) {
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
            if (error) await logToSupabase("warn", "Guides insert failed (non-blocking)", { error: error.message, payload });
            else counts.guides++;
          }
          continue;
        }

        // Activities
        const isActivity = variant.includes("activ") || variant.includes("attract") || ["getyourguide","klook","tiqets","wegotrip","gocity","tripadvisor"].includes(baseCode);
        if (isActivity) {
          if (!(await existsIn("activities"))) {
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
            if (error) await logToSupabase("warn", "Activities insert failed (non-blocking)", { error: error.message, payload });
            else counts.activities++;
          }
          continue;
        }

        // Fallback -> activities
        if (!(await existsIn("activities"))) {
          const payload = {
            affiliate_id,
            destination_slug: slug,
            name,
            category: "misc",
            deep_link,
            metadata: { variant, generated_at: new Date().toISOString() },
          };
          const { error } = await supabase.from("activities").insert([payload]);
          if (error) await logToSupabase("warn", "Activities fallback insert failed (non-blocking)", { error: error.message, payload });
          else counts.activities++;
        }
      } catch (err) {
        await logToSupabase("error", "Specialized insert error (non-blocking)", { error: err.message });
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
    await logToSupabase("error", "Fatal error during affiliate link generation v2", { error: err.message, stack: err.stack });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
