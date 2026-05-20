delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: '',
    iconUrl: '',
    shadowUrl: ''
});

var map = L.map('map', {
    zoomControl: true
}).setView([36.2972, 59.6068], 7);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);


var cityLabels = L.layerGroup();
var roadLabels = L.layerGroup();
var roadNamesShown = new Set();
var geojsonPlaces = [];

fetch('map1.geojson')
    .then(res => res.json())
    .then(data => {
        L.geoJSON(data, {
            style: {
                color: "#94a3b8",
                weight: 2,
                fillColor: "#e2e8f0",
                fillOpacity: 0.15
            }
        }).addTo(map);
    });

fetch('road.geojson')
    .then(res => res.json())
    .then(data => {
        L.geoJSON(data, {
            filter: f => ["motorway", "trunk", "primary"].includes(f.properties.fclass),
            style: {
                color: "#64748b",
                weight: 1.2,
                opacity: 0.9
            },
            onEachFeature: function(feature, layer) {
                if (feature.properties.name && !roadNamesShown.has(feature.properties.name)) {
                    roadNamesShown.add(feature.properties.name);

                    if (layer.getBounds && layer.getBounds().isValid()) {
                        var center = layer.getBounds().getCenter();
                        var label = L.tooltip({
                            permanent: true,
                            direction: 'center',
                            className: 'road-label',
                            opacity: 0.8
                        })
                        .setLatLng(center)
                        .setContent(feature.properties.name);

                        roadLabels.addLayer(label);
                    }
                }
            }
        }).addTo(map);
    });

fetch('places.geojson')
  .then(res => res.json())
  .then(data => {
      if (data && data.features) geojsonPlaces = data.features;
      L.geoJSON(data, {
          filter: function(f) {
              return f.properties.fclass === 'city' || f.properties.fclass === 'town';
          },
          pointToLayer: function(f, latlng) {
              return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0 });
          },
          onEachFeature: function(feature, layer) {
              if (feature.properties.name) {
                  var label = L.tooltip({
                      permanent: true,
                      direction: 'center', 
                      className: 'place-label',
                      offset: [0, 0]
                  })
                  .setContent(feature.properties.name);
                  
                  layer.bindTooltip(label).openTooltip();
                  
                  cityLabels.addLayer(layer);
              }
          }
      }).addTo(map);
  });


var sidebarElement = document.getElementById('infoSidebar');
var sidebar = bootstrap.Offcanvas.getOrCreateInstance(sidebarElement);
var sidebarTitle = document.getElementById('sidebarTitle');
var sidebarBody = document.getElementById('sidebarBody');

sidebarElement.addEventListener('shown.bs.offcanvas', function () {
    document.body.classList.add('sidebar-open');
});
sidebarElement.addEventListener('hidden.bs.offcanvas', function () {
    document.body.classList.remove('sidebar-open');
});
var allPoints = []; 
var markersLayer = []; 
fetch('points.json')
    .then(res => res.json())
    .then(data => {
        allPoints = data;
        data.forEach(point => {
            var typeClass = point.type || '1';
            var myIcon = L.divIcon({
                html: '<div class="marker-pin"></div>',
                className: 'custom-marker type-' + typeClass ,
                iconSize: [0, 0],
                iconAnchor: [0, 0]
            });

            var marker = L.marker([point.lat, point.lng], { icon: myIcon }).addTo(map);

            marker.on('click', function() {
                sidebarTitle.innerText = 'توضیحات';
                
                const images = point.contents?.images || []; 
                let carouselHtml = '';
                
                if (images.length > 0) {
                    carouselHtml = `
                    <div id="carousel-${point.lat.toString().replace('.','')}" class="carousel slide" data-bs-ride="carousel">
                        <div class="carousel-inner">
                            ${images.map((img, index) => `
                                <div class="carousel-item ${index === 0 ? 'active' : ''}">
                                    <img src="${img}" class="d-block w-100 place-image">
                                </div>
                            `).join('')}
                        </div>
                        ${images.length > 1 ? `
                            <button class="carousel-control-prev" type="button" data-bs-target="#carousel-${point.lat.toString().replace('.','')}" data-bs-slide="prev">
                                <span class="carousel-control-prev-icon"></span>
                            </button>
                            <button class="carousel-control-next" type="button" data-bs-target="#carousel-${point.lat.toString().replace('.','')}" data-bs-slide="next">
                                <span class="carousel-control-next-icon"></span>
                            </button>
                        ` : ''}
                    </div>`;
                }

                sidebarBody.innerHTML = `
                    <div class="place-card">
                        ${carouselHtml}
                        <div class="place-content">
                            <h5>${point.contents?.title || 'عنوانی ثبت نشده.'}</h5>
                            <hr>
                            <p class="place-desc">${point.contents?.desc || 'توضیحی ثبت نشده.'}</p>
                            <hr>
                            <p class="place-desc">موقعیت جغرافیایی: ${point.lat +' * '+ point.lng  || 'مختصات نامشخص'}</p>
                        </div>
                    </div>`;
                sidebar.show();
            });
        });
    });

function updateLabels() {
    var z = map.getZoom();

    if (z >= 7) {
        cityLabels.addTo(map);
    } else {
        map.removeLayer(cityLabels);
    }

    if (z >= 11) {
        roadLabels.addTo(map);
    } else {
        map.removeLayer(roadLabels);
    }
}

map.on("zoomend", updateLabels);
setTimeout(updateLabels, 500);

map.on('click', function(e) {
    console.log("Lat: " + e.latlng.lat + ", Lng: " + e.latlng.lng);

fetch('points.json')
    .then(res => res.json())
    .then(data => {
        data.forEach(point => {
            const typeClass = point.type || '1';

            var myIcon = L.divIcon({
                html: '<div class="marker-pin"></div>',
                className: 'custom-marker type-' + typeClass,
                iconSize: [0, 0],
                iconAnchor: [0, 0]
            });

            var marker = L.marker([point.lat, point.lng], { icon: myIcon }).addTo(map);
            markersLayer.push({ marker, point });

            marker.on('click', function() {
                loadSidebar(point);
            });
        });
    });
});


function loadSidebar(point) {
    sidebarTitle.innerText = point.contents?.title || 'بدون عنوان';
    const images = point.contents?.images || [];
    let carouselHtml = '';
    if (images.length > 0) {
        carouselHtml = `
        <div id="carousel-${point.lat.toString().replace('.','')}" class="carousel slide" data-bs-ride="carousel">
            <div class="carousel-inner">
                ${images.map((img, i) => `
                    <div class="carousel-item ${i === 0 ? 'active' : ''}">
                        <img src="${img}" class="d-block w-100 place-image">
                    </div>
                `).join('')}
            </div>
            ${images.length > 1 ? `
                <button class="carousel-control-prev" type="button" data-bs-target="#carousel-${point.lat.toString().replace('.','')}" data-bs-slide="prev">
                    <span class="carousel-control-prev-icon"></span>
                </button>
                <button class="carousel-control-next" type="button" data-bs-target="#carousel-${point.lat.toString().replace('.','')}" data-bs-slide="next">
                    <span class="carousel-control-next-icon"></span>
                </button>
            ` : ''}
        </div>`;
    }

     sidebarBody.innerHTML = `
        <div class="place-card">
            ${carouselHtml}
            <div class="place-content">
                <h5>${point.contents?.title || 'عنوانی ثبت نشده.'}</h5>
                <hr>
                <p class="place-desc">${point.contents?.desc || 'توضیحی ثبت نشده.'}</p>
                <hr>
                <p class="place-desc">موقعیت جغرافیایی: ${point.lat +' * '+ point.lng  || 'مختصات نامشخص'}</p>
            </div>
        </div>`;
    sidebar.show();
}


document.getElementById('searchButton').addEventListener('click', function() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    let found = allPoints.find(p =>
        (p.name && p.name.includes(query)) ||
        (p.contents && p.contents.title && p.contents.title.includes(query))
    );

    if (found) {
        map.setView([found.lat, found.lng], 12, { animate: true });
        loadSidebar(found);
        return; 
    }

    const foundGeo = geojsonPlaces.find(f => 
        f.properties && 
        f.properties.name && 
        f.properties.name.includes(query) &&
        (f.properties.fclass === 'city' || f.properties.fclass === 'town')
    );

    if (foundGeo) {
        const lng = foundGeo.geometry.coordinates[0];
        const lat = foundGeo.geometry.coordinates[1];
        
        map.setView([lat, lng], 12, { animate: true });

        const simulatedPoint = {
            lat: lat,
            lng: lng,
            contents: {
                title: foundGeo.properties.name,
                desc: 'اطلاعاتی برای این مکان ثبت نشده است',
                images: []
            }
        };
        loadSidebar(simulatedPoint);
    } else {
        alert('شهری با این نام پیدا نشد.');
    }

    document.getElementById('searchInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        // کلیک دکمه جستجو را شبیه سازی میکنیم
        document.getElementById('searchButton').click(); 
    }
});

});



