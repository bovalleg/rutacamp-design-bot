// Single source of truth for the destinos and their Drive folders.
// If folder IDs change, update them here only.

export const DESTINOS = {
  'puerto-fuy': {
    label: 'Puerto Fuy',
    region: 'Huilo-Huilo · Los Ríos',
    drive_folder_id: '1glVvj18UBe1k1lRy42MVtTbkhiBFHscX',
  },
  'melipeuco': {
    label: 'Melipeuco (Llaima Domo)',
    region: 'Melipeuco · Araucanía',
    drive_folder_id: '1WM4XE_0B46dAwuqMjDmhzY6qG6R7CdBw',
  },
  'tagua-tagua': {
    label: 'Tagua Tagua (Base Puelo)',
    region: 'Cochamó · Los Lagos',
    drive_folder_id: '13imQqhX1PpSw47Yx2jhn3UPUfEKjlLQO',
  },
  'malalcahuello': {
    label: 'Malalcahuello (Warara)',
    region: 'Araucanía',
    drive_folder_id: null, // shared folder pending
  },
  'villarrica': {
    label: 'Villarrica',
    region: 'Araucanía',
    drive_folder_id: null, // upcoming
  },
  'red': {
    label: 'Red Ruta Camp',
    region: 'Patagonia · Araucanía',
    drive_folder_id: '1OEpCeITp2DsjlbOjWB2GKeDbZeIWH-qh',
    skip_in_default_catalog: true,  // duplica las fotos de los destinos individuales — solo se cataloga si se pide explicito
  },
  'aereas': {
    label: 'Aéreas / Dron',
    region: 'multi-destino',
    drive_folder_id: '1T_Fe0qnpDyJqK6e77oVo7-BbWr59DL6-',
  },
};

export function destinoFromKey(key) {
  return DESTINOS[key] || null;
}

export function folderIdForDestino(key) {
  return DESTINOS[key]?.drive_folder_id || null;
}

// Catalog file location for a given destino key
export function catalogPathForDestino(key) {
  return `catalog/${key}.json`;
}
