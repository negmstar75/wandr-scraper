/**
 * utils/buildDeepLink.js
 * ----------------------------------------------------------
 * Deep-link builder for all partners.
 * - Robust flight defaults (never "undefined" dates)
 * - Strong IATA derivation (prevents "CIR" etc.)
 * - Correct TripAdvisor / Lonely Planet formats
 * - Expedia Flights explicit builder (matches your known-good format)
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
// ✈️ Local fallback resolvers (to avoid cross-module deps)
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

    destination_code: (() => {
      let code =
        mapping.destination_code ||
        mapping.iata_code ||
        resolveIataFromSlug(mapping.city_slug) ||
        (mapping.city_slug ? mapping.city_slug.slice(0, 3).toUpperCase() : "XXX");
      code = code.toString().toUpperCase().slice(0, 3);
      return code;
    })(),
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
      // Requires ISO2 lowercase in path
      let code = mapping.country_code;
      if (!code && mapping.city_slug) code = resolveIsoFromSlug(mapping.city_slug);
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
      // Needs both city + full country slug
      const alias = { baku: "baku-baki" };
      const citySlug = alias[mapping.city_slug] || mapping.city_slug;
      let countrySlug = mapping.country_slug || resolveCountrySlugFromCity(mapping.city_slug) || "";

      // Defensive: if still alpha2, degrade to 'country' (avoid 'us' paths)
      if (countrySlug && countrySlug.length === 2) {
        // last-resort map for common cases
        const a2map = { eg: "egypt", us: "united-states", gb: "united-kingdom", nl: "netherlands", de: "germany", es: "spain" };
        countrySlug = a2map[countrySlug.toLowerCase()] || countrySlug;
      }

      if (!citySlug || !countrySlug || countrySlug.length <= 2) {
        return wrapOut(base, "https://www.lonelyplanet.com/");
      }

      const target = `https://www.lonelyplanet.com/destinations/${countrySlug}/${citySlug}`;
      return wrapOut(base, target);
    }

    case "aviasales": {
      const iataMap = {
        "cape-town": "CPT",
        reykjavik: "REK",
        berlin: "BER",
        madrid: "MAD",
        amsterdam: "AMS",
        baku: "GYD",
        cairo: "CAI",
      };

      let destIata =
        iataMap[mapping.city_slug?.toLowerCase()] ||
        mapping.iata_code ||
        resolveIataFromSlug(mapping.city_slug) ||
        (mapping.city_slug ? mapping.city_slug.slice(0, 3).toUpperCase() : "XXX");

      destIata = destIata.toUpperCase().substring(0, 3);

      const originFinal = resolved.origin_code;

      const flightPath = `${originFinal}${e.depart_ddmm}${destIata}${e.return_ddmm}1`;
      const aviasalesUrl = `https://www.aviasales.com/search/${flightPath}`;
      return wrapOut(base, aviasalesUrl);
    }

    case "cheapoair": {
      const originIata = resolved.origin_code;
      const iataMap = {
        "cape-town": "CPT",
        reykjavik: "REK",
        berlin: "BER",
        madrid: "MAD",
        amsterdam: "AMS",
        baku: "GYD",
        cairo: "CAI",
      };

      let destIata =
        iataMap[mapping.city_slug?.toLowerCase()] ||
        mapping.iata_code ||
        resolveIataFromSlug(mapping.city_slug) ||
        (mapping.city_slug ? mapping.city_slug.slice(0, 3).toUpperCase() : "XXX");

      destIata = destIata.toUpperCase().substring(0, 3);

      const url = `https://www.cheapoair.com/air/listing?&d1=${originIata}&r1=${destIata}&dt1=${e.depart_mm_dd_yyyy}&dtype1=A&rtype1=A&d2=${destIata}&r2=${originIata}&dt2=${e.return_mm_dd_yyyy}&dtype2=A&rtype2=A&tripType=ROUNDTRIP`;
      return wrapOut(base, url);
    }

    case "expedia_flights": {
      // Match your known-good format with rich labels
      const originIata = resolved.origin_code; // e.g., LON
      const destIata =
        (mapping.iata_code || resolveIataFromSlug(mapping.city_slug) || "XXX")
          .toString().toUpperCase().slice(0, 3);

      const originCity = titleCase(mapping.origin_city || "London");
      const destCity = titleCase(mapping.destination_city || mapping.city_slug || "Destination");

      const originLabel =
        originIata === "LON" ? `${originCity} (LON-All Airports)` : `${originCity} (${originIata})`;
      // Known special for Cairo
      const destinationLabel =
        destIata === "CAI" ? `${destCity} (CAI - Cairo Intl.)` : `${destCity} (${destIata})`;

      // Dates already formatted in e.*
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
      const originIata = resolved.origin_code;
      let destIata =
        mapping.iata_code ||
        resolveIataFromSlug(mapping.city_slug) ||
        (mapping.city_slug ? mapping.city_slug.slice(0, 3).toUpperCase() : "XXX");

      destIata = destIata.toUpperCase().substring(0, 3);
      const url = `https://booking.kayak.com/flights/${originIata}-${destIata}/${e.depart_yyyy_mm_dd}/${e.return_yyyy_mm_dd}`;
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
