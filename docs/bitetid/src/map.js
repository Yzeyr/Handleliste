/**
 * Kartet: Kartverkets topografiske kart (viser vann, bekker og høydekurver
 * godt) med OpenStreetMap som alternativ. Leaflet lastes fra cdnjs i
 * index.html; finnes det ikke (uten nett første gang), viser vi en beskjed.
 *
 * Knappene i boblene har data-act, og fanges av appens felles klikk-lytter.
 */
import { esc } from './ui.js?v=c95e47cafc';

export function createMap(el, { onPick }) {
  const L = window.L;
  if (!L) {
    el.innerHTML = '<p class="empty">Kartet trenger nett første gang det åpnes.</p>';
    return null;
  }

  const topo = L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png', {
    maxZoom: 18,
    attribution: '© <a href="https://www.kartverket.no/">Kartverket</a>',
  });
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });

  const map = L.map(el, { zoomControl: false, layers: [topo] });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.layers({ 'Topografisk (Kartverket)': topo, OpenStreetMap: osm }, {}, { position: 'topright' }).addTo(map);

  const layer = L.layerGroup().addTo(map);
  let picked = null;

  const pin = (cls, label) =>
    L.divIcon({ className: `pin ${cls}`, html: `<span>${label}</span>`, iconSize: [30, 30], iconAnchor: [15, 28], popupAnchor: [0, -26] });

  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    if (picked) picked.remove();
    picked = L.marker([lat, lng], { icon: pin('pin-new', '+') })
      .addTo(map)
      .bindPopup(
        `<div class="popup"><strong>Valgt punkt</strong>
         <button type="button" class="btn small" data-act="spot-new" data-lat="${lat}" data-lon="${lng}">Lagre som plass</button>
         <button type="button" class="btn small ghost" data-act="use-point" data-lat="${lat}" data-lon="${lng}">Vis bitetid her</button></div>`,
      )
      .openPopup();
    onPick?.({ lat, lon: lng });
  });

  return {
    map,
    show(place, spots, catches) {
      layer.clearLayers();
      L.marker([place.lat, place.lon], { icon: pin('pin-place', '◎') })
        .addTo(layer)
        .bindPopup(`<div class="popup"><strong>${esc(place.name)}</strong><span>Værvarsel og bitetid hentes herfra.</span></div>`);
      for (const s of spots) {
        L.marker([s.lat, s.lon], { icon: pin('pin-spot', '★') })
          .addTo(layer)
          .bindPopup(
            `<div class="popup"><strong>${esc(s.name)}</strong>${s.note ? `<span>${esc(s.note)}</span>` : ''}
             <button type="button" class="btn small" data-act="use-point" data-lat="${s.lat}" data-lon="${s.lon}" data-name="${esc(s.name)}">Vis bitetid her</button>
             <button type="button" class="btn small ghost danger" data-act="spot-del" data-id="${esc(s.id)}">Slett plassen</button></div>`,
          );
      }
      for (const c of catches) {
        if (c.lat == null) continue;
        L.marker([c.lat, c.lon], { icon: pin('pin-catch', '🐟') })
          .addTo(layer)
          .bindPopup(
            `<div class="popup"><strong>${esc(c.species)}${c.weight ? ` · ${esc(c.weight)} kg` : ''}</strong><span>${esc(new Date(c.time).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' }))}${c.bait ? ` · ${esc(c.bait)}` : ''}</span></div>`,
          );
      }
    },
    center(lat, lon, zoom = 12) {
      map.setView([lat, lon], zoom);
    },
    clearPick() {
      if (picked) picked.remove();
      picked = null;
      map.closePopup();
    },
    resize() {
      map.invalidateSize();
    },
  };
}
