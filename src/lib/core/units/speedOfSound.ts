/** Speed of sound in air at 0 °C, m/s. */
export const SPEED_OF_SOUND_AT_0C = 331.3;

/** Plausible operating range; outside it the input is most likely a typo. */
export const PLAUSIBLE_TEMPERATURE_C = { min: -40, max: 60 } as const;

/**
 * Speed of sound in dry air.
 * c = 331.3 · √(1 + T / 273.15)   (ideal gas, humidity neglected)
 * @param celsius air temperature in °C
 * @returns m/s
 */
export function speedOfSound(celsius: number): number {
  return SPEED_OF_SOUND_AT_0C * Math.sqrt(1 + celsius / 273.15);
}

export function isPlausibleTemperature(celsius: number): boolean {
  return (
    Number.isFinite(celsius) &&
    celsius >= PLAUSIBLE_TEMPERATURE_C.min &&
    celsius <= PLAUSIBLE_TEMPERATURE_C.max
  );
}

/** Wavelength in m for a frequency in Hz. */
export function wavelength(frequencyHz: number, c: number): number {
  return c / frequencyHz;
}
