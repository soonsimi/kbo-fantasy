import { useMemo, useState } from 'react';
import { formatInnings } from '../domain/innings';
import type { LeagueSnapshot, ManagerId, PlayerId } from '../domain/types';

interface Props {
  snapshot: LeagueSnapshot;
  update: (mutate: (current: LeagueSnapshot) => LeagueSnapshot) => void;
}

/** 한 선수는 한 참가자에게만 속한다 (드래프트 규칙). */
function assignmentMap(snapshot: LeagueSnapshot): Map<PlayerId, ManagerId> {
  const map = new Map<PlayerId, ManagerId>();
  for (const roster of snapshot.rosters) {
    for (const playerId of roster.playerIds) map.set(playerId, roster.managerId);
  }
  return map;
}

export function ManagersPanel({ snapshot, update }: Props) {
  const [newManagerName, setNewManagerName] = useState('');
  const [pickerFor, setPickerFor] = useState<ManagerId | null>(null);
  const [query, setQuery] = useState('');

  const assigned = useMemo(() => assignmentMap(snapshot), [snapshot]);

  const availablePlayers = useMemo(() => {
    const q = query.trim().replace(/\s+/g, '');
    return Object.values(snapshot.players)
      .filter((p) => !assigned.has(p.id))
      .filter((p) => (q === '' ? true : p.name.replace(/\s+/g, '').includes(q) || p.kboTeam.includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .slice(0, 60);
  }, [snapshot.players, assigned, query]);

  const addManager = () => {
    const name = newManagerName.trim();
    if (name === '') return;
    update((current) => ({
      ...current,
      managers: [...current.managers, { id: crypto.randomUUID(), name }],
    }));
    setNewManagerName('');
  };

  const removeManager = (managerId: ManagerId) => {
    update((current) => ({
      ...current,
      managers: current.managers.filter((m) => m.id !== managerId),
      rosters: current.rosters.filter((r) => r.managerId !== managerId),
    }));
  };

  const addPlayer = (managerId: ManagerId, playerId: PlayerId) => {
    update((current) => {
      const existing = current.rosters.find((r) => r.managerId === managerId);
      const rosters = existing
        ? current.rosters.map((r) =>
            r.managerId === managerId ? { ...r, playerIds: [...r.playerIds, playerId] } : r,
          )
        : [...current.rosters, { managerId, playerIds: [playerId] }];
      return { ...current, rosters };
    });
  };

  const removePlayer = (managerId: ManagerId, playerId: PlayerId) => {
    update((current) => ({
      ...current,
      rosters: current.rosters.map((r) =>
        r.managerId === managerId
          ? { ...r, playerIds: r.playerIds.filter((id) => id !== playerId) }
          : r,
      ),
    }));
  };

  const playerCount = Object.keys(snapshot.players).length;

  return (
    <div className="managers">
      <section className="card">
        <h2>참가자</h2>
        <div className="row">
          <input
            type="text"
            value={newManagerName}
            placeholder="참가자 이름"
            onChange={(e) => setNewManagerName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addManager();
            }}
          />
          <button type="button" onClick={addManager} disabled={newManagerName.trim() === ''}>
            추가
          </button>
        </div>
        <p className="hint">
          현재 {snapshot.managers.length}명. 로토서리는 인원수가 곧 부문 만점이라, 시즌 중 인원이
          바뀌면 지난 점수와 비교가 어긋납니다. 드래프트 전에 확정하세요.
        </p>
      </section>

      {snapshot.managers.length === 0 && (
        <p className="empty">참가자를 먼저 등록하세요.</p>
      )}

      {snapshot.managers.map((manager) => {
        const roster = snapshot.rosters.find((r) => r.managerId === manager.id);
        const playerIds = roster?.playerIds ?? [];
        return (
          <section className="card" key={manager.id}>
            <div className="card-head">
              <h3>
                {manager.name} <span className="count">{playerIds.length}명</span>
              </h3>
              <button type="button" className="danger" onClick={() => removeManager(manager.id)}>
                참가자 삭제
              </button>
            </div>

            {playerIds.length === 0 ? (
              <p className="hint">아직 지명한 선수가 없습니다.</p>
            ) : (
              <ul className="roster">
                {playerIds.map((playerId) => {
                  const player = snapshot.players[playerId];
                  const hitting = snapshot.hitting[playerId];
                  const pitching = snapshot.pitching[playerId];
                  return (
                    <li key={playerId}>
                      <span className="player-name">{player?.name ?? playerId}</span>
                      <span className="player-team">{player?.kboTeam ?? '-'}</span>
                      <span className="player-stat">
                        {hitting
                          ? `${hitting.hr}홈런 ${hitting.rbi}타점 ${hitting.sb}도루`
                          : pitching
                            ? `${formatInnings(pitching.ip)}이닝 ${pitching.w}승 ${pitching.so}삼진`
                            : '스탯 없음'}
                      </span>
                      <button
                        type="button"
                        className="link"
                        onClick={() => removePlayer(manager.id, playerId)}
                      >
                        제거
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {pickerFor === manager.id ? (
              <div className="picker">
                <div className="row">
                  <input
                    type="text"
                    value={query}
                    placeholder="선수명 또는 팀으로 검색"
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPickerFor(null);
                      setQuery('');
                    }}
                  >
                    닫기
                  </button>
                </div>
                {playerCount === 0 ? (
                  <p className="hint">
                    선수 명단이 비어 있습니다. <strong>스탯 불러오기</strong> 탭에서 기록을 먼저
                    넣으세요.
                  </p>
                ) : availablePlayers.length === 0 ? (
                  <p className="hint">조건에 맞는 미지명 선수가 없습니다.</p>
                ) : (
                  <ul className="candidates">
                    {availablePlayers.map((player) => (
                      <li key={player.id}>
                        <button type="button" onClick={() => addPlayer(manager.id, player.id)}>
                          <span className="player-name">{player.name}</span>
                          <span className="player-team">{player.kboTeam}</span>
                          <span className="player-role">
                            {player.role === 'hitter' ? '타자' : '투수'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPickerFor(manager.id);
                  setQuery('');
                }}
              >
                선수 지명
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
