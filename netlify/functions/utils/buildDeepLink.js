/**
 * utils/buildDeepLink.js
 * ----------------------------------------------------------
 * Deep-link builder for all partners.
 * - No fake IATA slicing (prevents "CIR")
 * - Keeps robust dates defaults
 * - Correct TA / LP structures
 * - Expedia Flights explicit format (your known-good link)
 */

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatDateParts(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  return {
    yyyy_mm_dd: `${yyyy}-${mm}-${dd}`,
    mm_dd_yyyy: `${mm}/${dd}/${yyyy}`,
    ddmm: `${dd}${mm}`,
    mmdd: `${mm}${dd}`,
  };
}

function getFlightRange() {
  const depart = formatDateParts(7);
  const ret = formatDateParts(14);
  return {
    depart_iso: depart.yyyy_mm_dd,
    return_iso: ret.yyyy_mm_dd,
    depart_mm_dd_yyyy: depart.mm_dd_yyyy,
    return_mm_dd_yyyy: ret.mm_dd_yyyy,
    depart_ddmm: depart.ddmm,
    return_ddmm: ret.ddmm,
    depart_mmdd: depart.mmdd,
    return_mmdd: ret.mmdd,
    depart_yyyy_mm_dd: depart.yyyy_mm_dd,
    return_yyyy_mm_dd: ret.yyyy_mm_dd,
  };
}

function safeVal(v) {
  if (v === undefined || v === null) return "";
  return String(v);
}

function titleCase(s) {
  if (!s) return s;
  return s
    .toString()
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function applyTemplate(template = "", mapping = {}, extras = {}, context = {}) {
  if (!template) return "";

  const vars = {
    city_slug: safeVal(mapping.city_slug),
    country_slug: safeVal(mapping.country_slug),
    country_code: safeVal(mapping.country_code),
    geo_id: safeVal(mapping.geo_id),
    prefixed_geo_id: safeVal(mapping.prefixed_geo_id),
    origin: safeVal(context.origin || mapping.origin || mapping.origin_city),
    origin_code: safeVal(context.origin_code || mapping.origin_code),
    origin_city: safeVal(context.origin_city || mapping.origin_city),
    destination: safeVal(mapping.destination || mapping.city_slug),
    destination_code: safeVal(mapping.destination_code),
    destination_city: safeVal(context.destination_city || mapping.destination_city || mapping.city_slug),
    depart: safeVal(extras.depart_iso),
    return: safeVal(extras.return_iso),
    depart_mm_dd_yyyy: safeVal(extras.depart_mm_dd_yyyy),
    return_mm_dd_yyyy: safeVal(extras.return_mm_dd_yyyy),
    depart_ddmm: safeVal(extras.depart_ddmm),
    return_ddmm: safeVal(extras.return_ddmm),
    depart_yyyy_mm_dd: safeVal(extras.depart_yyyy_mm_dd),
    return_yyyy_mm_dd: safeVal(extras.return_yyyy_mm_dd),
    adults: safeVal(extras.adults || 2),
    slug: safeVal(mapping.override_slug || mapping.city_slug || mapping.country_slug),
  };

  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

function wrapTpLink(baseUrl, targetUrl) {
  if (!baseUrl) return targetUrl;
  const encodedTarget = encodeURIComponent(targetUrl);
  if (/[?&]u=/.test(baseUrl)) {
    return baseUrl.replace(/([?&]u=)([^&]*)/, `$1${encodedTarget}`);
  }
  return baseUrl.includes("?")
    ? `${baseUrl}&u=${encodedTarget}`
    : `${baseUrl}?u=${encodedTarget}`;
}

// ----------------------------------------------------------
// ✈️ Local fallback resolvers (limited; no fake slice)
// ----------------------------------------------------------
function resolveIsoFromSlug(slug) {
  const map = {
    cairo: "EG",
    madrid: "ES",
    berlin: "DE",
    amsterdam: "NL",
    "cape-town": "ZA",
    baku: "AZ",
    reykjavik: "IS",
  };
  return map[slug?.toLowerCase()] || null;
}

function resolveIataFromSlug(slug) {
  const map = {
    cairo: "CAI",
    madrid: "MAD",
    berlin: "BER",
    amsterdam: "AMS",
    "cape-town": "CPT",
    baku: "GYD",
    reykjavik: "REK",
  };
  return map[slug?.toLowerCase()] || null;
}

function resolveCountrySlugFromCity(citySlug) {
  const map = {
    cairo: "egypt",
    madrid: "spain",
    berlin: "germany",
    amsterdam: "netherlands",
    "cape-town": "south-africa",
    baku: "azerbaijan",
    reykjavik: "iceland",
  };
  return map[citySlug?.toLowerCase()] || null;
}

// Alpha2 → long slug helper for LP safety
const COUNTRY_SLUG_FROM_A2 = {
  EG: "egypt",
  US: "united-states-of-america",
  GB: "united-kingdom",
  NL: "netherlands",
  DE: "germany",
  ES: "spain",
  AZ: "azerbaijan",
  ZA: "south-africa",
  IS: "iceland",
};

// ----------------------------------------------------------
// 🔗 Core deep link builder
// ----------------------------------------------------------
function buildDeepLink(partner, mapping, extras = {}, context = {}) {
  const base = partner.base_url || "";
  const template = partner.template_url || "";
  const partnerNeedsOrigin = [
    "aviasales",
    "expedia_flights",
    "booking_kayak",
    "cheapoair",
  ].includes(partner.partner_code);

  // ✅ Ensure flight dates always exist
  const flightDefaults = getFlightRange();
  const e = { adults: 1, ...flightDefaults, ...extras };

  // ✅ Normalize mapping safety
  mapping.city_slug = mapping.city_slug || mapping.country_slug || "none";
  mapping.country_slug = mapping.country_slug || "";
  mapping.country_code = mapping.country_code || resolveIsoFromSlug(mapping.city_slug) || "XX";

  // Compute dependable IATA (no slicing fallback)
  const resolvedDestIata =
    (mapping.destination_code && String(mapping.destination_code).toUpperCase()) ||
    (mapping.iata_code && String(mapping.iata_code).toUpperCase()) ||
    (resolveIataFromSlug(mapping.city_slug) || null);

  const resolved = {
    origin_code:
      (context.origin_code || mapping.origin_code || process.env.DEFAULT_ORIGIN_CODE || "LON")
        .toString()
        .slice(0, 3)
        .toUpperCase(),
    origin_city:
      context.origin_city ||
      mapping.origin_city ||
      context.origin ||
      mapping.origin ||
      "London",

    destination_code: resolvedDestIata, // may be null → certain partners will skip
    destination_city:
      mapping.destination_city || mapping.city_slug || mapping.override_slug,
  };

  if (partnerNeedsOrigin && !resolved.origin_code) {
    resolved.origin_code = "LON";
  }

  const rawTarget = mapping.override_url
    ? applyTemplate(mapping.override_url, mapping, e, resolved)
    : applyTemplate(template, mapping, e, resolved);

  switch (partner.partner_code) {
    case "booking_stays": {
      const slug = mapping.city_slug || mapping.destination_city || "";
      const countryPart = mapping.country_slug ? `,+${mapping.country_slug}` : "";
      const baseTarget = `https://www.booking.com/searchresults.html?ss=${slug}${countryPart}`;
      const url = rawTarget || baseTarget;
      return wrapOut(base, url);
    }

    case "booking_attractions": {
      // Requires ISO2 lowercase in path; must exist
      let code = mapping.country_code || resolveIsoFromSlug(mapping.city_slug);
      const codeLower = (code || "XX").toLowerCase();
      const url = `https://www.booking.com/attractions/searchresults/${codeLower}/${mapping.city_slug}.html`;
      return wrapOut(base, url);
    }

    case "gocity": {
      if (!mapping.id) return { deep_link: null, rawTarget: null, encodedTarget: null };
      const url = `https://gocity.com/en/${mapping.city_slug}`;
      return wrapOut(base, url);
    }

    case "elsewhere": {
      if (!mapping.id) return { deep_link: null, rawTarget: null, encodedTarget: null };
      const urlBase = `https://www.elsewhere.io/${mapping.country_slug}`;
      const tracking =
        "?sca_ref=5103006.jxkDNNdC6D&utm_source=affiliate&utm_medium=affiliate&utm_campaign=affiliate";
      return wrapOut(base, urlBase + tracking);
    }

    case "lonelyplanet": {
      // Needs both city + full country slug (never alpha2)
      const alias = { baku: "baku-baki" };
      const citySlug = alias[mapping.city_slug] || mapping.city_slug;

      let countrySlug = mapping.country_slug || resolveCountrySlugFromCity(mapping.city_slug) || "";
      if (countrySlug && countrySlug.length === 2) {
        countrySlug = COUNTRY_SLUG_FROM_A2[countrySlug.toUpperCase()] || countrySlug;
      }

      // If still missing or alpha-like -> fail to homepage
      if (!citySlug || !countrySlug || countrySlug.length <= 2) {
        return wrapOut(base, "https://www.lonelyplanet.com/");
      }

      const target = `https://www.lonelyplanet.com/destinations/${countrySlug}/${citySlug}`;
      return wrapOut(base, target);
    }

    case "aviasales": {
      // Require a valid destination IATA; if absent, skip link
      if (!resolved.destination_code) {
        return { deep_link: null, rawTarget: null, encodedTarget: null };
      }
      const flightPath = `${resolved.origin_code}${e.depart_ddmm}${resolved.destination_code}${e.return_ddmm}1`;
      const aviasalesUrl = `https://www.aviasales.com/search/${flightPath}`;
      return wrapOut(base, aviasalesUrl);
    }

    case "cheapoair": {
      if (!resolved.destination_code) {
        return { deep_link: null, rawTarget: null, encodedTarget: null };
      }
      const url = `https://www.cheapoair.com/air/listing?&d1=${resolved.origin_code}&r1=${resolved.destination_code}&dt1=${e.depart_mm_dd_yyyy}&dtype1=A&rtype1=A&d2=${resolved.destination_code}&r2=${resolved.origin_code}&dt2=${e.return_mm_dd_yyyy}&dtype2=A&rtype2=A&tripType=ROUNDTRIP`;
      return wrapOut(base, url);
    }

    case "expedia_flights": {
      // Build “known-good” format with readable labels
      if (!resolved.destination_code) {
        return { deep_link: null, rawTarget: null, encodedTarget: null };
      }
      const originIata = resolved.origin_code; // e.g., LON
      const destIata = resolved.destination_code; // e.g., CAI

      const originCity = titleCase(mapping.origin_city || "London");
      const destCity = titleCase(mapping.destination_city || mapping.city_slug || "Destination");

      const originLabel =
        originIata === "LON" ? `${originCity} (LON-All Airports)` : `${originCity} (${originIata})`;

      const destinationLabel =
        destIata === "CAI" ? `${destCity} (CAI - Cairo Intl.)` : `${destCity} (${destIata})`;

      const url =
        `https://www.expedia.com/Flights-Search?` +
        `leg1=from:${encodeURIComponent(originLabel)},to:${encodeURIComponent(destinationLabel)},departure:${encodeURIComponent(e.depart_mm_dd_yyyy)}TANYT,fromType:U,toType:U` +
        `&leg2=from:${encodeURIComponent(destinationLabel)},to:${encodeURIComponent(originLabel)},departure:${encodeURIComponent(e.return_mm_dd_yyyy)}TANYT,fromType:U,toType:U` +
        `&mode=search` +
        `&options=${encodeURIComponent("carrier:,cabinclass:,maxhops:1,nopenalty:N")}` +
        `&pageId=0` +
        `&passengers=${encodeURIComponent("adults:1,children:0,infantinlap:N")}` +
        `&trip=roundtrip`;

      return wrapOut(base, url);
    }

    case "booking_kayak": {
      if (!resolved.destination_code) {
        return { deep_link: null, rawTarget: null, encodedTarget: null };
      }
      const url = `https://booking.kayak.com/flights/${resolved.origin_code}-${resolved.destination_code}/${e.depart_yyyy_mm_dd}/${e.return_yyyy_mm_dd}`;
      return { deep_link: url, rawTarget: url, encodedTarget: encodeURIComponent(url) };
    }

    case "tripadvisor_attractions":
    case "tripadvisor_hotels":
    case "tripadvisor_restaurants": {
      const type = partner.partner_code.replace("tripadvisor_", "");
      const slug = mapping.city_slug;

      let url;
      if (!mapping.prefixed_geo_id) {
        switch (type) {
          case "attractions":
            url = `https://www.tripadvisor.com/Attractions--Activities-${slug}.html`;
            break;
          case "hotels":
            url = `https://www.tripadvisor.com/Hotels--${slug}-Hotels.html`;
            break;
          case "restaurants":
            url = `https://www.tripadvisor.com/Restaurants--${slug}.html`;
            break;
          default:
            url = `https://www.tripadvisor.com/Search?q=${slug}`;
        }
      } else {
        switch (type) {
          case "attractions":
            url = `https://www.tripadvisor.com/Attractions-${mapping.prefixed_geo_id}-Activities-${slug}.html`;
            break;
          case "hotels":
            url = `https://www.tripadvisor.com/Hotels-${mapping.prefixed_geo_id}-Hotels-${slug}.html`;
            break;
          case "restaurants":
            url = `https://www.tripadvisor.com/Restaurants-${mapping.prefixed_geo_id}-${slug}.html`;
            break;
          default:
            url = `https://www.tripadvisor.com/Search?q=${slug}`;
        }
      }

      return wrapOut(base, url);
    }

    case "getyourguide": {
      const slug = mapping.city_slug;
      if (!slug) return wrapOut(base, base || "https://www.getyourguide.com/");
      const url = `https://www.getyourguide.com/s/?q=${slug}`;
      return wrapOut(base, url);
    }

    default:
      return wrapOut(base, rawTarget || template || base);
  }

  function wrapOut(b, target) {
    const encoded = encodeURIComponent(target);
    const deep_link = wrapTpLink(b, target);
    return { deep_link, rawTarget: target, encodedTarget: encoded };
  }
}

module.exports = { buildDeepLink };
