// netlify/functions/generateAffiliateLinks_v2.cjs
const { createClient } = require("@supabase/supabase-js");
const { logToSupabase } = require("./utils/logger.cjs");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -----------------------------
// Templates (multi-variant)
// (same set used earlier; trim/extend as needed)
// -----------------------------
const affiliateTemplates = {
  booking: {
    name: "Booking.com",
    variants: {
      stays: {
        template:
          "https://www.booking.com/searchresults.html?checkin={checkin}&checkout={checkout}&ss={destination}&group_adults={adults}&group_children={children}",
        params: ["destination", "checkin", "checkout", "adults", "children"],
      },
      attractions: { template: "https://www.booking.com/attractions/{slug}.html", params: ["slug"] },
      flights: { template: "https://www.booking.com/flights/search?ss={destination}", params: ["destination"] },
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
      flights: { template: "https://www.expedia.com/Flights-Search?destination={destination}", params: ["destination"] },
    },
  },
  getyourguide: { name: "GetYourGuide", variants: { default: { template: "https://www.getyourguide.com/{slug}-l16/", params: ["slug"] } } },
  tripadvisor: {
    name: "Tripadvisor",
    variants: {
      default: { template: "https://www.tripadvisor.com/Tourism-g187147-{slug}-Vacations.html", params: ["slug"] },
      attractions: { template: "https://www.tripadvisor.com/Attractions-g{slug}-Activities.html", params: ["slug"] },
    },
  },
  tiqets: { name: "Tiqets", variants: { default: { template: "https://www.tiqets.com/en/things-to-do-in-{slug}-c66746/", params: ["slug"] }, search: { template: "https://www.tiqets.com/search?q={destination}", params: ["destination"] } } },
  klook: { name: "Klook", variants: { default: { template: "https://www.klook.com/search/result/?query={destination}&sort=most_relevant", params: ["destination"] } } },
  rentalcars: { name: "Rentalcars", variants: { default: { template: "https://www.rentalcars.com/SearchResults.do?locationName={destination}", params: ["destination"] } } },
  cheapoair: { name: "CheapOair", variants: { default: { template: "https://www.cheapoair.com/air/listing?d1={origin}&d2={destination}&dt1={depart}&dt2={return}&tripType={tripType}", params: ["origin", "destination", "depart", "return", "tripType"] }, fallback: { template: "https://www.cheapoair.com/?q={destination}", params: ["destination"] } } },
  hostelworld: { name: "Hostelworld", variants: { default: { template: "https://www.hostelworld.com/s?q={destination}", params: ["destination"] } } },
  wegotrip: { name: "WeGoTrip", variants: { default: { template: "https://wegotrip.com/{slug}-d3/", params: ["slug"] }, search: { template: "https://wegotrip.com/search?query={destination}", params: ["destination"] } } },
  gocity: { name: "GoCity", variants: { default: { template: "https://gocity.com/en/{slug}/passes", params: ["slug"] }, country: { template: "https://gocity.com/en/{country}/", params: ["country"] } } },
  airalo: { name: "Airalo", variants: { esim: { template: "https://www.airalo.com/{country}-esim", params: ["country"] } } },
  lonelyplanet: { name: "Lonely Planet", variants: { book: { template: "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D", params: ["slug"] }, article: { template: "https://www.lonelyplanet.com/articles/{slug}", params: ["slug"] }, itineraries: { template: "https://www.lonelyplanet.com/itineraries/{slug}", params: ["slug"] } } },
};

// -----------------------------
// AFFILIATE CONFIG (TP wrapper, same keys as affiliateTemplates)
// -----------------------------
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

// -----------------------------
// Helpers
// -----------------------------
function normalizeKey(key) {
  return String(key || "").toLowerCase().replace(/[\s\.\-]+/g, "").replace(/_+/g, "_");
}
function safePartnerCode(baseKey, variantKey) {
  if (!variantKey || variantKey === "default" || variantKey === "legacy") return baseKey;
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
function getQuery(event, name, fallback = undefined) {
  try {
    return (event.queryStringParameters && event.queryStringParameters[name]) || fallback;
  } catch (e) {
    return fallback;
  }
}
function isEmptyString(s) {
  return s === undefined || s === null || String(s).trim() === "";
}

// -----------------------------
// Handler
// -----------------------------
exports.handler = async (event) => {
  let debug = false;
  try {
    const slug = getQuery(event, "slug");
    const name = getQuery(event, "name");
    const country = getQuery(event, "country");
    const city = getQuery(event, "city");
    const origin = getQuery(event, "origin");
    const depart = getQuery(event, "depart");
    const ret = getQuery(event, "return");
    const adults = getQuery(event, "adults") || 2;
    debug = getQuery(event, "debug", "false") === "true";

    if (!slug || !name) {
      await logToSupabase("warn", "Missing required parameters", { slug, name, country, city });
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters: slug, name" }) };
    }

    await logToSupabase("info", "Start affiliate link generation (v2.1)", { slug, name, country, city, debug });

    const { marker, trs } = AFFILIATE_CONFIG;
    const partnersEntries = Object.entries(AFFILIATE_CONFIG.partners || {});
    const allPartnersData = [];
    const templateMisses = [];
    const slugPart = slug.split("/").pop() || slug;
    const baseDestination = name || city || country || "";

    // Build partner list (legacy + variants)
    for (const [rawKey, pConfig] of partnersEntries) {
      const baseKey = normalizeKey(rawKey);
      const partnerTemplates = affiliateTemplates[baseKey];

      // Legacy single link (preserve previous behavior)
      try {
        let legacyTarget;
        if (partnerTemplates && partnerTemplates.variants) {
          const prefer = partnerTemplates.variants.stays ? "stays" : Object.keys(partnerTemplates.variants)[0];
          legacyTarget = fillTemplate(partnerTemplates.variants[prefer].template, {
            slug: slugPart,
            destination: baseDestination,
            checkin: "2025-10-06",
            checkout: "2025-10-12",
            adults,
            children: 0,
            origin: origin || "",
            depart: depart || "",
            return: ret || "",
            tripType: "ROUNDTRIP",
            country,
          });
        } else {
          legacyTarget = `https://${baseKey}.com/search?query=${encodeURIComponent(baseDestination)}`;
        }

        const legacyDeepLink =
          String(pConfig.name || "").toLowerCase().includes("lonely") || !pConfig.baseUrl
            ? legacyTarget
            : buildTpLink({
                baseUrl: pConfig.baseUrl,
                marker,
                trs,
                partner_id: pConfig.partner_id,
                campaign_id: pConfig.campaign_id,
                targetUrl: legacyTarget,
              });

        allPartnersData.push({
          partner_name: pConfig.name,
          partner_code: baseKey,
          deep_link: legacyDeepLink,
          logo_url: partnerTemplates?.logo_url || "",
          variant: "legacy",
          template_used: !!(partnerTemplates && partnerTemplates.variants),
        });
      } catch (errLegacy) {
        await logToSupabase("error", "Legacy link build failed", { partner: rawKey, err: errLegacy.message });
      }

      // Variant entries
      if (partnerTemplates && partnerTemplates.variants) {
        for (const [variantKey, variantObj] of Object.entries(partnerTemplates.variants)) {
          try {
            const templateData = {
              slug: slugPart,
              destination: baseDestination,
              checkin: "2025-10-06",
              checkout: "2025-10-12",
              adults,
              children: 0,
              origin: origin || "",
              depart: depart || "",
              return: ret || "",
              tripType: "ROUNDTRIP",
              country,
            };

            // Partner-specific suppressions
            if (baseKey === "airalo") {
              templateData.country = country || baseDestination;
              templateData.destination = templateData.country;
            }
            if (baseKey === "rentalcars") templateData.destination = baseDestination;
            if (baseKey === "hostelworld") templateData.destination = baseDestination;
            if (baseKey === "gocity" && variantKey === "country") templateData.country = (country || baseDestination).toLowerCase();

            let targetUrl = fillTemplate(variantObj.template, templateData);
            if (!targetUrl) {
              templateMisses.push(`${baseKey}:${variantKey}`);
              await logToSupabase("warn", "Variant template empty — using fallback", { partner: baseKey, variantKey });
              targetUrl = `https://${baseKey}.com/search?query=${encodeURIComponent(baseDestination)}`;
            }

            const deep_link =
              String(pConfig.name || "").toLowerCase().includes("lonely") || !pConfig.baseUrl
                ? targetUrl
                : buildTpLink({
                    baseUrl: pConfig.baseUrl,
                    marker,
                    trs,
                    partner_id: pConfig.partner_id,
                    campaign_id: pConfig.campaign_id,
                    targetUrl,
                  });

            const partner_code = safePartnerCode(baseKey, variantKey);

            allPartnersData.push({
              partner_name: pConfig.name,
              partner_code,
              deep_link,
              logo_url: variantObj?.logo_url || "",
              variant: variantKey,
              template_used: true,
            });
          } catch (variantErr) {
            await logToSupabase("error", "Error building variant link", { partner: rawKey, variant: variantKey, error: variantErr.message });
          }
        }
      } else {
        // fallback single
        try {
          const partner_code = safePartnerCode(baseKey, "default");
          const fallbackUrl = `https://${baseKey}.com/search?query=${encodeURIComponent(baseDestination)}`;
          const deep_link = pConfig.baseUrl
            ? buildTpLink({
                baseUrl: pConfig.baseUrl,
                marker,
                trs,
                partner_id: pConfig.partner_id,
                campaign_id: pConfig.campaign_id,
                targetUrl: fallbackUrl,
              })
            : fallbackUrl;
          allPartnersData.push({
            partner_name: pConfig.name,
            partner_code,
            deep_link,
            logo_url: "",
            variant: "default",
            template_used: false,
          });
        } catch (fbErr) {
          await logToSupabase("error", "Fallback build failed", { partner: rawKey, err: fbErr.message });
        }
      }
    } // end partners loop

    await logToSupabase("info", "Built partner dataset", { total: allPartnersData.length, templateMisses });

    // -----------------------
    // Upsert affiliates (one by one) and build affiliate_id map
    // -----------------------
    const affiliateIdMap = {}; // partner_code -> affiliate_id
    for (const partner of allPartnersData) {
      const code = partner.partner_code;
      if (affiliateIdMap[code]) continue; // already resolved

      // try select
      const { data: existing, error: selectErr } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", code).maybeSingle();
      if (selectErr) {
        await logToSupabase("error", "Error selecting affiliate", { partner_code: code, error: selectErr.message });
        // continue to attempt upsert
      }
      let affiliate_id = existing?.affiliate_id;

      if (!affiliate_id) {
        // upsert affiliate row
        const { data: aff, error: insertErr } = await supabase
          .from("affiliates")
          .upsert(
            [
              {
                partner_name: partner.partner_name,
                partner_code: code,
                logo_url: partner.logo_url || "",
                base_url: partner.deep_link,
                active: true,
              },
            ],
            { onConflict: ["partner_code"] }
          )
          .select()
          .single();

        if (insertErr) {
          await logToSupabase("error", "Affiliate upsert error", { partner_code: code, error: insertErr.message });
          // attempt to fetch again
          const { data: existingAff, error: fetchErr } = await supabase.from("affiliates").select("affiliate_id").eq("partner_code", code).maybeSingle();
          if (fetchErr) {
            await logToSupabase("error", "Failed to fetch affiliate after upsert", { partner_code: code, error: fetchErr.message });
            continue; // skip this partner
          }
          affiliate_id = existingAff?.affiliate_id;
        } else {
          affiliate_id = aff?.affiliate_id;
        }
      }

      if (!affiliate_id) {
        await logToSupabase("warn", "Unable to resolve affiliate_id for partner_code", { partner_code: code });
        continue;
      }
      affiliateIdMap[code] = affiliate_id;
    }

    // -----------------------
    // Build linksToInsert but deduplicate by (destination_slug + affiliate_id)
    // -----------------------
    const seenLinkKeys = new Set();
    const linksToInsert = [];

    for (const p of allPartnersData) {
      const affiliate_id = affiliateIdMap[p.partner_code];
      if (!affiliate_id) {
        await logToSupabase("warn", "Skipping partner - no affiliate_id", { partner_code: p.partner_code });
        continue;
      }
      const key = `${slug}::${affiliate_id}`;
      if (seenLinkKeys.has(key)) {
        // duplicate in same batch -> skip
        continue;
      }
      seenLinkKeys.add(key);
      linksToInsert.push({
        destination_slug: slug,
        affiliate_id,
        partner_code: p.partner_code,
        deep_link: p.deep_link,
        metadata: { city: city || null, country: country || null },
        variant: p.variant || "default",
      });
    }

    if (linksToInsert.length === 0) {
      await logToSupabase("warn", "No links prepared for upsert (after dedupe)", { slug, built: allPartnersData.length });
      return { statusCode: 200, body: JSON.stringify({ status: "ok", message: `No affiliate links prepared for ${name}`, partners_prepared: allPartnersData.length, partners_upserted: 0, debug: debug ? { allPartnersData, templateMisses } : undefined }) };
    }

    // -----------------------
    // Upsert partner_affiliate_links (single batch)
    // -----------------------
    try {
      const { error: upsertErr } = await supabase.from("partner_affiliate_links").upsert(linksToInsert, { onConflict: ["destination_slug", "affiliate_id"] });
      if (upsertErr) {
        await logToSupabase("error", "Upsert to partner_affiliate_links failed", { error: upsertErr.message });
        throw upsertErr;
      }
    } catch (upsertCatchErr) {
      await logToSupabase("error", "Upsert exception", { error: upsertCatchErr.message });
      throw upsertCatchErr;
    }

    await logToSupabase("info", "Partner links upserted", { count: linksToInsert.length });

    // -----------------------
    // Insert into specialized tables (idempotent checks)
    // We'll check existence by affiliate_id + deep_link (safe proxy) or slug for guides
    // -----------------------
    const insertedSpecialCounts = { flights: 0, hotels: 0, activities: 0, guides: 0 };

    for (const link of linksToInsert) {
      try {
        const affiliate_id = link.affiliate_id;
        const deep_link = link.deep_link;
        const variant = (link.variant || "").toLowerCase();
        const baseCode = link.partner_code.split("_")[0];

        // helper: exists check by affiliate_id + deep_link
        async function existsInTable(table) {
          const { data, error } = await supabase.from(table).select("id").eq("affiliate_id", affiliate_id).eq("deep_link", deep_link).limit(1).maybeSingle();
          if (error) {
            await logToSupabase("warn", "Exists check error", { table, error: error.message });
            return false;
          }
          return !!data;
        }

        // decide which table to insert into
        const shouldInsertFlights = variant.includes("flight") || baseCode === "cheapoair" || baseCode === "cheapOair";
        const shouldInsertHotels = variant.includes("stays") || baseCode === "booking" || baseCode === "expedia" || baseCode === "hostelworld" || baseCode === "rentalcars";
        const shouldInsertActivities = variant.includes("activities") || variant.includes("attractions") || ["getyourguide","klook","tiqets","wegotrip","gocity","tripadvisor"].includes(baseCode);
        const shouldInsertGuides = ["lonelyplanet"].includes(baseCode) || variant.includes("book") || variant.includes("article") || variant.includes("itinerary");

        if (shouldInsertFlights) {
          const exists = await existsInTable("flights");
          if (!exists) {
            const payload = {
              affiliate_id,
              origin: origin || null,
              destination: name || city || null,
              airline: null,
              flight_code: null,
              deep_link,
              price: null,
              currency: null,
              metadata: { source_variant: variant, generated_at: new Date().toISOString() },
            };
            const { error } = await supabase.from("flights").insert([payload]);
            if (error) {
              await logToSupabase("warn", "Flights insert failed (non-blocking)", { error: error.message, payload });
            } else insertedSpecialCounts.flights++;
          }
        }

        if (shouldInsertHotels) {
          const exists = await existsInTable("hotels");
          if (!exists) {
            const payload = {
              affiliate_id,
              destination_slug: slug,
              name: null,
              stars: null,
              address: null,
              deep_link,
              price: null,
              currency: null,
              metadata: { source_variant: variant, generated_at: new Date().toISOString() },
            };
            const { error } = await supabase.from("hotels").insert([payload]);
            if (error) {
              await logToSupabase("warn", "Hotels insert failed (non-blocking)", { error: error.message, payload });
            } else insertedSpecialCounts.hotels++;
          }
        }

        if (shouldInsertActivities) {
          const exists = await existsInTable("activities");
          if (!exists) {
            const payload = {
              affiliate_id,
              destination_slug: slug,
              name: null,
              category: null,
              deep_link,
              duration: null,
              price: null,
              currency: null,
              rating: null,
              metadata: { source_variant: variant, generated_at: new Date().toISOString() },
            };
            const { error } = await supabase.from("activities").insert([payload]);
            if (error) {
              await logToSupabase("warn", "Activities insert failed (non-blocking)", { error: error.message, payload });
            } else insertedSpecialCounts.activities++;
          }
        }

        if (shouldInsertGuides) {
          // for guides prefer slug existence if possible
          const guideExists = await supabase.from("guides").select("id").eq("affiliate_id", affiliate_id).eq("deep_link", deep_link).limit(1).maybeSingle();
          if (!guideExists.error && !guideExists.data) {
            const payload = {
              affiliate_id,
              title: null,
              slug: slugPart,
              category: variant || "ebook",
              deep_link,
              language: "en",
              metadata: { source_variant: variant, generated_at: new Date().toISOString() },
            };
            const { error } = await supabase.from("guides").insert([payload]);
            if (error) {
              await logToSupabase("warn", "Guides insert failed (non-blocking)", { error: error.message, payload });
            } else insertedSpecialCounts.guides++;
          }
        }
      } catch (specialErr) {
        await logToSupabase("error", "Error inserting into specialized tables (non-blocking)", { error: specialErr.message });
      }
    }

    await logToSupabase("info", "Specialized inserts finished", insertedSpecialCounts);

    // Final response
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        message: `Affiliate links generated for ${name}`,
        partners_prepared: allPartnersData.length,
        partners_upserted: linksToInsert.length,
        specialized_insert_counts: insertedSpecialCounts,
        debug: debug ? { allPartnersData, templateMisses, linksToInsert } : undefined,
      }),
    };
  } catch (err) {
    await logToSupabase("error", "Fatal error during affiliate link generation (v2.1)", { error: err.message, stack: err.stack });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
