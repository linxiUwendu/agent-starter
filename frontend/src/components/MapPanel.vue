<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { Poi, PhotoSpot } from "../types/travel";
import { fetchMapMarkers } from "../api/travel";

const props = defineProps<{
  cityId: string;
  pois: Poi[];
  photoSpots: PhotoSpot[];
  highlightedIds: string[];
  cityCenter: { lat: number; lng: number } | null;
}>();

const mapRoot = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
let poiLayer: L.LayerGroup | null = null;
let photoLayer: L.LayerGroup | null = null;

const defaultPois = ref<Poi[]>([]);
const defaultPhotoSpots = ref<PhotoSpot[]>([]);

const mapCenter = computed((): L.LatLngExpression => {
  if (props.cityCenter) return [props.cityCenter.lat, props.cityCenter.lng];
  return [31.23, 121.474];
});

const displayPois = computed(() => (props.pois.length ? props.pois : defaultPois.value));
const displayPhotos = computed(() =>
  props.photoSpots.length ? props.photoSpots : defaultPhotoSpots.value,
);

const poiIcon = L.divIcon({
  className: "map-marker poi-marker",
  html: '<span>📍</span>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

const photoIcon = L.divIcon({
  className: "map-marker photo-marker",
  html: '<span>📷</span>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

const highlightIcon = L.divIcon({
  className: "map-marker highlight-marker",
  html: '<span>⭐</span>',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

async function loadMarkers(cityId: string) {
  try {
    const data = await fetchMapMarkers(cityId);
    defaultPois.value = data.pois;
    defaultPhotoSpots.value = data.photoSpots;
  } catch {
    defaultPois.value = [];
    defaultPhotoSpots.value = [];
  }
  renderMarkers();
}

function renderMarkers() {
  if (!map || !poiLayer || !photoLayer) return;

  poiLayer.clearLayers();
  photoLayer.clearLayers();

  const bounds: L.LatLngExpression[] = [];

  for (const poi of displayPois.value) {
    if (poi.lat == null || poi.lng == null) continue;
    const latlng: L.LatLngExpression = [poi.lat, poi.lng];
    bounds.push(latlng);
    const highlighted = props.highlightedIds.includes(poi.id);
    const marker = L.marker(latlng, { icon: highlighted ? highlightIcon : poiIcon });
    marker.bindPopup(
      `<strong>${poi.name}</strong><br/><small>${poi.type}</small><br/>${poi.description ?? ""}`,
    );
    marker.addTo(poiLayer);
  }

  for (const spot of displayPhotos.value) {
    const latlng: L.LatLngExpression = [spot.lat, spot.lng];
    bounds.push(latlng);
    const marker = L.marker(latlng, { icon: photoIcon });
    marker.bindPopup(
      `<strong>${spot.name}</strong><br/><small>出片机位</small><br/>${spot.angle ?? ""}`,
    );
    marker.addTo(photoLayer);
  }

  if (bounds.length > 1) {
    map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 14 });
  } else if (bounds.length === 1) {
    map.setView(bounds[0]!, 14);
  } else if (props.cityCenter) {
    map.setView(mapCenter.value, 12);
  }
}

onMounted(async () => {
  if (!mapRoot.value) return;

  map = L.map(mapRoot.value, { zoomControl: true }).setView(mapCenter.value, 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxZoom: 19,
  }).addTo(map);

  poiLayer = L.layerGroup().addTo(map);
  photoLayer = L.layerGroup().addTo(map);

  await loadMarkers(props.cityId);
  setTimeout(() => map?.invalidateSize(), 100);
});

watch(
  () => props.cityId,
  async (cityId) => {
    if (map) map.setView(mapCenter.value, 12);
    await loadMarkers(cityId);
  },
);

watch(
  () => [displayPois.value, displayPhotos.value, props.highlightedIds] as const,
  () => renderMarkers(),
  { deep: true },
);

onUnmounted(() => {
  map?.remove();
  map = null;
});
</script>

<template>
  <section class="panel map-panel" data-testid="map-panel">
    <header class="panel-header compact">
      <h2 class="panel-title">地图</h2>
      <div class="map-legend">
        <span>📍 景点/美食</span>
        <span>📷 出片点</span>
        <span data-testid="map-marker-count">{{ displayPois.length }} 标记</span>
      </div>
    </header>
    <div ref="mapRoot" class="map-root" />
  </section>
</template>
