// Borda das skills: skills/<nome>/SKILL.md na pasta do agente. Só o índice vai ao prompt; o corpo vem sob demanda.
// Skill é TEXTO (ADR-002): nada daqui é executado.
import { skillDescription, SKILL_NAME, type Skill } from '../skills';

const DIR = 'skills';
const FILE = 'SKILL.md';
const MAX_SKILLS = 30;
const CACHE_S = 30; // mesma validade da leitura do agente (ADR-012): editar a skill aparece em até 30 s

export type SkillsIO = { index: () => Skill[]; body: (name: string) => string | null };

const dir = (folderId: string): GoogleAppsScript.Drive.Folder | null => {
  const it = DriveApp.getFolderById(folderId).getFoldersByName(DIR);
  return it.hasNext() ? it.next() : null;
};
const fileOf = (folderId: string, name: string): GoogleAppsScript.Drive.File | null => {
  if (!SKILL_NAME.test(name)) return null;
  const skills = dir(folderId);
  if (!skills) return null;
  const sub = skills.getFoldersByName(name);
  if (!sub.hasNext()) return null;
  const f = sub.next().getFilesByName(FILE);
  return f.hasNext() ? f.next() : null;
};

export function skillsIO(folderId: string, cache = CacheService.getScriptCache()): SkillsIO {
  return {
    index: () => {
      const key = `sk:${folderId}`;
      const hit = cache.get(key);
      if (hit) return JSON.parse(hit) as Skill[];
      const skills: Skill[] = [];
      const root = dir(folderId);
      if (root) {
        const subs = root.getFolders();
        while (subs.hasNext() && skills.length < MAX_SKILLS) {
          const sub = subs.next();
          const name = sub.getName().toLowerCase();
          if (!SKILL_NAME.test(name)) continue;
          const it = sub.getFilesByName(FILE);
          if (!it.hasNext()) continue;
          skills.push({ name, description: skillDescription(it.next().getBlob().getDataAsString('UTF-8')) });
        }
      }
      cache.put(key, JSON.stringify(skills), CACHE_S);
      return skills;
    },
    body: (name) => {
      const f = fileOf(folderId, String(name).toLowerCase());
      return f ? f.getBlob().getDataAsString('UTF-8') : null;
    },
  };
}
