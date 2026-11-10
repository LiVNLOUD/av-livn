import { describe, expect, it } from 'vitest';
import meta from '../src/icons/icons.json';
import { icon, kindIcon, ICON_LABEL } from '../src/scripts/icons';

describe('icon set', () => {
  it('every icons.json entry has an SVG that renders with currentColor', () => {
    for (const name of Object.keys(meta)) {
      const s = icon(name as keyof typeof meta);
      expect(s).toMatch(/^<svg class="i" aria-hidden="true"/);
      expect(s).toContain('stroke="currentColor"');
    }
  });
  it('size and label', () => {
    const s = icon('lamba', { size: 16, label: 'Aydınlatma "doğrulandı"' });
    expect(s).toContain('width="16" height="16"');
    expect(s).toContain('role="img" aria-label="Aydınlatma &quot;doğrulandı&quot;"');
  });
  it('unknown names throw; spot kinds map to structure icons', () => {
    expect(() => icon('yok' as never)).toThrow();
    expect(kindIcon('pier')).toBe('iskele');
    expect(kindIcon('promenade')).toBe('kordon');
    expect(kindIcon(undefined)).toBe('iskele');
    expect(ICON_LABEL.ruzgar).toBe('Rüzgar');
  });
});
