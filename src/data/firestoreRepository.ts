/**
 * Firestore 기반 저장소.
 *
 * 시즌 하나를 문서 하나(leagues/{season})로 저장한다.
 * 12인 리그 × 로스터 20명 ≈ 240명 규모면 문서 크기가 수십 KB로,
 * Firestore 문서 상한 1MB에 한참 못 미친다. 문서 하나로 두면
 * 순위 계산에 필요한 데이터가 항상 원자적으로 일관된 상태로 읽힌다.
 */

import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { LeagueSnapshot } from '../domain/types';
import type { LeagueRepository } from './repository';
import { type LeagueDoc, fromDoc, toDoc } from './wire';

export class FirestoreLeagueRepository implements LeagueRepository {
  readonly label: string;
  private readonly db: Firestore;

  constructor(db: Firestore, projectId: string) {
    this.db = db;
    this.label = `Firestore (${projectId})`;
  }

  private ref(season: number) {
    return doc(this.db, 'leagues', String(season));
  }

  async load(season: number): Promise<LeagueSnapshot | null> {
    const snap = await getDoc(this.ref(season));
    if (!snap.exists()) return null;
    return fromDoc(snap.data() as LeagueDoc);
  }

  async save(snapshot: LeagueSnapshot): Promise<void> {
    await setDoc(this.ref(snapshot.season), toDoc(snapshot));
  }

  subscribe(season: number, onChange: (snapshot: LeagueSnapshot) => void): () => void {
    return onSnapshot(
      this.ref(season),
      (snap) => {
        if (snap.exists()) onChange(fromDoc(snap.data() as LeagueDoc));
      },
      (error) => {
        console.error('[firestore] 실시간 구독 실패', error);
      },
    );
  }
}
