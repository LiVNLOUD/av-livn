import data from './species.generated.json';
import type { SpeciesProfile } from './types';

export const PROFILES = data as unknown as Record<string, SpeciesProfile>;

export function getProfile(id: string): SpeciesProfile | undefined {
  return Object.hasOwn(PROFILES, id) ? PROFILES[id] : undefined;
}
