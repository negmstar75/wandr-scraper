// netlify/functions/generateAffiliateLinks_v2.cjs
// generateAffiliateLinks_v2 — final, robust, mapping-aware (safe + backwards-compatible)
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
        // note: country + city_slug expected (e.g. "fr", "paris")
        template: "https://www.booking.com/attractions/searchresults/{country}/{city_slug}.html",
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
      pocket: {
        template:
          "https://shop.lonelyplanet.com/products/pocket-{slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program",
        params: ["slug"],
      },
      product: {
        template:
          "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program",
        params: ["slug"],
      },
      elsewhere: {
        template:
          "https://www.elsewhere.io/{country}?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate&utm_term=Exclusive-Affiliate-Program&utm_content=Exclusive-Affiliate-Program",
        params: ["country"],
      },
    },
  },
};

// -----------------------------
// Affiliate config (TP wrapper)
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
function fillTemplate(template, data) {
  if (!template) return "";
  return template.replace(/\{(.*?)\}/g, (_, key) => encodeURIComponent(data[key] ?? ""));
}
function buildTpLink({ baseUrl, marker, trs, partner_id, campaign_id, targetUrl }) {
  if (!baseUrl) return targetUrl || "";
  const encoded = encodeURIComponent(targetUrl || "");
  return `${baseUrl}?marker=${marker}&trs=${trs}&p=${partner_id}&u=${encoded}&campaign_id=${campaign_id}`;
}
function safePartnerCode(baseKey, variantKey) {
  if (!variantKey) return baseKey;
  return `${baseKey}_${variantKey}`.replace(/[^a-z0-9_]/g, "_");
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

    if (!origin || String(origin).trim() === "") origin = "LAX";

    // normalized fields
    let country = (countryQ && String(countryQ).trim()) || (slug.split("/")[0] || "us");
    country = String(country).toLowerCase();
    const country_code = country.slice(0, 2);
    const city = cityQ || name;
    const city_slug = cityToSlug(city);
    const destination = name || city;

    await logToSupabase("info", "Start affiliate generation v2.5 (auto mapping mode)", { slug, name, country, city, origin, mode, debug });

    // -----------------------------
    // Read partner_mappings (if present). If table missing -> fallback (log).
    // -----------------------------
    let partnerMappings = [];
    try {
      const { data: pmRows, error: pmErr } = await supabase.from("partner_mappings").select("*").eq("active", true);
      if (pmErr) {
        // If relation doesn't exist or other critical error, log and continue without mapping
        const msg = pmErr?.message || String(pmErr);
        await logToSupabase("warn", "partner_mappings select returned error (will fallback)", { error: msg });
        // If the table does not exist, we cannot create it reliably from runtime. In that case, continue without mapping.
        partnerMappings = [];
      } else {
        partnerMappings = Array.isArray(pmRows) ? pmRows : [];
      }
    } catch (err) {
      // Unexpected exception while reading mapping table; log and move on
      await logToSupabase("warn", "Exception reading partner_mappings (fallback)", { error: err.message });
      partnerMappings = [];
    }

    // -----------------------------
    // Build partner dataset
    // -----------------------------
    const partnersEntries = Object.entries(AFFILIATE_CONFIG.partners || {});
    const allPartnersData = [];
    const templateMisses = [];

    for (const [rawKey, pCfg] of partnersEntries) {
      const baseKey = rawKey;
      const tpl = affiliateTemplates[baseKey];
      if (!tpl) {
        await logToSupabase("warn", "Missing template set", { partner: baseKey });
        continue;
      }

      for (const [variantKey, variantObj] of Object.entries(tpl.variants)) {
        // Mode filtering
        if (mode === "activities") {
          const allowActivity = variantKey.match(/(attract|activ|default|search|country|pocket|product|elsewhere)/i)
            || ["getyourguide","klook","tiqets","wegotrip","gocity","tripadvisor"].includes(baseKey);
          if (!allowActivity) continue;
        } else if (mode === "hotels") {
          if (!variantKey.match(/(stays|default)/i) && !["booking","expedia","hostelworld","rentalcars"].includes(baseKey)) continue;
        } else if (mode === "flights") {
          if (!variantKey.match(/(flight|flights)/i) && !["cheapoair","expedia"].includes(baseKey)) continue;
        }

        // mapping override check for this partner + slug
        const mapping = partnerMappings.find(r => r.partner_code === baseKey && r.destination_slug === slug);

        // prepare template data
        const templateData = {
          slug: slug.split("/").pop(),
          city_slug: mapping?.override_slug || city_slug,
          destination: mapping?.destination_override || destination,
          city,
          country: mapping?.override_country || country,
          country_code,
          origin,
          depart,
          return: ret,
          checkin,
          checkout,
          adults: 2,
          tripType: "ROUNDTRIP",
          itinerary_id,
        };

        // lonelyplanet shop variants (try multiple product slugs)
        if (baseKey === 'lonelyplanet' && (variantKey === 'product' || variantKey === 'pocket')) {
          const shopVariants = [`pocket-${city_slug}`, city_slug, `${city_slug}-travel-guide`, `${city_slug}-guide`];
          for (const s of shopVariants) {
            const target = fillTemplate(variantObj.template, { slug: s });
            allPartnersData.push({
              partner_name: tpl.name,
              partner_code: safePartnerCode(baseKey, `${variantKey}_${s}`),
              deep_link: target,
              variant: `${variantKey}_${s}`,
              mapping_applied: !!mapping,
              raw_target: target,
            });
          }
          continue;
        }

        // allow mapping.override_url to fully supply target
        let targetUrl = mapping?.override_url || fillTemplate(variantObj.template, templateData);

        if (!targetUrl || /undefined|null/.test(targetUrl)) {
          templateMisses.push(`${baseKey}:${variantKey}`);
          await logToSupabase("warn", "Template produced invalid URL; using fallback search", { partner: baseKey, variantKey, templateData });
          targetUrl = `https://${baseKey}.com/search?query=${encodeURIComponent(templateData.destination || templateData.slug || country)}`;
        }

        // Wrap with tp.media for partners that have it (except Lonely Planet)
        const partnerConf = pCfg || {};
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

        const partner_code = safePartnerCode(baseKey, variantKey);

        allPartnersData.push({
          partner_name: tpl.name,
          partner_code,
          deep_link,
          variant: variantKey,
          template_used: true,
          mapping_applied: !!mapping,
          raw_target: targetUrl,
        });
      } // end variant loop
    } // end partners loop

    await logToSupabase("info", "Built partner dataset", { total: allPartnersData.length, templateMisses });

    // -----------------------
    // Upsert affiliates -> build map (partner_code -> affiliate_id)
    // -----------------------
    const affiliateIdMap = {};
    for (const p of allPartnersData) {
      const code = p.partner_code;
      if (affiliateIdMap[code]) continue;

      try {
        const { data: existing, error: selErr } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", code).maybeSingle();
        if (selErr) {
          await logToSupabase("warn", "Affiliate select error (non-blocking)", { partner_code: code, error: selErr.message });
        }
        let affiliate_id = existing?.affiliate_id;

        if (!affiliate_id) {
          const { data: aff, error: upsertErr } = await supabase.from("affiliates").upsert(
            [{ partner_name: p.partner_name, partner_code: code, logo_url: p.logo_url || null, base_url: p.deep_link, active: true }],
            { onConflict: ["partner_code"] }
          ).select().single();

          if (upsertErr) {
            await logToSupabase("warn", "Affiliate upsert error (non-blocking)", { partner_code: code, error: upsertErr.message });
            const { data: existingAff, error: fetchErr } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", code).maybeSingle();
            if (fetchErr) {
              await logToSupabase("error", "Failed to fetch affiliate after upsert", { partner_code: code, error: fetchErr.message });
            } else affiliate_id = existingAff?.affiliate_id;
          } else affiliate_id = aff?.affiliate_id;
        }

        if (!affiliate_id) {
          await logToSupabase("warn", "Unable to resolve affiliate_id", { partner_code: code });
          continue;
        }

        affiliateIdMap[code] = affiliate_id;
      } catch (e) {
        await logToSupabase("error", "Affiliate map exception", { partner_code: code, error: e.message });
      }
    }

    // -----------------------
    // Build linksToInsert and dedupe (include variant)
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
        metadata: { variant: p.variant, mapping_applied: p.mapping_applied || false, raw_target: p.raw_target || null },
        variant: p.variant || "default",
      });
    }

    if (linksToInsert.length === 0) {
      await logToSupabase("warn", "No links prepared after dedupe", { slug });
      return { statusCode: 200, body: JSON.stringify({ status: "ok", message: `No affiliate links prepared for ${name}`, partners_prepared: allPartnersData.length }) };
    }

    // -----------------------
    // Upsert partner_affiliate_links in small batches (avoid ON CONFLICT multi-affect issues)
    // Note: we include variant in onConflict to avoid "ON CONFLICT DO UPDATE command cannot affect row a second time"
    // -----------------------
    const batchSize = 50;
    for (let i = 0; i < linksToInsert.length; i += batchSize) {
      const batch = linksToInsert.slice(i, i + batchSize);
      const { error: uErr } = await supabase.from("partner_affiliate_links").upsert(batch, { onConflict: ["destination_slug", "affiliate_id", "variant"] });
      if (uErr) {
        // Log and throw to surface to caller
        await logToSupabase("error", "partner_affiliate_links upsert failed (batch)", { error: uErr.message, batchIndex: i / batchSize });
        throw uErr;
      }
    }
    await logToSupabase("info", "partner_affiliate_links upserted", { count: linksToInsert.length });

    // -----------------------
    // Insert into specialized tables idempotently
    // -----------------------
    const insertedCounts = { flights: 0, hotels: 0, activities: 0, guides: 0 };

    // helper
    async function existsInTable(table, affiliate_id, deep_link) {
      try {
        const { data, error } = await supabase.from(table).select("id").eq("affiliate_id", affiliate_id).eq("deep_link", deep_link).limit(1).maybeSingle();
        if (error) {
          await logToSupabase("warn", "Exists check error", { table, error: error.message });
          return false;
        }
        return !!data;
      } catch (e) {
        await logToSupabase("warn", "Exists check exception", { table, error: e.message });
        return false;
      }
    }

    for (const link of linksToInsert) {
      try {
        const affiliate_id = link.affiliate_id;
        const deep_link = link.deep_link;
        const variant = (link.variant || "").toLowerCase();
        const baseCode = link.partner_code.split("_")[0];

        // Flights detection
        const isFlight = variant.includes("flight") || (["cheapoair","expedia"].includes(baseCode) && variant.includes("flights"));
        if (isFlight) {
          if (!(await existsInTable("flights", affiliate_id, deep_link))) {
            const payload = {
              affiliate_id,
              partner_name: AFFILIATE_CONFIG.partners[baseCode]?.name || baseCode,
              origin,
              destination_slug: slug,
              depart_date: depart,
              return_date: ret,
              deep_link,
              metadata: { variant, generated_at: new Date().toISOString() },
            };
            const { error } = await supabase.from("flights").insert([payload]);
            if (error) await logToSupabase("warn", "Flights insert failed (non-blocking)", { error: error.message, payload });
            else insertedCounts.flights++;
          }
          continue;
        }

        // Hotels detection
        const isHotel = variant.includes("stays") || ["booking","expedia","hostelworld","rentalcars"].includes(baseCode);
        if (isHotel) {
          if (!(await existsInTable("hotels", affiliate_id, deep_link))) {
            const payload = {
              affiliate_id,
              partner_name: AFFILIATE_CONFIG.partners[baseCode]?.name || baseCode,
              destination_slug: slug,
              checkin,
              checkout,
              adults: 2,
              deep_link,
              metadata: { variant, generated_at: new Date().toISOString() },
            };
            const { error } = await supabase.from("hotels").insert([payload]);
            if (error) await logToSupabase("warn", "Hotels insert failed (non-blocking)", { error: error.message, payload });
            else insertedCounts.hotels++;
          }
          continue;
        }

        // Guides (Lonely Planet)
        if (baseCode === "lonelyplanet") {
          if (!(await existsInTable("guides", affiliate_id, deep_link))) {
            const payload = {
              affiliate_id,
              partner_name: AFFILIATE_CONFIG.partners[baseCode]?.name || baseCode,
              destination_slug: slug,
              category: variant || "guide",
              title: name,
              deep_link,
              metadata: { variant, generated_at: new Date().toISOString() },
            };
            const { error } = await supabase.from("guides").insert([payload]);
            if (error) await logToSupabase("warn", "Guides insert failed (non-blocking)", { error: error.message, payload });
            else insertedCounts.guides++;
          }
          continue;
        }

        // Rentalcars -> activities with car_rental category
        if (baseCode === "rentalcars") {
          if (!(await existsInTable("activities", affiliate_id, deep_link))) {
            const payload = {
              affiliate_id,
              destination_slug: slug,
              name: `${name} - Car rental`,
              category: "car_rental",
              deep_link,
              metadata: { variant, generated_at: new Date().toISOString() },
            };
            const { error } = await supabase.from("activities").insert([payload]);
            if (error) await logToSupabase("warn", "Rentalcars insert failed (non-blocking)", { error: error.message, payload });
            else insertedCounts.activities++;
          }
          continue;
        }

        // Activities
        const isActivity = variant.includes("activ") || variant.includes("attract") || ["getyourguide","klook","tiqets","wegotrip","gocity","tripadvisor","booking","expedia"].includes(baseCode);
        if (isActivity) {
          if (!(await existsInTable("activities", affiliate_id, deep_link))) {
            const payload = {
              affiliate_id,
              destination_slug: slug,
              name,
              category: baseCode === "rentalcars" ? "car_rental" : "activity",
              deep_link,
              metadata: { variant, generated_at: new Date().toISOString() },
            };
            const { error } = await supabase.from("activities").insert([payload]);
            if (error) await logToSupabase("warn", "Activities insert failed (non-blocking)", { error: error.message, payload });
            else insertedCounts.activities++;
          }
          continue;
        }

        // Fallback -> activities
        if (!(await existsInTable("activities", affiliate_id, deep_link))) {
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
          else insertedCounts.activities++;
        }
      } catch (specialErr) {
        await logToSupabase("error", "Error inserting specialized row (non-blocking)", { error: specialErr.message });
      }
    }

    await logToSupabase("info", "Specialized inserts finished", insertedCounts);

    // Final response
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        message: `Affiliate links generated for ${name}`,
        partners_prepared: allPartnersData.length,
        partners_upserted: linksToInsert.length,
        specialized_insert_counts: insertedCounts,
        debug: debug ? { allPartnersData, templateMisses, linksToInsert } : undefined,
      }),
    };
  } catch (err) {
    await logToSupabase("error", "Fatal error during generateAffiliateLinks_v2", { error: err.message, stack: err.stack });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
