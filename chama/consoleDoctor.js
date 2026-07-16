export function hasLegacyConsoleStationConfig(text) {
  return /^HESTIA_STATION_(?:BASE_URL|TOKEN)=/m.test(String(text));
}
