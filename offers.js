const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT-fHyp6kmJa2YBev9aXK4XmESfonNQHypa2he-MUotaVlNK2xBVTSebI7UyYSuVs3AnwIRU_E50qcL/pub?gid=1286876821&single=true&output=csv";

const CATEGORY_IMAGES = {
  "Działki budowlane": "images/budowlane.jpg",
  "Działki rolne powyżej 3000 m²": "images/rolne.jpg",
  "Kameralne osady": "images/osady.jpg",
  "Działki z linią brzegową": "images/linia-brzegowa.jpg",
  "Grunty inwestycyjne": "images/inwestycyjne.jpg",
  "Duże areały": "images/arealy.jpg"
};


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
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
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


function csvToObjects(csvText) {
  const rows = parseCSV(csvText);

  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map(header => header.trim());

  return rows.slice(1).map((row, index) => {
    const obj = {};

    headers.forEach((header, i) => {
      obj[header] = row[i] ? row[i].trim() : "";
    });

    obj._id = `oferta-${index + 1}`;

    return obj;
  });
}


function getValue(offer, possibleNames) {
  for (const name of possibleNames) {
    if (offer[name]) {
      return offer[name];
    }
  }

  return "";
}


/* =====================================================
   GOOGLE DRIVE
===================================================== */

function getGoogleDriveId(url) {
  if (!url) {
    return "";
  }

  const openMatch = url.match(/[?&]id=([^&]+)/);

  if (openMatch) {
    return openMatch[1];
  }

  const fileMatch = url.match(/\/file\/d\/([^/]+)/);

  if (fileMatch) {
    return fileMatch[1];
  }

  const ucMatch = url.match(/\/d\/([^/]+)/);

  if (ucMatch) {
    return ucMatch[1];
  }

  return "";
}


function convertGoogleDriveImage(url) {
  const cleanUrl = url.trim();

  const id = getGoogleDriveId(cleanUrl);

  if (!id) {
    return cleanUrl;
  }

  return `https://drive.google.com/thumbnail?id=${id}&sz=w1600`;
}


function getImagesFromCell(value) {
  if (!value) {
    return [];
  }

  const links = value
    .split(/,\s*|\n+/)
    .map(link => link.trim())
    .filter(Boolean);

  return links.map(convertGoogleDriveImage);
}


/* =====================================================
   FORMATOWANIE
===================================================== */

function formatArea(value) {
  if (!value) {
    return "";
  }

  let area = value.trim();

  area = area
    .replace(/m\s*2/gi, "m²")
    .replace(/m\^2/gi, "m²")
    .replace(/(\d)\s*-\s*(\d)/g, "$1–$2");

  const hasUnit =
    /m²/i.test(area) ||
    /\bha\b/i.test(area) ||
    /\bar\b/i.test(area);

  if (!hasUnit) {
    area += " m²";
  }

  return area;
}


function formatPrice(value) {
  if (!value) {
    return "";
  }

  let price = value.trim();

  price = price
    .replace(/m\s*2/gi, "m²")
    .replace(/m\^2/gi, "m²")
    .replace(/\s*zł\s*\/\s*m²/gi, " zł/m²")
    .replace(/(\d)\s*zł/gi, "$1 zł")
    .replace(/\s+/g, " ");

  return price;
}


/* =====================================================
   DANE OFERTY
===================================================== */

function getOfferData(offer) {
  const category = getValue(offer, ["Kategoria"]);

  const title = getValue(offer, [
    "Nazwa oferty"
  ]);

  const location = getValue(offer, [
    "Miejscowość / gmina"
  ]);

  const areaRaw = getValue(offer, [
    "Powierzchnia"
  ]);

  const priceRaw = getValue(offer, [
    "Cena",
    "cena"
  ]);

  const status = getValue(offer, [
    "Status oferty"
  ]);

  const info = getValue(offer, [
    "Najważniejsze informacje"
  ]);

  const imagesRaw = getValue(offer, [
    "Zdjęcia działki",
    "Zdjęcia",
    "Link do zdjęcia głównego",
    "Link do zdjęcia",
    "link do zdjęcia"
  ]);

  const fallbackImage =
    CATEGORY_IMAGES[category] ||
    "images/hero.jpg";

  const images = getImagesFromCell(imagesRaw);

  return {
    id: offer._id,
    category,
    title,
    location,
    area: formatArea(areaRaw),
    price: formatPrice(priceRaw),
    status,
    info,
    images,
    image: images.length ? images[0] : fallbackImage,
    fallbackImage
  };
}


/* =====================================================
   KARTA OFERTY
===================================================== */

function renderOfferCard(offer) {
  const data = getOfferData(offer);

  return `
    <article class="auto-offer-card">

      <a
        href="oferta.html?id=${encodeURIComponent(data.id)}"
        class="auto-offer-image"
      >
        <img
          src="${data.image}"
          alt="${data.title}"
          onerror="this.onerror=null;this.src='${data.fallbackImage}'"
        >
      </a>

      <div class="auto-offer-content">

        <div class="auto-offer-top">
          <span>${data.category}</span>
          <strong>${data.status}</strong>
        </div>

        <h3>${data.title}</h3>

        <p class="auto-offer-location">
          ${data.location}
        </p>

        <div class="auto-offer-details">

          ${
            data.area
              ? `<span>📐 ${data.area}</span>`
              : ""
          }

          ${
            data.price
              ? `<span>💰 ${data.price}</span>`
              : ""
          }

        </div>

        <a
          href="oferta.html?id=${encodeURIComponent(data.id)}"
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
  if (!data.images.length) {
    return `
      <div class="offer-detail-photo">
        <img
          src="${data.fallbackImage}"
          alt="${data.title}"
        >
      </div>
    `;
  }

  const mainImage = data.images[0];

  const thumbnails = data.images
    .map((image, index) => {
      return `
        <button
          type="button"
          class="offer-gallery-thumb"
          data-image="${image}"
          aria-label="Zdjęcie ${index + 1}"
        >
          <img
            src="${image}"
            alt="${data.title} — zdjęcie ${index + 1}"
            onerror="this.style.display='none'"
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
          src="${mainImage}"
          alt="${data.title}"
          onerror="this.onerror=null;this.src='${data.fallbackImage}'"
        >

      </div>

      ${
        data.images.length > 1
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


/* =====================================================
   SZCZEGÓŁY OFERTY
===================================================== */

function renderOfferDetail(offers) {
  const container =
    document.querySelector("#offer-detail");

  if (!container) {
    return;
  }

  const params =
    new URLSearchParams(window.location.search);

  const id =
    params.get("id");

  const offer =
    offers.find(item => item._id === id);

  if (!offer) {

    container.innerHTML = `
      <div class="container">
        <h1>Nie znaleziono oferty</h1>

        <p>
          Oferta mogła zostać usunięta
          albo link jest nieprawidłowy.
        </p>

        <a
          href="index.html"
          class="btn btn-primary"
        >
          Wróć na stronę główną
        </a>
      </div>
    `;

    return;
  }


  const data =
    getOfferData(offer);


  const points =
    data.info
      .split("\n")
      .filter(point => point.trim())
      .map(point => {

        const cleanPoint =
          point
            .replace(/^[-•]\s*/, "")
            .trim();

        return `<li>${cleanPoint}</li>`;

      })
      .join("");


  container.innerHTML = `

    <section class="offer-detail-section">

      <div class="container offer-detail-grid">

        ${renderGallery(data)}

        <aside class="offer-detail-panel">

          <span class="offer-detail-category">
            ${data.category}
          </span>

          <h1>
            ${data.title}
          </h1>


          <ul class="offer-detail-meta">

            ${
              data.location
                ? `
                  <li>
                    📍
                    <strong>Lokalizacja:</strong>
                    ${data.location}
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
                    ${data.area}
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
                    ${data.price}
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
                    ${data.status}
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


  const mainImage =
    document.querySelector("#offer-main-image");

  const thumbnails =
    document.querySelectorAll(".offer-gallery-thumb");


  thumbnails.forEach(button => {

    button.addEventListener("click", () => {

      if (!mainImage) {
        return;
      }

      mainImage.src =
        button.dataset.image;

    });

  });
}


/* =====================================================
   WCZYTYWANIE OFERT
===================================================== */

async function loadOffers() {

  const listContainer =
    document.querySelector("#offers-list");

  try {

    const response =
      await fetch(CSV_URL);

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const csvText =
      await response.text();


    const offers =
      csvToObjects(csvText)
        .filter(offer =>
          getValue(
            offer,
            ["Nazwa oferty"]
          )
        );


    if (listContainer) {

      const currentCategory =
        listContainer.dataset.category;


      const filteredOffers =
        currentCategory

          ? offers.filter(
              offer =>
                getValue(
                  offer,
                  ["Kategoria"]
                ) === currentCategory
            )

          : offers;


      if (!filteredOffers.length) {

        listContainer.innerHTML = `
          <p class="auto-offer-empty">
            Aktualnie brak ofert
            w tej kategorii.
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


    if (listContainer) {

      listContainer.innerHTML = `
        <p class="auto-offer-empty">
          Nie udało się załadować ofert.
        </p>
      `;

    }
  }
}


loadOffers();