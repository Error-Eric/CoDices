export interface RulebookSkillSection {
  label: string;
  text: string;
}

export interface RulebookSkill {
  id: string;
  name: string;
  base: string;
  baseRaw: string;
  tags: string[];
  description: string;
  sections: RulebookSkillSection[];
  sourceLine: number;
}

export interface RulebookMonsterStats {
  str: string;
  con: string;
  siz: string;
  dex: string;
  int: string;
  pow: string;
  hp: string;
}

export interface RulebookMonster {
  id: string;
  name: string;
  subtitle: string;
  section: string;
  quote: string;
  description: string;
  stats: RulebookMonsterStats;
  db: string;
  build: string;
  magic: string;
  move: string;
  armor: string;
  sanity: string;
  attacks: string;
  sourceLine: number;
}

export interface RulebookWeapon {
  id: string;
  name: string;
  skill: string;
  category: string;
  damage: string;
  range: string;
  perRound: string;
  ammo: string;
  price: string;
  malfunction: string;
  era: string;
}

export interface RulebookData {
  available: boolean;
  generatedAt: string;
  source: string;
  counts: {
    skills: number;
    monsters: number;
    weapons: number;
  };
  skills: RulebookSkill[];
  monsters: RulebookMonster[];
  weapons: RulebookWeapon[];
}
