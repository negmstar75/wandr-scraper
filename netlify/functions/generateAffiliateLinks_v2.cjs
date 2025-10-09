// netlify/functions/generateAffiliateLinks.cjs
// Full-variant refactor — preserves legacy partner_code and adds variant partner_code entries.
// - Uses @supabase/supabase-js and logToSupabase
// - Defensive error handling, debug output, and safe upsert semantics

const { createClient } = require("@supabase/supabase-js");
const { logToSupabase } = require("./utils/logger.cjs");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -----------------------------
// Templates: multi-variant per partner
// Keys must match AFFILIATE_CONFIG partner keys (normalized)
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
      attractions: {
        template: "https://www.booking.com/attractions/{slug}.html",
        params: ["slug"],
      },
      flights: {
        template: "https://www.booking.com/flights/search?ss={destination}",
        params: ["destination"],
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
        template: "https://www.expedia.com/Flights-Search?destination={destination}",
        params: ["destination"],
      },
    },
  },
  getyourguide: {
    name: "GetYourGuide",
    variants: {
      default: {
        template: "https://www.getyourguide.com/{slug}-l16/",
        params: ["slug"],
      },
    },
  },
  tripadvisor: {
    name: "Tripadvisor",
    variants: {
      default: {
        template:
          "https://www.tripadvisor.com/Tourism-g187147-{slug}-Vacations.html",
        params: ["slug"],
      },
      attractions: {
        template:
          "https://www.tripadvisor.com/Attractions-g{slug}-Activities.html",
        params: ["slug"],
      },
    },
  },
  tiqets: {
    name: "Tiqets",
    variants: {
      default: {
        template: "https://www.tiqets.com/en/things-to-do-in-{slug}-c66746/",
        params: ["slug"],
      },
      search: {
        template: "https://www.tiqets.com/search?q={destination}",
        params: ["destination"],
      },
    },
  },
  klook: {
    name: "Klook",
    variants: {
      default: {
        template:
          "https://www.klook.com/search/result/?query={destination}&sort=most_relevant",
        params: ["destination"],
      },
    },
  },
  rentalcars: {
    name: "Rentalcars",
    variants: {
      default: {
        // simplified: avoid pickup/drop detailed params unless provided
        template:
          "https://www.rentalcars.com/SearchResults.do?locationName={destination}",
        params: ["destination"],
      },
    },
  },
  cheapoair: {
    name: "CheapOair",
    variants: {
      default: {
        template:
          "https://www.cheapoair.com/air/listing?d1={origin}&d2={destination}&dt1={depart}&dt2={return}&tripType={tripType}",
        params: ["origin", "destination", "depart", "return", "tripType"],
      },
      fallback: {
        template: "https://www.cheapoair.com/?q={destination}",
        params: ["destination"],
      },
    },
  },
  hostelworld: {
    name: "Hostelworld",
    variants: {
      default: {
        // fallback to search style to avoid numeric id requirement
        template:
          "https://www.hostelworld.com/s?q={destination}",
        params: ["destination"],
      },
    },
  },
  wegotrip: {
    name: "WeGoTrip",
    variants: {
      default: {
        template: "https://wegotrip.com/{slug}-d3/",
        params: ["slug"],
      },
      search: {
        template: "https://wegotrip.com/search?query={destination}",
        params: ["destination"],
      },
    },
  },
  gocity: {
    name: "GoCity",
    variants: {
      default: {
        template: "https://gocity.com/en/{slug}/passes",
        params: ["slug"],
      },
      country: {
        template: "https://gocity.com/en/{country}/",
        params: ["country"],
      },
    },
  },
  airalo: {
    name: "Airalo",
    variants: {
      esim: {
        // Airalo should be country-level (no city)
        template: "https://www.airalo.com/{country}-esim",
        params: ["country"],
      },
    },
  },
  lonelyplanet: {
    name: "Lonely Planet",
    variants: {
      book: {
        template:
          "https://shop.lonelyplanet.com/products/{slug}?sca_ref=5103006.jxkDNNdC6D",
        params: ["slug"],
      },
      article: {
        template: "https://www.lonelyplanet.com/articles/{slug}",
        params: ["slug"],
      },
      itineraries: {
        template: "https://www.lonelyplanet.com/itineraries/{slug}",
        params: ["slug"],
      },
    },
  },
};

// -----------------------------
// AFFILIATE CONFIG (as before) — keys align with affiliateTemplates keys
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
    debug = getQuery(event, "debug", "false") === "true";

    if (!slug || !name) {
      await logToSupabase("warn", "Missing required parameters", { slug, name, country, city });
      return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters: slug, name" }) };
    }

    await logToSupabase("info", "Start affiliate link generation (v2)", { slug, name, country, city, debug });

    const { marker, trs } = AFFILIATE_CONFIG;
    const partnersEntries = Object.entries(AFFILIATE_CONFIG.partners || {});
    const allPartnersData = []; // both legacy base and variant entries
    const templateMisses = [];
    const builtPartnerRecords = [];

    // Build a normalized destination payload
    const baseDestination = name || city || country || "";
    const slugPart = slug.split("/").pop() || slug;

    // For each partner, create both legacy base partner link and variant links
    for (const [rawKey, pConfig] of partnersEntries) {
      const baseKey = normalizeKey(rawKey); // e.g., "booking"
      const partnerTemplates = affiliateTemplates[baseKey];

      // Legacy behavior: produce a single "base" deep link as before (to preserve previous working state)
      try {
        let legacyTarget = "";
        if (partnerTemplates && partnerTemplates.variants) {
          // pick the "stays" or default variant as legacy mapping if exists
          const prefer = partnerTemplates.variants.stays ? "stays" : Object.keys(partnerTemplates.variants)[0];
          const legacyTemplate = partnerTemplates.variants[prefer];
          legacyTarget = fillTemplate(legacyTemplate.template, {
            slug: slugPart,
            destination: baseDestination,
            checkin: "2025-10-06",
            checkout: "2025-10-12",
            adults: 2,
            children: 0,
            origin: "CAI",
            depart: "2025-10-06",
            return: "2025-10-12",
            tripType: "ROUNDTRIP",
            country,
          });
        } else {
          // fallback: basic search page
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
          partner_code: baseKey, // legacy partner_code
          deep_link: legacyDeepLink,
          logo_url: partnerTemplates?.logo_url || "",
          variant: "legacy",
          template_used: !!(partnerTemplates && partnerTemplates.variants),
        });

        builtPartnerRecords.push({ partner: baseKey, variant: "legacy" });
      } catch (errLegacy) {
        await logToSupabase("error", "Legacy link build failed", { partner: rawKey, err: errLegacy.message });
      }

      // Now build all variant entries (new behavior)
      if (partnerTemplates && partnerTemplates.variants) {
        for (const [variantKey, variantObj] of Object.entries(partnerTemplates.variants)) {
          try {
            // smart param selection
            const templateData = {
              slug: slugPart,
              destination: baseDestination,
              checkin: "2025-10-06",
              checkout: "2025-10-12",
              adults: 2,
              children: 0,
              origin: "CAI",
              depart: "2025-10-06",
              return: "2025-10-12",
              tripType: "ROUNDTRIP",
              country,
            };

            // Partner-specific suppressions/fallbacks
            if (baseKey === "airalo") {
              // Airalo: use country only
              templateData.country = country || baseDestination;
              templateData.destination = templateData.country;
            }
            if (baseKey === "rentalcars") {
              // rentalcars: avoid pickup/drop parameters — use destination only
              templateData.destination = baseDestination;
            }
            if (baseKey === "hostelworld") {
              templateData.destination = baseDestination;
            }
            if (baseKey === "gocity" && variantKey === "country") {
              templateData.country = country ? country.toLowerCase() : baseDestination.toLowerCase();
            }

            let targetUrl = fillTemplate(variantObj.template, templateData);

            if (!targetUrl) {
              // fallback: search page
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

            builtPartnerRecords.push({ partner: baseKey, variant: variantKey });
          } catch (variantErr) {
            await logToSupabase("error", "Error building variant link", {
              partner: rawKey,
              variant: variantKey,
              error: variantErr.message,
            });
          }
        }
      } else {
        // If no variant templates registered, produce a safe fallback single variant
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
          builtPartnerRecords.push({ partner: baseKey, variant: "default" });
        } catch (fbErr) {
          await logToSupabase("error", "Fallback build failed", { partner: rawKey, err: fbErr.message });
        }
      }
    } // end partners loop

    await logToSupabase("info", "Built partner dataset", { total: allPartnersData.length, templateMisses });

    // --- Upsert affiliates and prepare partner_affiliate_links rows ---
    const linksToInsert = [];

    for (const partner of allPartnersData) {
      try {
        // Find existing affiliate id for partner_code (variant-aware), else upsert
        const { data: existing, error: selectErr } = await supabase
          .from("affiliates")
          .select("affiliate_id")
          .eq("partner_code", partner.partner_code)
          .maybeSingle();

        if (selectErr) {
          await logToSupabase("error", "Error selecting affiliate", { partner: partner.partner_code, error: selectErr.message });
          throw selectErr;
        }

        let affiliate_id = existing?.affiliate_id;

        if (!affiliate_id) {
          // Upsert affiliate record for this partner_code (this will create new affiliate rows for variants,
          // and will upsert existing base partner rows kept from legacy)
          const { data: aff, error: insertErr } = await supabase
            .from("affiliates")
            .upsert(
              [
                {
                  partner_name: partner.partner_name,
                  partner_code: partner.partner_code,
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
            await logToSupabase("error", "Affiliate upsert error", { partner: partner.partner_code, error: insertErr.message });
            throw insertErr;
          }
          affiliate_id = aff?.affiliate_id;

          // Double-check
          if (!affiliate_id) {
            const { data: existingAff, error: fetchErr } = await supabase
              .from("affiliates")
              .select("affiliate_id")
              .eq("partner_code", partner.partner_code)
              .maybeSingle();
            if (fetchErr) {
              await logToSupabase("error", "Failed to fetch affiliate after upsert", { partner: partner.partner_code, error: fetchErr.message });
              throw fetchErr;
            }
            affiliate_id = existingAff?.affiliate_id;
          }
        }

        if (!affiliate_id) {
          await logToSupabase("error", "Missing affiliate_id after attempts", { partner: partner.partner_code });
          throw new Error(`Missing affiliate_id for partner ${partner.partner_code}`);
        }

        linksToInsert.push({
          destination_slug: slug,
          affiliate_id,
          partner_code: partner.partner_code,
          deep_link: partner.deep_link,
          metadata: { city: city || null, country: country || null },
          variant: partner.variant || "default",
        });
      } catch (loopErr) {
        await logToSupabase("error", "Skipping partner due to error", { partner: partner.partner_code, error: loopErr.message });
      }
    }

    if (linksToInsert.length === 0) {
      await logToSupabase("warn", "No partner links prepared for upsert", { slug, name });
      return {
        statusCode: 200,
        body: JSON.stringify({
          status: "ok",
          message: `No affiliate links prepared for ${name}. Check logs.`,
          partners_prepared: allPartnersData.length,
          partners_upserted: 0,
          debug: debug ? { allPartnersData, templateMisses } : undefined,
        }),
      };
    }

    // Upsert into partner_affiliate_links (preserves existing unique constraint on destination_slug, affiliate_id)
    try {
      const { error: upsertErr } = await supabase
        .from("partner_affiliate_links")
        .upsert(linksToInsert, {
          onConflict: ["destination_slug", "affiliate_id"],
        });

      if (upsertErr) {
        await logToSupabase("error", "Upsert to partner_affiliate_links failed", { error: upsertErr.message });
        throw upsertErr;
      }
    } catch (upsertCatchErr) {
      await logToSupabase("error", "Upsert exception", { error: upsertCatchErr.message });
      throw upsertCatchErr;
    }

    await logToSupabase("info", "Affiliate links successfully inserted (v2)", { count: linksToInsert.length });

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        message: `Affiliate links generated for ${name}`,
        partners_prepared: allPartnersData.length,
        partners_upserted: linksToInsert.length,
        debug: debug ? { allPartnersData, templateMisses } : undefined,
      }),
    };
  } catch (err) {
    await logToSupabase("error", "Fatal error during affiliate link generation (v2)", { error: err.message, stack: err.stack });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
