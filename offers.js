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
      if (char === "\r" && next === "\n") i++;
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
    if (offer[name]) return offer[name];
  }
  return "";
}

function getOfferData(offer) {
  const category = getValue(offer, ["Kategoria"]);
  const title = getValue(offer, ["Nazwa oferty"]);
  const location = getValue(offer, ["Miejscowość / gmina"]);
  const area = getValue(offer, ["Powierzchnia"]);
  const price = getValue(offer, ["Cena", "cena"]);
  const status = getValue(offer, ["Status oferty"]);
  const info = getValue(offer, ["Najważniejsze informacje"]);
  const imageLink = getValue(offer, ["Link do zdjęcia głównego", "link do zdjęcia", "Link do zdjęcia"]);
  const fallbackImage = CATEGORY_IMAGES[category] || "images/hero.jpg";

  return {
    id: offer._id,
    category,
    title,
    location,
    area,
    price,
    status,
    info,
    image: imageLink || fallbackImage,
    fallbackImage
  };
}

function renderOfferCard(offer) {
  const data = getOfferData(offer);

  return `
    <article class="auto-offer-card">
      <a href="oferta.html?id=${encodeURIComponent(data.id)}" class="auto-offer-image">
        <img src="${data.image}" alt="${data.title}" onerror="this.src='${data.fallbackImage}'">
      </a>

      <div class="auto-offer-content">
        <div class="auto-offer-top">
          <span>${data.category}</span>
          <strong>${data.status}</strong>
        </div>

        <h3>${data.title}</h3>

        <p class="auto-offer-location">${data.location}</p>

        <div class="auto-offer-details">
          ${data.area ? `<span>${data.area}</span>` : ""}
          ${data.price ? `<span>${data.price}</span>` : ""}
        </div>

        <a href="oferta.html?id=${encodeURIComponent(data.id)}" class="auto-offer-link">
          Zobacz ofertę
        </a>
      </div>
    </article>
  `;
}

function renderOfferDetail(offers) {
  const container = document.querySelector("#offer-detail");
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const offer = offers.find(item => item._id === id);

  if (!offer) {
    container.innerHTML = `
      <div class="container">
        <h1>Nie znaleziono oferty</h1>
        <p>Oferta mogła zostać usunięta albo link jest nieprawidłowy.</p>
        <a href="index.html" class="btn btn-primary">Wróć na stronę główną</a>
      </div>
    `;
    return;
  }

  const data = getOfferData(offer);
  const points = data.info
    .split("\n")
    .filter(point => point.trim())
    .map(point => `<li>${point.replace("-", "").trim()}</li>`)
    .join("");

  container.innerHTML = `
    <section class="offer-detail-section">
      <div class="container offer-detail-grid">
        <div class="offer-detail-photo">
          <img src="${data.image}" alt="${data.title}" onerror="this.src='${data.fallbackImage}'">
        </div>

        <aside class="offer-detail-panel">
          <span class="offer-detail-category">${data.category}</span>
          <h1>${data.title}</h1>

          <ul class="offer-detail-meta">
            ${data.location ? `<li><strong>Lokalizacja:</strong> ${data.location}</li>` : ""}
            ${data.area ? `<li><strong>Powierzchnia:</strong> ${data.area}</li>` : ""}
            ${data.price ? `<li><strong>Cena:</strong> ${data.price}</li>` : ""}
            ${data.status ? `<li><strong>Status:</strong> ${data.status}</li>` : ""}
          </ul>

          <h2>Najważniejsze informacje</h2>
          <ul class="offer-detail-points">
            ${points}
          </ul>

          <a href="index.html#kontakt" class="btn btn-primary">Zapytaj o ofertę</a>
        </aside>
      </div>
    </section>
  `;
}

async function loadOffers() {
  const listContainer = document.querySelector("#offers-list");

  try {
    const response = await fetch(CSV_URL);
    const csvText = await response.text();
    const offers = csvToObjects(csvText).filter(offer => getValue(offer, ["Nazwa oferty"]));

    if (listContainer) {
      const currentCategory = listContainer.dataset.category;

      const filteredOffers = currentCategory
        ? offers.filter(offer => getValue(offer, ["Kategoria"]) === currentCategory)
        : offers;

      if (!filteredOffers.length) {
        listContainer.innerHTML = `<p class="auto-offer-empty">Aktualnie brak ofert w tej kategorii.</p>`;
      } else {
        listContainer.innerHTML = filteredOffers.map(renderOfferCard).join("");
      }
    }

    renderOfferDetail(offers);
  } catch (error) {
    console.error("Błąd ładowania ofert:", error);

    if (listContainer) {
      listContainer.innerHTML = `<p class="auto-offer-empty">Nie udało się załadować ofert.</p>`;
    }
  }
}

loadOffers();