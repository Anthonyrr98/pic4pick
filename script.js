const photos = [
  {
    id: "01",
    title: "海上黎明",
    country: "美国",
    location: "圣地亚哥",
    category: "featured",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    focal: "200mm",
    aperture: "f/5.6",
    shutter: "1/640s",
    iso: "100",
    camera: "Canon EOS 5D Mark IV",
    lens: "EF 70-200mm f/2.8L",
    mood: "黄金海岸",
  },
  {
    id: "02",
    title: "彩虹之路",
    country: "荷兰",
    location: "北荷兰省",
    category: "featured",
    image: "https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&w=1200&q=80",
    focal: "85mm",
    aperture: "f/4",
    shutter: "1/320s",
    iso: "200",
    camera: "Nikon D850",
    lens: "85mm f/1.8",
    mood: "彩虹平原",
  },
  {
    id: "03",
    title: "阿尔卑斯晨雾",
    country: "瑞士",
    location: "采尔马特",
    category: "featured",
    image: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80",
    focal: "35mm",
    aperture: "f/8",
    shutter: "1/400s",
    iso: "125",
    camera: "Fujifilm X-T4",
    lens: "35mm f/1.4",
    mood: "雪峰轨迹",
  },
  {
    id: "04",
    title: "湖畔黄昏",
    country: "意大利",
    location: "科莫湖",
    category: "latest",
    image: "https://images.unsplash.com/photo-1505764706515-aa95265c5abc?auto=format&fit=crop&w=1200&q=80",
    focal: "50mm",
    aperture: "f/5",
    shutter: "1/250s",
    iso: "200",
    camera: "Sony A7R IV",
    lens: "FE 24-70mm f/2.8",
    mood: "暮色宫殿",
  },
  {
    id: "05",
    title: "都市动脉",
    country: "阿联酋",
    location: "迪拜",
    category: "nearby",
    image: "https://images.unsplash.com/photo-1438519337937-43e29d02ed5e?auto=format&fit=crop&w=1200&q=80",
    focal: "28mm",
    aperture: "f/7.1",
    shutter: "1/80s",
    iso: "400",
    camera: "Canon EOS R5",
    lens: "RF 24-70mm f/2.8",
    mood: "城市星轨",
  },
  {
    id: "06",
    title: "伦敦眼夜色",
    country: "英国",
    location: "伦敦",
    category: "latest",
    image: "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80",
    focal: "35mm",
    aperture: "f/2",
    shutter: "1/160s",
    iso: "640",
    camera: "Sony A7 III",
    lens: "35mm f/1.4",
    mood: "河畔光晕",
  },
  {
    id: "07",
    title: "集市的早晨",
    country: "英国",
    location: "伦敦",
    category: "random",
    image: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80",
    focal: "50mm",
    aperture: "f/2.2",
    shutter: "1/250s",
    iso: "200",
    camera: "Leica Q2",
    lens: "28mm f/1.7",
    mood: "集市漫游",
  },
  {
    id: "08",
    title: "沙漠修行",
    country: "尼泊尔",
    location: "博卡拉",
    category: "far",
    image: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=80",
    focal: "80mm",
    aperture: "f/3.5",
    shutter: "1/200s",
    iso: "320",
    camera: "Canon EOS 6D",
    lens: "EF 24-105mm f/4",
    mood: "藏地匠人",
  },
  {
    id: "09",
    title: "市井色彩",
    country: "马来西亚",
    location: "槟城",
    category: "random",
    image: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80",
    focal: "45mm",
    aperture: "f/6.3",
    shutter: "1/125s",
    iso: "160",
    camera: "Fujifilm X-Pro3",
    lens: "23mm f/2",
    mood: "街头光影",
  },
  {
    id: "10",
    title: "鸟居之光",
    country: "日本",
    location: "京都",
    category: "featured",
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80",
    focal: "16mm",
    aperture: "f/4",
    shutter: "1/60s",
    iso: "500",
    camera: "Sony A7C",
    lens: "16-35mm f/2.8",
    mood: "千鸟秘径",
  },
  {
    id: "11",
    title: "霓虹隧道",
    country: "香港",
    location: "中环",
    category: "nearby",
    image: "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80",
    focal: "24mm",
    aperture: "f/2.8",
    shutter: "1/125s",
    iso: "320",
    camera: "Nikon Z6 II",
    lens: "24-70mm f/4",
    mood: "黑白线条",
  },
  {
    id: "12",
    title: "潮汐肌理",
    country: "泰国",
    location: "普吉岛",
    category: "far",
    image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
    focal: "70mm",
    aperture: "f/8",
    shutter: "1/160s",
    iso: "200",
    camera: "Canon EOS 5D Mark III",
    lens: "70-200mm f/4",
    mood: "海岸律动",
  },
];

const curationGroups = [
  {
    title: "精华甄选",
    subtitle: "北欧静谧·阿尔卑斯光影",
    image: "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "近期更新",
    subtitle: "伦敦与布鲁塞尔的桥影",
    image: "https://images.unsplash.com/photo-1446776858070-70c3d5ed6758?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "异域风情",
    subtitle: "香格里拉的藏地手作",
    image: "https://images.unsplash.com/photo-1470770903676-69b98201ea1c?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "亚洲探索",
    subtitle: "京都千鸟·香港线条",
    image: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=600&q=80",
  },
];

const explorePins = [
  { name: "北京", coords: [39.9042, 116.4074] },
  { name: "上海", coords: [31.2304, 121.4737] },
  { name: "东京", coords: [35.6762, 139.6503] },
  { name: "京都", coords: [35.0116, 135.7681] },
  { name: "曼谷", coords: [13.7563, 100.5018] },
  { name: "迪拜", coords: [25.2048, 55.2708] },
  { name: "伦敦", coords: [51.5072, -0.1276] },
  { name: "雷克雅未克", coords: [64.1466, -21.9426] },
  { name: "纽约", coords: [40.7128, -74.006] },
  { name: "里约热内卢", coords: [-22.9068, -43.1729] },
  { name: "开普敦", coords: [-33.9249, 18.4241] },
];

const galleryGrid = document.getElementById("galleryGrid");
const tabs = document.querySelectorAll(".tab");
const viewToggles = document.querySelectorAll(".toggle-btn");
const screens = document.querySelectorAll(".screen");
const curationPanel = document.getElementById("curationPanel");
const lightbox = document.getElementById("lightbox");
const lightboxImg = lightbox.querySelector(".lightbox-media img");

const lightboxFields = {
  title: document.getElementById("lightboxTitle"),
  country: document.getElementById("lightboxCountry"),
  location: document.getElementById("lightboxLocation"),
  focal: document.getElementById("metaFocal"),
  aperture: document.getElementById("metaAperture"),
  shutter: document.getElementById("metaShutter"),
  iso: document.getElementById("metaISO"),
  camera: document.getElementById("metaCamera"),
  lens: document.getElementById("metaLens"),
};

const renderGallery = (filter) => {
  const items = photos.filter((photo) => filter === "featured" ? photo.category === "featured" : filter === "latest" ? photo.category === "latest" : filter === "random" ? photo.category === "random" : filter === "nearby" ? photo.category === "nearby" : filter === "far" ? photo.category === "far" : true);
  galleryGrid.innerHTML = items
    .map(
      (item) => `
      <article class="photo-card" data-photo="${item.id}">
        <img src="${item.image}" alt="${item.title}" loading="lazy" />
        <span class="badge">${item.mood}</span>
        <div class="caption">
          <h4>${item.title}</h4>
          <span>${item.country} · ${item.location}</span>
        </div>
      </article>
    `,
    )
    .join("");
};

const renderCuration = () => {
  curationPanel.innerHTML = curationGroups
    .map(
      (group) => `
      <article class="curation-card">
        <figure>
          <img src="${group.image}" alt="${group.title}" loading="lazy" />
        </figure>
        <div>
          <h5>${group.title}</h5>
          <p>${group.subtitle}</p>
        </div>
      </article>
    `,
    )
    .join("");
};

const openLightbox = (id) => {
  const photo = photos.find((p) => p.id === id);
  if (!photo) return;
  lightboxImg.src = photo.image;
  lightboxImg.alt = photo.title;
  lightboxFields.title.textContent = photo.title;
  lightboxFields.country.textContent = photo.country;
  lightboxFields.location.textContent = photo.location;
  lightboxFields.focal.textContent = photo.focal;
  lightboxFields.aperture.textContent = photo.aperture;
  lightboxFields.shutter.textContent = photo.shutter;
  lightboxFields.iso.textContent = photo.iso;
  lightboxFields.camera.textContent = photo.camera;
  lightboxFields.lens.textContent = photo.lens;
  lightbox.classList.add("active");
  lightbox.setAttribute("aria-hidden", "false");
};

const closeLightbox = () => {
  lightbox.classList.remove("active");
  lightbox.setAttribute("aria-hidden", "true");
};

const initMap = () => {
  const map = L.map("mapCanvas", {
    zoomControl: false,
    scrollWheelZoom: false,
    dragging: true,
  }).setView([25, 20], 2.3);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  }).addTo(map);

  explorePins.forEach((pin) => {
    L.circleMarker(pin.coords, {
      radius: 6,
      color: "#222",
      fillColor: "#e7b17c",
      fillOpacity: 0.9,
      weight: 1.5,
    })
      .bindPopup(`<strong>${pin.name}</strong>`)
      .addTo(map);
  });

  return map;
};

const attachEvents = () => {
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      renderGallery(tab.dataset.filter);
    });
  });

  viewToggles.forEach((btn) => {
    btn.addEventListener("click", () => {
      viewToggles.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      screens.forEach((screen) => {
        screen.classList.toggle("active", screen.id === btn.dataset.target);
      });
    });
  });

  galleryGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".photo-card");
    if (card) {
      openLightbox(card.dataset.photo);
    }
  });

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox || e.target.matches(".lightbox-close")) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeLightbox();
    }
  });
};

renderGallery("featured");
renderCuration();
attachEvents();
initMap();

