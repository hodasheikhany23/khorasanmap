const isMobile = window.innerWidth <= 768;

var map = L.map('map', { 
  zoomControl: true,
  minZoom: 6,
  maxZoom: 15,
  preferCanvas: true,
  zoomAnimation: !isMobile,
  markerZoomAnimation: !isMobile,
  fadeAnimation: !isMobile
}).setView([36.2972, 59.6068], 7);

const visibleMarkersLayer = L.layerGroup().addTo(map);

let renderTimer = null;
let isPopupOpen = false;

function debounceRender(fn, delay = 150) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(fn, delay);
}

document.getElementById('map').style.background = '#f1f5f9';
// لایه‌های برچسب شهر و روستا
var cityLayer = L.layerGroup().addTo(map);
var townLayer = L.layerGroup().addTo(map);
var villageLayer = L.layerGroup().addTo(map);

var cityLabels = L.layerGroup();
var roadLabels = L.layerGroup();
var roadNamesShown = new Set();
var geojsonPlaces = [];

var allPoints = [];
// var markersLayer = L.layerGroup().addTo(map);


// ---------------------------
// Search & Filter State
// ---------------------------
let currentSearchQuery = "";
let currentStatusFilter = "all";

// ---------------------------
// Helpers
// ---------------------------
function slugifyType(str) {
  return (str || 'unknown')
    .toString()
    .trim()
    .replace(/\u200c/g, '')               // remove ZWNJ
    .replace(/\s+/g, '-')                // spaces -> -
    .replace(/[^\u0600-\u06FF\w-]/g, '')  // keep fa/latin/digit/_/-
    .toLowerCase();
}
function getStatusClass(status) {
  if (!status) return 'status-default';

  status = status.trim();

  if (status === 'تکمیل') return 'status-completed';
  if (status === 'در دست ساخت') return 'status-ongoing';
  if (status === 'ساخته نشده') return 'status-not-built';

  return 'status-default';
}

function normalizePoint(p) {
  const lat = Array.isArray(p.coords) ? Number(p.coords[0]) : Number(p.lat);
  const lng = Array.isArray(p.coords) ? Number(p.coords[1]) : Number(p.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;

  const title = `${p.location || 'عنوانی ثبت نشده'}${p.city ? ' - ' + p.city : ''}`.trim();

  const desc =
    `شهرستان: ${p.county || '-'}<br>` +
    `شهر/بخش: ${p.city || '-'}<br>` +
    `مکان: ${p.location || '-'}<br>` +
    `تعداد شهدا: ${p.martyrs || '-'}<br>` +
    `وضعیت: ${p.status || '-'}<br>` +
    `تاریخ تدفین: ${p.burial || '-'}`;

  return {
    ...p,
    lat,
    lng,
    // for CSS class use
    typeSlug: slugifyType(p.type),
    // for search convenience
    name: p.location || p.city || p.county || '',
    // keep compatibility with your popup code
    contents: {
      title,
      desc,
      images: p.image ? [p.image] : []
    }
  };
}

// ---------------------------
// Base Layers (GeoJSON)
// ---------------------------
// ---------------------------
// 1. بارگذاری مرزها (از متغیر محلی)
// ---------------------------
if (typeof adminareaData !== 'undefined') {
    L.geoJSON(adminareaData, {
        style: { color: "#94a3b8", weight: 2, fillColor: "#e2e8f0", fillOpacity: 0.15 }
    }).addTo(map);
}

// ---------------------------
// 2. بارگذاری جاده‌ها (از متغیر محلی)
var roadsLayer = null;

function roadFilter(feature) {
  const type = feature.properties.fclass;
  const zoom = map.getZoom();

  if (isMobile) {
    if (zoom < 9) {
      return ["motorway", "trunk", "primary"].includes(type);
    }

    if (zoom < 12) {
      return ["motorway", "trunk", "primary", "secondary"].includes(type);
    }

    return ["motorway", "trunk", "primary", "secondary", "tertiary"].includes(type);
  }

  return ["motorway", "trunk", "primary", "secondary", "tertiary"].includes(type);
}

function renderRoads() {
  if (typeof roadData === 'undefined') return;

  const zoom = map.getZoom();

  if (isMobile && zoom < 10) {
    if (roadsLayer) {
      map.removeLayer(roadsLayer);
      roadsLayer = null;
    }
    roadLabels.clearLayers();
    return;
  }

  if (roadsLayer) {
    map.removeLayer(roadsLayer);
    roadsLayer = null;
  }

  roadNamesShown.clear();
  roadLabels.clearLayers();

  roadsLayer = L.geoJSON(roadData, {
    filter: roadFilter,
    style: {
      color: "#64748b",
      weight: isMobile ? 0.7 : 1.2,
      opacity: isMobile ? 0.55 : 0.9
    },
    onEachFeature: function (feature, layer) {
      if (isMobile) return;

      const roadName = feature.properties.name;
      if (!roadName || roadName.includes('?') || roadNamesShown.has(roadName)) return;

      roadNamesShown.add(roadName);

      if (layer.getBounds && layer.getBounds().isValid()) {
        const center = layer.getBounds().getCenter();

        roadLabels.addLayer(
          L.tooltip({
            permanent: true,
            direction: 'center',
            className: 'road-label',
            opacity: 0.8
          })
          .setLatLng(center)
          .setContent(`<span style="font-family: Tahoma; direction: rtl;">${roadName}</span>`)
        );
      }
    }
  }).addTo(map);
}


renderRoads();


// ---------------------------
// 3. بارگذاری نام شهرها و مکان‌ها
// ---------------------------
function shouldShowPlace(feature) {
  const type = feature.properties.fclass;
  const zoom = map.getZoom();

  if (isMobile) {
    if (zoom < 8) return type === "city";
    if (zoom < 10) return ["city", "town"].includes(type);
    if (zoom < 13) return ["city", "town", "village"].includes(type);

    return ["city", "town", "village"].includes(type);
  }

  if (zoom < 8) return type === "city";
  if (zoom < 10) return ["city", "town"].includes(type);
  if (zoom < 12) return ["city", "town", "village"].includes(type);

  return ["city", "town", "village", "hamlet"].includes(type);
}

function renderPlaces() {
  cityLayer.clearLayers();
  townLayer.clearLayers();
  villageLayer.clearLayers();

  if (typeof placesData === 'undefined') return;

  geojsonPlaces = placesData.features;

  const bounds = map.getBounds().pad(isMobile ? 0.05 : 0.2);
  const zoom = map.getZoom();

  for (const feature of geojsonPlaces) {
    if (!shouldShowPlace(feature)) continue;

    const coords = feature.geometry && feature.geometry.coordinates;
    if (!coords) continue;

    const latlng = L.latLng(coords[1], coords[0]);

    if (!bounds.contains(latlng)) continue;

    const fclass = feature.properties.fclass;
    const name = feature.properties.name || "";

    const marker = L.marker(latlng, {
      icon: L.divIcon({
        className: 'place-label',
        html: `<div>${name}</div>`,
        iconSize: [100, 20],
        iconAnchor: [50, 10]
      }),
      interactive: false,
      zIndexOffset: -1000
    });

    if (fclass === 'city') marker.addTo(cityLayer);
    else if (fclass === 'town') marker.addTo(townLayer);
    else if (['village', 'hamlet'].includes(fclass)) marker.addTo(villageLayer);
  }
}



renderPlaces();


// ---------------------------
// 4. بارگذاری نقاط یادمان (نقاط اصلی پروژه)
// ---------------------------
if (typeof pointsData !== 'undefined') {
    allPoints = (pointsData || []).map(normalizePoint).filter(Boolean);
    allPoints.forEach(point => {
        const statusClass = getStatusClass(point.status);
        const myIcon = L.divIcon({
            html: `<div class="marker-container">
                     <div class="pin-shadow"></div>
                     <div class="marker-pin ${statusClass}"></div>
                     <div class="pin-glow"></div>
                   </div>`,
            className: 'custom-marker',
            iconSize: [32, 42], iconAnchor: [16, 42], popupAnchor: [0, -40]
        });

        point._marker = L.marker([point.lat, point.lng], { 
            icon: myIcon,
            zIndexOffset: 1000 
        }); 

        point._marker.on('click', () => openPlacePopup(point));
    });
}

// در نهایت اجرای فیلترها و لیبل‌ها
applyFilters();
updateLabels();
function createPointMarker(point) {
  if (point._marker) return point._marker;

  const statusClass = getStatusClass(point.status);

  const myIcon = L.divIcon({
    html: `<div class="marker-container">
             <div class="pin-shadow"></div>
             <div class="marker-pin ${statusClass}"></div>
             <div class="pin-glow"></div>
           </div>`,
    className: 'custom-marker',
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -40]
  });

  point._marker = L.marker([point.lat, point.lng], {
    icon: myIcon,
    zIndexOffset: 1000
  });

  point._marker.on('click', () => openPlacePopup(point));

  return point._marker;
}


// ---------------------------
// Labels visibility
// ---------------------------
function updateLabels() {
  var z = map.getZoom();

  if (!map.hasLayer(cityLayer)) {
    map.addLayer(cityLayer);
  }

  if (z >= 9) map.addLayer(townLayer);
  else map.removeLayer(townLayer);

  if (z >= 12) map.addLayer(villageLayer);
  else map.removeLayer(villageLayer);

  if (!isMobile && z >= 14) map.addLayer(roadLabels);
  else map.removeLayer(roadLabels);
}

map.on("moveend", function () {
  debounceRender(function () {
    if (isPopupOpen) return;

    applyFilters();
  }, isMobile ? 350 : 150);
});

map.on("zoomend", function () {
  debounceRender(function () {
    if (isPopupOpen) return;

    renderRoads();
    renderPlaces();
    applyFilters();
    updateLabels();
  }, isMobile ? 450 : 180);
});


function normalizeFaText(str) {
  return (str || "")
    .toString()
    .normalize("NFKC")
    .replace(/_/g, " ")              // خیلی مهم: آندرلاین به فاصله
    .replace(/[،,]/g, " ")
    .replace(/\u200c/g, " ")         // نیم‌فاصله به فاصله
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[إأآا]/g, "ا")         // آزاد / ازاد یکی شود
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/\.[a-zA-Z0-9]+$/g, " ") // حذف پسوند فایل مثل jpg
    .replace(/[^آ-یa-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getWords(str) {
  return normalizeFaText(str)
    .split(" ")
    .filter(Boolean)
    .filter(word => word.length > 1)
    // حذف عددهای تنها مثل 049
    .filter(word => !/^\d+$/.test(word));
}

function getFileNameFromPath(path) {
  return String(path || "").split("/").pop() || "";
}

function findFolder(point) {
  if (typeof folderImagesMap === "undefined") return null;

  const pointCity = normalizeFaText(point.city || "");
  const pointLoc = normalizeFaText(point.location || "");
  const pointFull = `${pointCity} ${pointLoc}`.trim();

  const pointWords = getWords(pointFull);

  console.log("🔍 findFolder target:", {
    city: point.city,
    location: point.location,
    normalized: pointFull,
    words: pointWords
  });

  const folderKeys = Object.keys(folderImagesMap);

  let bestMatch = null;
  let highestScore = 0;
  let bestDebug = null;

  folderKeys.forEach(folder => {
    const images = folderImagesMap[folder] || [];

    // متن قابل جستجو = نام پوشه + نام فایل‌های داخلش
    const fileNamesText = images
      .map(path => getFileNameFromPath(path))
      .join(" ");

    const searchableText = `${folder} ${fileNamesText}`;
    const searchableWords = getWords(searchableText);

    let matches = 0;
    const matchedWords = [];

    pointWords.forEach(word => {
      if (searchableWords.includes(word)) {
        matches++;
        matchedWords.push(word);
      }
    });

    const score = pointWords.length
      ? matches / pointWords.length
      : 0;

    if (score > highestScore) {
      highestScore = score;
      bestMatch = folder;
      bestDebug = {
        folder,
        searchableWords,
        matchedWords,
        score
      };
    }
  });

  // آستانه 0.5 برای مواردی که نام فایل هم کمک می‌کند مناسب است
  if (bestMatch && highestScore >= 0.5) {
    console.log(
      `✅ Folder found! Score: ${highestScore.toFixed(2)} | Key: ${bestMatch}`,
      bestDebug
    );
    return bestMatch;
  }

  console.warn(
    `❌ No match found. Best guess was: ${bestMatch} (Score: ${highestScore.toFixed(2)})`,
    bestDebug
  );

  return null;
}




function buildImageSlider(images) {
  if (!images || images.length === 0) return "";

  const slides = images.map((img, i) => {
    const safeSrc = encodeURI(img);

    return `
      <img
        src="${safeSrc}"
        class="popup-slide ${i === 0 ? 'active' : ''}"
        loading="lazy"
        alt="تصویر مکان"
        onerror="console.error('Image failed to load:', this.src)"
      >
    `;
  }).join("");

  const controls = images.length > 1 ? `
    <button class="slider-prev" type="button">›</button>
    <button class="slider-next" type="button">‹</button>
  ` : "";

  return `
    <div class="popup-slider">
      <div class="popup-slides">
        ${slides}
      </div>
      ${controls}
    </div>
  `;
}




// ---------------------------
// Popup
// ---------------------------
function openPlacePopup(point) {

  const folder = findFolder(point);

  const images = folder ? folderImagesMap[folder] : [];

  const sliderHtml = images.length > 0 ? buildImageSlider(images) : "";


  const icons = {
    county: `<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
    city: `<svg viewBox="0 0 24 24"><path d="M15 11V5l-3-3-3 3v2H3v14h18V11h-6zm-8 8H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm6 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm6 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg>`,
    location: `<svg viewBox="0 0 24 24"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>`,
    martyrs: `<svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
    status: `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>`,
    target: `<svg viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>`,
  };

  const popupHtml = `
  <div class="modern-card">

  ${sliderHtml ? `
    <div class="card-header-img">
      ${sliderHtml}
      <button class="close-card-btn" onclick="map.closePopup();">×</button>
    </div>
  ` : `
    <button class="close-card-btn close-card-btn-no-img" onclick="map.closePopup();">×</button>
  `}

    <div class="card-body">

      <h3 class="card-title">
        <span>${point.contents?.title || 'بدون عنوان'}</span>
      </h3>

      <div class="info-list">

        <div class="info-item">
          <span class="info-label">شهرستان: <b>${point.county || '-'}</b></span>
          <span class="info-icon">${icons.county}</span>
        </div>

        <div class="info-item">
          <span class="info-label">شهر/بخش: <b>${point.city || '-'}</b></span>
          <span class="info-icon">${icons.city}</span>
        </div>

        <div class="info-item">
          <span class="info-label">مکان: <b>${point.location || '-'}</b></span>
          <span class="info-icon">${icons.location}</span>
        </div>

        <div class="info-item">
          <span class="info-label">تعداد شهدا: <b>${point.martyrs || '۰'}</b></span>
          <span class="info-icon">${icons.martyrs}</span>
        </div>

        <div class="info-item">
          <span class="info-label">وضعیت: <b>${point.status || '-'}</b></span>
          <span class="info-icon">${icons.status}</span>
        </div>

        <div class="info-item">
          <span class="info-label">تاریخ تدفین: <b>${point.burial || '-'}</b></span>
          <span class="info-icon">${icons.calendar}</span>
        </div>

        <div class="info-item no-border">
          <span class="info-label ltr-text">
            ${Number(point.lat).toFixed(5)} , ${Number(point.lng).toFixed(5)} :موقعیت
          </span>
          <span class="info-icon">${icons.target}</span>
        </div>

      </div>

    </div>
  </div>
  `;

  point._marker.unbindPopup();
  point._marker.bindPopup(popupHtml, { 
    maxWidth: 350,
    className: 'custom-leaflet-popup',
    closeOnClick: false,
    keepInView: true
  });

  point._marker.openPopup();
}
map.on("popupclose", function () {
  setTimeout(function () {
    if (map._popup && map._popup.isOpen && map._popup.isOpen()) return;

    isPopupOpen = false;

    debounceRender(function () {
      renderPlaces();
      renderRoads();
      applyFilters();
      updateLabels();
    }, 100);
  }, 0);
});

map.on("popupopen", function () {
  isPopupOpen = true;
  const slider = document.querySelector(".leaflet-popup .popup-slider");
  if (!slider) return;

  const slides = slider.querySelectorAll(".popup-slide");
  const next = slider.querySelector(".slider-next");
  const prev = slider.querySelector(".slider-prev");

  if (!slides.length || !next || !prev) return;

  let index = 0;

  function showSlide(newIndex) {
    slides[index].classList.remove("active");
    index = newIndex;
    slides[index].classList.add("active");
  }

  next.addEventListener("click", function (e) {
    e.stopPropagation();
    showSlide((index + 1) % slides.length);
  });

  prev.addEventListener("click", function (e) {
    e.stopPropagation();
    showSlide((index - 1 + slides.length) % slides.length);
  });
});

// ---------------------------
//  تابع فیلتر
// ---------------------------
function applyFilters() {
  visibleMarkersLayer.clearLayers();

  const bounds = map.getBounds().pad(0.2);
  const zoom = map.getZoom();

  let renderedCount = 0;

  for (const point of allPoints) {
    const searchString =
      `${point.location || ""} ${point.city || ""} ${point.county || ""}`
      .toLowerCase();

    const matchesSearch =
      !currentSearchQuery ||
      searchString.includes(currentSearchQuery);

    const matchesStatus =
      currentStatusFilter === "all" ||
      (point.status && point.status.trim() === currentStatusFilter);

    if (!matchesSearch || !matchesStatus) continue;

    const latlng = L.latLng(point.lat, point.lng);

    if (!bounds.contains(latlng) && !currentSearchQuery) continue;


    visibleMarkersLayer.addLayer(createPointMarker(point));
    renderedCount++;
  }
}

// ---------------------------
// Search (Full Improved Version)
// ---------------------------
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const resultsBox = document.getElementById("searchResults");

// نرمال‌سازی متن فارسی
function normalizeSearchText(str) {
  return (str || "")
    .toString()
    .replace(/\u200c/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// متن جستجوی هر نقطه
function getPointSearchText(point) {
  return normalizeSearchText(
    `${point.location || ""} ${point.city || ""} ${point.county || ""} ${point.status || ""}`
  );
}

// متن جستجوی شهر/مکان از GeoJSON
function getPlaceSearchText(feature) {
  return normalizeSearchText(feature?.properties?.name || "");
}

// پیدا کردن نتایج شهرها
function findPlaceResults(query) {
  if (!query || query.length < 2 || !geojsonPlaces.length) return [];

  return geojsonPlaces
    .filter(feature => {
      const type = feature?.properties?.fclass;
      const name = getPlaceSearchText(feature);

      return ["city", "town"].includes(type) && name.includes(query);
    })
    .slice(0, 5);
}

// باز کردن نتیجه شهر
function openCityResult(feature) {
  resultsBox.style.display = "none";
  if (searchInput) searchInput.blur();

  const coords = feature.geometry?.coordinates;
  if (!coords) return;

  map.setView([coords[1], coords[0]], isMobile ? 12 : 11, {
    animate: true
  });
}

// باز کردن نتیجه نقطه یادمان
function openPointResult(point) {
  resultsBox.style.display = "none";
  if (searchInput) searchInput.blur();

  map.once("moveend", function () {
    openPlacePopup(point);
  });

  map.setView([point.lat, point.lng], isMobile ? 13 : 12, {
    animate: true
  });
}

// اجرای جستجو
function performSearch() {
  if (!searchInput) return;

  const rawQuery = searchInput.value.trim();
  const query = normalizeSearchText(rawQuery);

  currentSearchQuery = query;

  if (query.length < 2) {
    resultsBox.style.display = "none";
    applyFilters();
    return;
  }

  const cityResults = findPlaceResults(query);

  const pointResults = allPoints
    .filter(point => getPointSearchText(point).includes(query))
    .slice(0, isMobile ? 8 : 10);

  showSearchResults(cityResults, pointResults);

  applyFilters();
}

// نمایش نتایج
function showSearchResults(cityList, pointList) {
  if (!resultsBox) return;

  resultsBox.innerHTML = "";

  if (cityList.length === 0 && pointList.length === 0) {
    resultsBox.style.display = "none";
    return;
  }

  // نمایش شهرها اول
  cityList.forEach(feature => {
    const div = document.createElement("div");
    div.className = "result-item result-city-item";

    div.innerHTML = `
      <div class="result-title">شهر ${feature.properties.name}</div>
      <div class="result-meta">نمایش محدوده شهر روی نقشه</div>
    `;

    div.addEventListener("click", function () {
      openCityResult(feature);
    });

    resultsBox.appendChild(div);
  });

  // سپس نقاط یادمان
  pointList.forEach(point => {
    const div = document.createElement("div");
    div.className = "result-item";

    div.innerHTML = `
      <div class="result-title">${point.location || "-"}</div>
      <div class="result-meta">
        ${[point.city, point.county, point.status].filter(Boolean).join(" - ")}
      </div>
    `;

    div.addEventListener("click", function () {
      openPointResult(point);
    });

    resultsBox.appendChild(div);
  });

  resultsBox.style.display = "block";
}

// رویدادها
if (searchButton)
  searchButton.addEventListener("click", performSearch);

if (searchInput) {

  searchInput.addEventListener("input", function () {
    debounceRender(performSearch, isMobile ? 220 : 120);
  });

  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      performSearch();

      const first = resultsBox.querySelector(".result-item");
      if (first) first.click();
    }
  });
}

// بستن لیست هنگام کلیک بیرون
document.addEventListener("click", function (e) {
  if (!e.target.closest(".search-wrapper") && resultsBox) {
    resultsBox.style.display = "none";
  }
});

// ---------------------------
// Status Filter
// ---------------------------


// اگر dropdown باشد
const statusDropdown = document.getElementById("statusFilterDropdown");

if(statusDropdown){

statusDropdown.addEventListener("change",function(e){

    currentStatusFilter = e.target.value.trim();

    applyFilters();

});

}