/**
 * 저장소 선택.
 *
 * Firebase 설정이 있으면 Firestore, 없으면 localStorage.
 * 덕분에 Firebase 프로젝트를 만들기 전에도 앱 전체를 실행하고 검증할 수 있다.
 *
 * Firebase SDK는 설정이 있을 때만 동적으로 불러오므로 비동기다.
 */

import { getFirebase } from '../firebase';
import { LocalLeagueRepository } from './localRepository';
import type { LeagueRepository } from './repository';

let pending: Promise<LeagueRepository> | undefined;

async function create(): Promise<LeagueRepository> {
  const firebase = await getFirebase();
  if (!firebase) return new LocalLeagueRepository();

  const { FirestoreLeagueRepository } = await import('./firestoreRepository');
  return new FirestoreLeagueRepository(
    firebase.db,
    firebase.app.options.projectId ?? 'unknown',
  );
}

export function getRepository(): Promise<LeagueRepository> {
  pending ??= create();
  return pending;
}

export type { LeagueRepository } from './repository';
