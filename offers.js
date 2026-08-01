const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT-fHyp6kmJa2YBev9aXK4XmESfonNQHypa2he-MUotaVlNK2xBVTSebI7UyYSuVs3AnwIRU_E50qcL/pub?gid=1286876821&single=true&output=csv";

const OFFERS_CACHE_KEY = "mazuryland-offers-csv-v2";
const FETCH_TIMEOUT_MS = 12000;
const FETCH_RETRIES = 2;

const CATEGORY_IMAGES = {
  "Działki budowlane": "images/budowlane.jpg",
  "Działki rolne powyżej 3000 m²": "images/rolne.jpg",
  "Kameralne osady": "images/osady.jpg",
  "Działki z linią brzegową": "images/linia-brzegowa.jpg",
  "Grunty inwestycyjne": "images/inwestycyjne.jpg",
  "Duże areały": "images/arealy.jpg"
};

const CATEGORY_ALIASES = new Map([
  ["działki budowlane", "Działki budowlane"],
  ["tereny pod zabudowę", "Działki budowlane"],

  ["działki rolne powyżej 3000 m²", "Działki rolne powyżej 3000 m²"],
  ["działki rolne powyżej 3000m²", "Działki rolne powyżej 3000 m²"],
  ["grunty z warunkami zabudowy powyżej 3000 m²", "Działki rolne powyżej 3000 m²"],
  ["grunty z warunkami zabudowy powyżej 3000m²", "Działki rolne powyżej 3000 m²"],
  ["grunty z warunkami zabudowy pow. 3000 m²", "Działki rolne powyżej 3000 m²"],
  ["grunty z warunkami zabudowy pow. 3000m²", "Działki rolne powyżej 3000 m²"],

  ["kameralne osady", "Kameralne osady"],
  ["osady", "Kameralne osady"],

  ["działki z linią brzegową", "Działki z linią brzegową"],
  ["linia brzegowa", "Działki z linią brzegową"],

  ["grunty inwestycyjne", "Grunty inwestycyjne"],
  ["działki inwestycyjne", "Grunty inwestycyjne"],

  ["duże areały", "Duże areały"]
]);


/* =====================================================
   NORMALIZOWANIE TEKSTU
===================================================== */

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, " ")
    .trim();
}


function normalizeMultilineText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}


function normalizeKey(value) {
  return normalizeText(value).toLocaleLowerCase("pl-PL");
}


function normalizeCategory(value) {
  const cleanValue = normalizeText(value);

  return (
    CATEGORY_ALIASES.get(normalizeKey(cleanValue)) ||
    cleanValue
  );
}


/* =====================================================
   BEZPIECZEŃSTWO TEKSTU
===================================================== */

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function escapeAttribute(value) {
  return escapeHTML(value).replaceAll("`", "&#096;");
}


/* =====================================================
   CSV
===================================================== */

function parseCSV(text) {
  const rows = [];

  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      value += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(value);
      value = "";
    } else if (
      (char === "\n" || char === "\r") &&
      !insideQuotes
    ) {
      if (value || row.length) {
        row.push(value);
        rows.push(row);

        row = [];
        value = "";
      }

      if (char === "\r" && next === "\n") {
        i++;
      }
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}


function simpleHash(value) {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}


function slugify(value) {
  return normalizeText(value)
    .toLocaleLowerCase("pl-PL")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}


function csvToObjects(csvText) {
  const rows = parseCSV(csvText);

  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map(normalizeKey);

  return rows.slice(1).map((row, index) => {
    const obj = {};

    headers.forEach((header, columnIndex) => {
      const rawValue = row[columnIndex] || "";

      const preserveLineBreaks = [
        "najważniejsze informacje",
        "opis"
      ].includes(header);

      obj[header] = preserveLineBreaks
        ? normalizeMultilineText(rawValue)
        : normalizeText(rawValue);
    });

    const title = getValue(obj, [
      "Nazwa oferty"
    ]);

    const location = getValue(obj, [
      "Miejscowość / gmina"
    ]);

    const timestamp = getValue(obj, [
      "Sygnatura czasowa",
      "Znacznik czasu",
      "Timestamp"
    ]);

    const seed =
      timestamp ||
      `${title}|${location}`;

    const slug =
      slugify(title) ||
      "oferta";

    obj._id =
      `${slug}-${simpleHash(seed || String(index))}`;

    obj._legacyId =
      `oferta-${index + 1}`;

    return obj;
  });
}


function getValue(offer, possibleNames) {
  for (const name of possibleNames) {
    const value = offer[normalizeKey(name)];

    if (value) {
      return value;
    }
  }

  return "";
}


/* =====================================================
   ZDJĘCIA — GOOGLE DRIVE I FALLBACKI
===================================================== */

function getGoogleDriveId(url) {
  if (!url) {
    return "";
  }

  const cleanUrl = String(url).trim();

  if (
    /\/drive\/folders\//i.test(cleanUrl) ||
    /\/folders\//i.test(cleanUrl)
  ) {
    return "";
  }

  const queryMatch =
    cleanUrl.match(/[?&]id=([^&]+)/i);

  if (queryMatch) {
    return queryMatch[1];
  }

  const fileMatch =
    cleanUrl.match(/\/file\/d\/([^/]+)/i);

  if (fileMatch) {
    return fileMatch[1];
  }

  const thumbnailMatch =
    cleanUrl.match(/\/thumbnail\?.*?[?&]id=([^&]+)/i);

  if (thumbnailMatch) {
    return thumbnailMatch[1];
  }

  return "";
}


function cleanImageLink(value) {
  const link = normalizeText(value)
    .replace(/^['"]|['"]$/g, "")
    .replace(/[),;]+$/g, "");

  if (!/^https?:\/\//i.test(link)) {
    return "";
  }

  if (
    /\/drive\/folders\//i.test(link) ||
    /\/folders\//i.test(link)
  ) {
    return "";
  }

  return link;
}


function createImageSource(url) {
  const cleanUrl = cleanImageLink(url);

  if (!cleanUrl) {
    return null;
  }

  const driveId =
    getGoogleDriveId(cleanUrl);

  if (driveId) {
    const safeId =
      encodeURIComponent(driveId);

    return {
      key: `drive:${driveId}`,
      original: cleanUrl,

      candidates: [
        `https://drive.google.com/thumbnail?id=${safeId}&sz=w1600`,
        `https://drive.google.com/uc?export=view&id=${safeId}`
      ]
    };
  }

  return {
    key: cleanUrl,
    original: cleanUrl,
    candidates: [cleanUrl]
  };
}


function getImageSourcesFromCell(value) {
  if (!value) {
    return [];
  }

  const links = String(value)
    .split(/,\s*(?=https?:\/\/)|\n+/i)
    .map(cleanImageLink)
    .filter(Boolean);

  const sources = [];
  const usedKeys = new Set();

  links.forEach(link => {
    const source =
      createImageSource(link);

    if (
      source &&
      !usedKeys.has(source.key)
    ) {
      sources.push(source);
      usedKeys.add(source.key);
    }
  });

  return sources;
}


function localImageSource(path) {
  return {
    key: `local:${path}`,
    original: path,
    candidates: [path]
  };
}


function uniqueCandidates(sources) {
  const result = [];
  const used = new Set();

  sources.forEach(source => {
    if (!source) {
      return;
    }

    source.candidates.forEach(candidate => {
      if (
        candidate &&
        !used.has(candidate)
      ) {
        result.push(candidate);
        used.add(candidate);
      }
    });
  });

  return result;
}


window.MazurylandImages = {
  next(image) {
    let fallbacks = [];

    try {
      fallbacks = JSON.parse(
        image.dataset.fallbacks || "[]"
      );
    } catch (error) {
      console.warn(
        "Nieprawidłowa lista zdjęć zapasowych:",
        error
      );
    }

    const currentIndex = Number(
      image.dataset.fallbackIndex || "0"
    );

    const nextSource =
      fallbacks[currentIndex];

    if (nextSource) {
      image.dataset.fallbackIndex =
        String(currentIndex + 1);

      image.src = nextSource;

      return;
    }

    image.onerror = null;

    image.classList.add(
      "image-load-failed"
    );

    if (
      image.dataset.hideOnFail === "true"
    ) {
      const thumbnail =
        image.closest(".offer-gallery-thumb");

      if (thumbnail) {
        thumbnail.hidden = true;
      }
    }
  }
};


function imageAttributes(
  sources,
  options = {}
) {
  const candidates =
    uniqueCandidates(sources);

  const [
    firstSource = "images/hero.jpg",
    ...fallbacks
  ] = candidates;

  const loading =
    options.loading || "lazy";

  const priority =
    options.priority
      ? ' fetchpriority="high"'
      : "";

  const hideOnFail =
    options.hideOnFail
      ? ' data-hide-on-fail="true"'
      : "";

  return [
    `src="${escapeAttribute(firstSource)}"`,

    `data-fallbacks="${escapeAttribute(
      JSON.stringify(fallbacks)
    )}"`,

    'data-fallback-index="0"',

    `loading="${loading}"`,

    'decoding="async"',

    'referrerpolicy="no-referrer"',

    'onerror="window.MazurylandImages.next(this)"',

    hideOnFail,

    priority
  ]
    .filter(Boolean)
    .join(" ");
}


/* =====================================================
   FORMATOWANIE
===================================================== */

function formatArea(value) {
  if (!value) {
    return "";
  }

  let area = normalizeText(value)
    .replace(/m\s*\^?\s*2/gi, "m²")
    .replace(/(\d)\s*-\s*(\d)/g, "$1–$2")
    .replace(/\s*,\s*/g, ", ")
    .replace(
      /(\d)\s*(m²|ha|ar)\b/gi,
      "$1 $2"
    );

  const hasUnit =
    /m²|\bha\b|\bar\b/i.test(area);

  if (!hasUnit) {
    area += " m²";
  }

  return area;
}


function formatPrice(value) {
  if (!value) {
    return "";
  }

  let price = normalizeText(value)
    .replace(/m\s*\^?\s*2/gi, "m²")
    .replace(
      /\s*zł\s*\/\s*m²/gi,
      " zł/m²"
    )
    .replace(
      /(\d)\s*zł/gi,
      "$1 zł"
    )
    .replace(/\s+/g, " ");

  if (/^[\d\s.,]+$/.test(price)) {
    price += " zł";
  }

  return price;
}


function linkifyText(value) {
  const escaped =
    escapeHTML(value);

  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">Otwórz link</a>'
  );
}


/* =====================================================
   DANE OFERTY
===================================================== */

function getOfferData(offer) {
  const categoryRaw =
    getValue(offer, [
      "Kategoria"
    ]);

  const category =
    normalizeCategory(categoryRaw);

  const title =
    getValue(offer, [
      "Nazwa oferty"
    ]);

  const location =
    getValue(offer, [
      "Miejscowość / gmina",
      "Lokalizacja"
    ]);

  const areaRaw =
    getValue(offer, [
      "Powierzchnia"
    ]);

  const priceRaw =
    getValue(offer, [
      "Cena"
    ]);

  const status =
    getValue(offer, [
      "Status oferty",
      "Status"
    ]);

  const info =
    getValue(offer, [
      "Najważniejsze informacje",
      "Opis"
    ]);

  const mainImageRaw =
    getValue(offer, [
      "Główne zdjęcie oferty",
      "Zdjęcie główne oferty",
      "Główne zdjęcie",
      "Link do zdjęcia głównego",
      "Link do zdjęcia"
    ]);

  const galleryRaw =
    getValue(offer, [
      "Zdjęcia działki",
      "Zdjęcia",
      "Galeria"
    ]);

  const fallbackPath =
    CATEGORY_IMAGES[category] ||
    "images/hero.jpg";

  const fallbackSource =
    localImageSource(fallbackPath);

  const mainSources =
    getImageSourcesFromCell(mainImageRaw);

  const gallerySources =
    getImageSourcesFromCell(galleryRaw);

  const primarySource =
    mainSources[0] ||
    gallerySources[0] ||
    fallbackSource;

  const gallery = [];
  const usedKeys = new Set();

  [
    primarySource,
    ...gallerySources
  ].forEach(source => {
    if (
      source &&
      !usedKeys.has(source.key)
    ) {
      gallery.push(source);
      usedKeys.add(source.key);
    }
  });

  return {
    id: offer._id,
    legacyId: offer._legacyId,
    category,
    title,
    location,
    area: formatArea(areaRaw),
    price: formatPrice(priceRaw),
    status,
    info,
    primarySource,
    gallery,
    fallbackSource,

    cardSources: [
      primarySource,
      ...gallerySources,
      fallbackSource
    ]
  };
}


/* =====================================================
   KARTA OFERTY
===================================================== */

function renderOfferCard(offer) {
  const data =
    getOfferData(offer);

  const detailUrl =
    `oferta.html?id=${encodeURIComponent(data.id)}`;

  return `
    <article class="auto-offer-card">

      <a
        href="${detailUrl}"
        class="auto-offer-image"
        aria-label="Zobacz ofertę: ${escapeAttribute(data.title)}"
      >
        <img
          ${imageAttributes(data.cardSources)}
          alt="${escapeAttribute(data.title)}"
        >
      </a>

      <div class="auto-offer-content">

        <div class="auto-offer-top">

          <span>
            ${escapeHTML(data.category)}
          </span>

          ${
            data.status
              ? `<strong>${escapeHTML(data.status)}</strong>`
              : ""
          }

        </div>

        <h3>
          ${escapeHTML(data.title)}
        </h3>

        ${
          data.location
            ? `
              <p class="auto-offer-location">
                ${escapeHTML(data.location)}
              </p>
            `
            : ""
        }

        <div class="auto-offer-details">

          ${
            data.area
              ? `<span>📐 ${escapeHTML(data.area)}</span>`
              : ""
          }

          ${
            data.price
              ? `<span>💰 ${escapeHTML(data.price)}</span>`
              : ""
          }

        </div>

        <a
          href="${detailUrl}"
          class="auto-offer-link"
        >
          Zobacz ofertę
        </a>

      </div>

    </article>
  `;
}


/* =====================================================
   GALERIA
===================================================== */

function renderGallery(data) {
  const gallerySources =
    data.gallery.length
      ? data.gallery
      : [data.fallbackSource];

  const mainFallbackSources = [
    ...gallerySources,
    data.fallbackSource
  ];

  const thumbnails = gallerySources
    .map((source, index) => {
      const candidates = [
        source,
        data.fallbackSource
      ];

      return `
        <button
          type="button"
          class="offer-gallery-thumb${index === 0 ? " is-active" : ""}"
          data-source="${escapeAttribute(
            JSON.stringify(
              uniqueCandidates(candidates)
            )
          )}"
          aria-label="Pokaż zdjęcie ${index + 1}"
          aria-pressed="${index === 0 ? "true" : "false"}"
        >

          <img
            ${imageAttributes(
              candidates,
              {
                hideOnFail: true
              }
            )}
            alt="${escapeAttribute(data.title)} — zdjęcie ${index + 1}"
          >

        </button>
      `;
    })
    .join("");

  return `
    <div class="offer-gallery">

      <div class="offer-detail-photo">

        <img
          id="offer-main-image"
          ${imageAttributes(
            mainFallbackSources,
            {
              loading: "eager",
              priority: true
            }
          )}
          alt="${escapeAttribute(data.title)}"
        >

      </div>

      ${
        gallerySources.length > 1
          ? `
            <div class="offer-gallery-thumbs">
              ${thumbnails}
            </div>
          `
          : ""
      }

    </div>
  `;
}


function activateGallery() {
  const mainImage =
    document.querySelector(
      "#offer-main-image"
    );

  const thumbnails =
    document.querySelectorAll(
      ".offer-gallery-thumb"
    );

  if (
    !mainImage ||
    !thumbnails.length
  ) {
    return;
  }

  thumbnails.forEach(button => {
    button.addEventListener(
      "click",
      () => {
        let candidates = [];

        try {
          candidates = JSON.parse(
            button.dataset.source || "[]"
          );
        } catch (error) {
          console.warn(
            "Nie udało się odczytać zdjęcia galerii:",
            error
          );
        }

        if (!candidates.length) {
          return;
        }

        const [
          firstSource,
          ...fallbacks
        ] = candidates;

        mainImage.dataset.fallbacks =
          JSON.stringify(fallbacks);

        mainImage.dataset.fallbackIndex =
          "0";

        mainImage.classList.remove(
          "image-load-failed"
        );

        mainImage.src =
          firstSource;

        thumbnails.forEach(item => {
          item.classList.remove(
            "is-active"
          );

          item.setAttribute(
            "aria-pressed",
            "false"
          );
        });

        button.classList.add(
          "is-active"
        );

        button.setAttribute(
          "aria-pressed",
          "true"
        );
      }
    );
  });
}


/* =====================================================
   SZCZEGÓŁY OFERTY
===================================================== */

function findOfferById(
  offers,
  id
) {
  if (!id) {
    return null;
  }

  return (
    offers.find(
      item =>
        item._id === id ||
        item._legacyId === id
    ) ||
    null
  );
}


function updateOfferMetadata(data) {
  document.title =
    `${data.title} — Mazuryland`;

  const description =
    document.querySelector(
      'meta[name="description"]'
    );

  if (description) {
    description.setAttribute(
      "content",
      `${data.title}${
        data.location
          ? `, ${data.location}`
          : ""
      } — szczegóły oferty Mazuryland.`
    );
  }
}


function renderOfferDetail(offers) {
  const container =
    document.querySelector(
      "#offer-detail"
    );

  if (!container) {
    return;
  }

  const params =
    new URLSearchParams(
      window.location.search
    );

  const id =
    params.get("id");

  const offer =
    findOfferById(
      offers,
      id
    );

  if (!offer) {
    container.innerHTML = `
      <section class="offer-detail-section">

        <div class="container auto-offer-empty">

          <h1>
            Nie znaleziono oferty
          </h1>

          <p>
            Oferta mogła zostać usunięta albo link jest nieprawidłowy.
          </p>

          <a
            href="index.html#oferta"
            class="btn btn-primary"
          >
            Wróć do ofert
          </a>

        </div>

      </section>
    `;

    return;
  }

  const data =
    getOfferData(offer);

  updateOfferMetadata(data);

  const points = data.info
    .replace(
      /\s+(?=[-•]\s+)/g,
      "\n"
    )
    .split(/\n+/)
    .map(point =>
      point
        .replace(/^[-•]\s*/, "")
        .trim()
    )
    .filter(
      point =>
        point &&
        !/^najważniejsze informacje:?$/i.test(
          point
        )
    )
    .map(
      point =>
        `<li>${linkifyText(point)}</li>`
    )
    .join("");

  container.innerHTML = `
    <section class="offer-detail-section">

      <div class="container offer-detail-grid">

        ${renderGallery(data)}

        <aside class="offer-detail-panel">

          ${
            data.category
              ? `
                <span class="offer-detail-category">
                  ${escapeHTML(data.category)}
                </span>
              `
              : ""
          }

          <h1>
            ${escapeHTML(data.title)}
          </h1>

          <ul class="offer-detail-meta">

            ${
              data.location
                ? `
                  <li>
                    📍
                    <strong>Lokalizacja:</strong>
                    ${escapeHTML(data.location)}
                  </li>
                `
                : ""
            }

            ${
              data.area
                ? `
                  <li>
                    📐
                    <strong>Powierzchnia:</strong>
                    ${escapeHTML(data.area)}
                  </li>
                `
                : ""
            }

            ${
              data.price
                ? `
                  <li>
                    💰
                    <strong>Cena:</strong>
                    ${escapeHTML(data.price)}
                  </li>
                `
                : ""
            }

            ${
              data.status
                ? `
                  <li>
                    ✅
                    <strong>Status:</strong>
                    ${escapeHTML(data.status)}
                  </li>
                `
                : ""
            }

          </ul>

          ${
            points
              ? `
                <h2>
                  Najważniejsze informacje
                </h2>

                <ul class="offer-detail-points">
                  ${points}
                </ul>
              `
              : ""
          }

          <a
            href="index.html#kontakt"
            class="btn btn-primary"
          >
            Zapytaj o ofertę
          </a>

        </aside>

      </div>

    </section>
  `;

  activateGallery();
}


/* =====================================================
   CACHE
===================================================== */

function getCachedCSV() {
  try {
    const rawCache =
      localStorage.getItem(
        OFFERS_CACHE_KEY
      );

    if (!rawCache) {
      return "";
    }

    const cache =
      JSON.parse(rawCache);

    return typeof cache.csv === "string"
      ? cache.csv
      : "";
  } catch (error) {
    return "";
  }
}


function saveCachedCSV(csv) {
  try {
    localStorage.setItem(
      OFFERS_CACHE_KEY,

      JSON.stringify({
        csv,
        savedAt: Date.now()
      })
    );
  } catch (error) {
    // Brak dostępu do localStorage nie blokuje strony.
  }
}


/* =====================================================
   POBIERANIE ARKUSZA
===================================================== */

async function fetchCSVOnce() {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS
    );

  const separator =
    CSV_URL.includes("?")
      ? "&"
      : "?";

  const url =
    `${CSV_URL}${separator}cache=${Date.now()}`;

  try {
    const response =
      await fetch(
        url,
        {
          cache: "no-store",
          signal: controller.signal
        }
      );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const csv =
      await response.text();

    if (
      !csv ||
      !normalizeKey(
        csv.split(/\r?\n/, 1)[0]
      ).includes("nazwa oferty")
    ) {
      throw new Error(
        "Arkusz zwrócił nieprawidłowe dane"
      );
    }

    return csv;
  } finally {
    clearTimeout(timeout);
  }
}


async function fetchOffersCSV() {
  let lastError = null;

  for (
    let attempt = 0;
    attempt < FETCH_RETRIES;
    attempt++
  ) {
    try {
      const csv =
        await fetchCSVOnce();

      saveCachedCSV(csv);

      return {
        csv,
        fromCache: false
      };
    } catch (error) {
      lastError = error;

      if (
        attempt <
        FETCH_RETRIES - 1
      ) {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              700
            )
        );
      }
    }
  }

  const cachedCSV =
    getCachedCSV();

  if (cachedCSV) {
    console.warn(
      "Użyto ostatniej zapisanej wersji ofert:",
      lastError
    );

    return {
      csv: cachedCSV,
      fromCache: true
    };
  }

  throw (
    lastError ||
    new Error(
      "Nie udało się pobrać ofert"
    )
  );
}


/* =====================================================
   KOMUNIKATY ŁADOWANIA
===================================================== */

function renderLoadingState(container) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <p
      class="auto-offer-empty auto-offer-loading"
      role="status"
    >
      Ładowanie aktualnych ofert…
    </p>
  `;
}


function renderDetailLoading(container) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <section class="offer-detail-section">

      <div
        class="container auto-offer-empty auto-offer-loading"
        role="status"
      >
        Ładowanie szczegółów oferty…
      </div>

    </section>
  `;
}


function renderLoadError(container) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div
      class="auto-offer-empty"
      role="alert"
    >

      <p>
        Nie udało się teraz załadować ofert.
      </p>

      <button
        type="button"
        class="btn btn-primary"
        onclick="window.location.reload()"
      >
        Spróbuj ponownie
      </button>

    </div>
  `;
}


/* =====================================================
   WCZYTYWANIE OFERT
===================================================== */

async function loadOffers() {
  const listContainer =
    document.querySelector(
      "#offers-list"
    );

  const detailContainer =
    document.querySelector(
      "#offer-detail"
    );

  renderLoadingState(
    listContainer
  );

  renderDetailLoading(
    detailContainer
  );

  try {
    const { csv } =
      await fetchOffersCSV();

    const offers =
      csvToObjects(csv)
        .filter(
          offer =>
            getValue(
              offer,
              ["Nazwa oferty"]
            )
        );

    if (listContainer) {
      const currentCategory =
        normalizeCategory(
          listContainer.dataset.category ||
          ""
        );

      const filteredOffers =
        currentCategory
          ? offers.filter(
              offer =>
                normalizeCategory(
                  getValue(
                    offer,
                    ["Kategoria"]
                  )
                ) === currentCategory
            )
          : offers;

      if (!filteredOffers.length) {
        listContainer.innerHTML = `
          <p class="auto-offer-empty">
            Aktualnie brak ofert w tej kategorii.
          </p>
        `;
      } else {
        listContainer.innerHTML =
          filteredOffers
            .map(renderOfferCard)
            .join("");
      }
    }

    renderOfferDetail(offers);
  } catch (error) {
    console.error(
      "Błąd ładowania ofert:",
      error
    );

    renderLoadError(
      listContainer
    );

    if (detailContainer) {
      detailContainer.innerHTML = `
        <section class="offer-detail-section">

          <div
            class="container auto-offer-empty"
            role="alert"
          >

            <h1>
              Nie udało się załadować oferty
            </h1>

            <p>
              Sprawdź połączenie z internetem i spróbuj ponownie.
            </p>

            <button
              type="button"
              class="btn btn-primary"
              onclick="window.location.reload()"
            >
              Odśwież
            </button>

          </div>

        </section>
      `;
    }
  }
}


loadOffers();