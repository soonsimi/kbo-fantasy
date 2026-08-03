/**
 * 리그 상태 훅.
 *
 * 저장소에서 스냅샷을 읽고, 변경 시 저장한다.
 * 저장소가 실시간 구독을 지원하면(Firestore) 다른 참가자의 변경도 반영한다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getRepository } from './data';
import type { LeagueRepository } from './data';
import { emptySnapshot } from './domain/types';
import type { LeagueSnapshot } from './domain/types';

export interface UseLeagueResult {
  snapshot: LeagueSnapshot;
  storageLabel: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** 스냅샷을 갱신하고 저장한다. */
  update: (mutate: (current: LeagueSnapshot) => LeagueSnapshot) => void;
}

export function useLeague(season: number): UseLeagueResult {
  const [snapshot, setSnapshot] = useState<LeagueSnapshot>(() => emptySnapshot(season));
  const [storageLabel, setStorageLabel] = useState('연결 중…');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // update()가 저장할 때 쓰는 저장소 참조. 준비되기 전에는 null.
  const repositoryRef = useRef<LeagueRepository | null>(null);
  // 자기가 방금 저장한 내용이 구독으로 되돌아와 입력을 덮어쓰는 것을 막는다.
  const localWriteAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    setLoading(true);

    void (async () => {
      try {
        const repository = await getRepository();
        if (cancelled) return;

        repositoryRef.current = repository;
        setStorageLabel(repository.label);

        const loaded = await repository.load(season);
        if (cancelled) return;
        setSnapshot(loaded ?? emptySnapshot(season));

        unsubscribe = repository.subscribe?.(season, (remote) => {
          // 방금 로컬에서 저장한 직후라면 원격 반영을 건너뛴다
          if (Date.now() - localWriteAt.current < 1500) return;
          setSnapshot(remote);
        });
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '데이터를 읽지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [season]);

  const update = useCallback((mutate: (current: LeagueSnapshot) => LeagueSnapshot) => {
    setSnapshot((current) => {
      const next = mutate(current);
      const repository = repositoryRef.current;
      if (!repository) {
        setError('저장소가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.');
        return current;
      }

      localWriteAt.current = Date.now();
      setSaving(true);
      repository
        .save(next)
        .then(() => setError(null))
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
        })
        .finally(() => setSaving(false));
      return next;
    });
  }, []);

  return { snapshot, storageLabel, loading, saving, error, update };
}
