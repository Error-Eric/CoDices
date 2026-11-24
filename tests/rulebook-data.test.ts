import { describe, expect, it } from 'vitest';
import rulebook from '../public/rulebook/rulebook-data.json';

describe('published rulebook data', () => {
  it('ships skills, monsters and weapons', () => {
    expect(rulebook.available).toBe(true);
    expect(rulebook.skills.length).toBeGreaterThan(0);
    expect(rulebook.monsters.length).toBeGreaterThan(0);
    expect(rulebook.weapons.length).toBeGreaterThan(0);
    expect(rulebook.counts).toEqual({
      skills: rulebook.skills.length,
      monsters: rulebook.monsters.length,
      weapons: rulebook.weapons.length,
    });
  });
});
