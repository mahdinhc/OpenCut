import AsyncStorage from '@react-native-async-storage/async-storage';
import {Project} from '../types';

const INDEX = 'opencut.index.v1';
const KEY = (id: string) => `opencut.project.${id}`;

export interface ProjectMeta { id: string; name: string; updatedAt: number; durationMs: number; cover?: string; clips: number }

export async function listProjects(): Promise<ProjectMeta[]> {
  const raw = await AsyncStorage.getItem(INDEX);
  const list: ProjectMeta[] = raw ? JSON.parse(raw) : [];
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function loadProject(id: string): Promise<Project | null> {
  const raw = await AsyncStorage.getItem(KEY(id));
  return raw ? JSON.parse(raw) : null;
}
export async function saveProject(p: Project, durationMs: number) {
  await AsyncStorage.setItem(KEY(p.id), JSON.stringify(p));
  const list = await listProjects();
  const meta: ProjectMeta = {id: p.id, name: p.name, updatedAt: p.updatedAt, durationMs, cover: p.cover, clips: p.main.length};
  await AsyncStorage.setItem(INDEX, JSON.stringify([meta, ...list.filter(x => x.id !== p.id)]));
}
export async function deleteProject(id: string) {
  await AsyncStorage.removeItem(KEY(id));
  const list = await listProjects();
  await AsyncStorage.setItem(INDEX, JSON.stringify(list.filter(x => x.id !== id)));
}
