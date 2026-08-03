import { useMemo, useState } from 'react';
import { parseDraft } from '../import/parseDraft';
import type { DraftParseResult } from '../import/parseDraft';
import type { LeagueSnapshot, ManagerId, PlayerId } from '../domain/types';

interface Props {
  snapshot: LeagueSnapshot;
  update: (mutate: (current: LeagueSnapshot) => LeagueSnapshot) => void;
}

/** 한 선수는 한 참가자에게만 속한다. */
function assignmentMap(snapshot: LeagueSnapshot): Map<PlayerId, ManagerId> {
  const map = new Map<PlayerId, ManagerId>();
  for (const roster of snapshot.rosters) {
    for (const playerId of roster.playerIds) map.set(playerId, roster.managerId);
  }
  return map;
}

const EXAMPLE = ['홍길동: 김도영, 구자욱, 원태인', '이몽룡: 레이예스, 오스틴, 네일'].join('\n');

export function DraftPanel({ snapshot, update }: Props) {
  const [bulkText, setBulkText] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<ManagerId | null>(null);
  const [query, setQuery] = useState('');

  const assigned = useMemo(() => assignmentMap(snapshot), [snapshot]);
  const playerCount = Object.keys(snapshot.players).length;

  const draft: DraftParseResult | null = useMemo(
    () =>
      bulkText.trim() === ''
        ? null
        : parseDraft(bulkText, snapshot.managers, snapshot.players),
    [bulkText, snapshot.managers, snapshot.players],
  );

  const canApplyBulk =
    draft !== null && draft.assignments.length > 0 && draft.conflicts.length === 0;

  const applyBulk = () => {
    if (!draft || !canApplyBulk) return;

    update((current) => {
      // 일괄 입력에 나온 참가자만 교체하고, 나오지 않은 참가자는 건드리지 않는다
      const touched = new Set(draft.assignments.map((a) => a.managerId));
      const kept = current.rosters.filter((r) => !touched.has(r.managerId));
      return {
        ...current,
        rosters: [
          ...kept,
          ...draft.assignments.map((a) => ({ managerId: a.managerId, playerIds: a.playerIds })),
        ],
      };
    });

    const total = draft.assignments.reduce((s, a) => s + a.playerIds.length, 0);
    setApplied(`${draft.assignments.length}명에게 총 ${total}명의 선수를 배정했습니다.`);
    setBulkText('');
  };

  const availablePlayers = useMemo(() => {
    const q = query.trim().replace(/\s+/g, '');
    return Object.values(snapshot.players)
      .filter((p) => !assigned.has(p.id))
      .filter((p) =>
        q === '' ? true : p.name.replace(/\s+/g, '').includes(q) || p.kboTeam.includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .slice(0, 60);
  }, [snapshot.players, assigned, query]);

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

  const clearRoster = (managerId: ManagerId) => {
    update((current) => ({
      ...current,
      rosters: current.rosters.map((r) =>
        r.managerId === managerId ? { ...r, playerIds: [] } : r,
      ),
    }));
  };

  if (snapshot.managers.length === 0) {
    return (
      <p className="empty">
        참가자가 없습니다. <strong>리그 설정</strong> 탭에서 참여 인원을 먼저 등록하세요.
      </p>
    );
  }

  return (
    <div className="draft">
      <section className="card">
        <h2>드래프트 결과 일괄 입력</h2>
        <p className="hint">
          오프라인에서 진행한 지명 결과를 한 번에 옮겨 적습니다. 한 줄에 참가자 한 명씩,
          <code>이름: 선수1, 선수2</code> 형식으로 적으세요. 탭 구분과 <code>이름 - 선수1</code>{' '}
          형식도 됩니다.
        </p>
        {playerCount === 0 && (
          <p className="alert warn">
            선수 명단이 비어 있습니다. <strong>스탯 불러오기</strong> 탭에서 기록을 먼저 넣어야
            이름을 대조할 수 있습니다.
          </p>
        )}

        <textarea
          value={bulkText}
          rows={8}
          placeholder={EXAMPLE}
          onChange={(e) => {
            setBulkText(e.target.value);
            setApplied(null);
          }}
        />

        {draft && (
          <>
            {draft.conflicts.length > 0 && (
              <div className="alert error">
                <strong>같은 선수를 두 명 이상에게 배정했습니다.</strong>
                <ul>
                  {draft.conflicts.map((c) => (
                    <li key={c.playerName}>
                      {c.playerName} → {c.managerNames.join(', ')}
                    </li>
                  ))}
                </ul>
                한 선수는 한 참가자에게만 속할 수 있습니다.
              </div>
            )}

            {draft.unknownManagers.length > 0 && (
              <div className="alert warn">
                참가자 명단에 없는 이름: <strong>{draft.unknownManagers.join(', ')}</strong>
                <br />
                리그 설정 탭의 이름과 정확히 같아야 합니다. 이 줄은 무시됩니다.
              </div>
            )}

            {draft.unknownPlayers.length > 0 && (
              <div className="alert warn">
                선수 명단에 없는 이름 ({draft.unknownPlayers.length}명):{' '}
                <strong>{draft.unknownPlayers.slice(0, 15).join(', ')}</strong>
                {draft.unknownPlayers.length > 15 && ' …'}
                <br />
                해당 선수가 포함된 스탯 표를 먼저 불러오세요. 이 선수들은 배정되지 않습니다.
              </div>
            )}

            {draft.warnings.length > 0 && (
              <div className="alert warn">
                <ul>
                  {draft.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {draft.assignments.length > 0 && (
              <div className="table-scroll">
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>참가자</th>
                      <th>인원</th>
                      <th>배정될 선수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.assignments.map((a) => (
                      <tr key={a.managerId}>
                        <td>{a.managerName}</td>
                        <td>{a.playerIds.length}</td>
                        <td>
                          {a.playerIds.map((id) => snapshot.players[id]?.name ?? id).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="hint">
              입력에 나온 참가자의 로스터만 교체합니다. 나오지 않은 참가자는 그대로 둡니다.
            </p>

            <button type="button" onClick={applyBulk} disabled={!canApplyBulk}>
              배정하기
            </button>
          </>
        )}
      </section>

      {applied && <p className="ok">{applied}</p>}

      <h2 className="section-title">참가자별 로스터</h2>

      {snapshot.managers.map((manager) => {
        const roster = snapshot.rosters.find((r) => r.managerId === manager.id);
        const playerIds = roster?.playerIds ?? [];
        return (
          <section className="card" key={manager.id}>
            <div className="card-head">
              <h3>
                {manager.name} <span className="count">{playerIds.length}명</span>
              </h3>
              {playerIds.length > 0 && (
                <button type="button" className="danger" onClick={() => clearRoster(manager.id)}>
                  전체 해제
                </button>
              )}
            </div>

            {playerIds.length === 0 ? (
              <p className="hint">아직 배정된 선수가 없습니다.</p>
            ) : (
              <ul className="chips">
                {playerIds.map((playerId) => {
                  const player = snapshot.players[playerId];
                  return (
                    <li key={playerId}>
                      <span className="chip-name">{player?.name ?? playerId}</span>
                      <span className="chip-team">{player?.kboTeam ?? '-'}</span>
                      <span className="chip-role">
                        {player?.role === 'pitcher' ? '투' : '타'}
                      </span>
                      <button
                        type="button"
                        className="chip-remove"
                        onClick={() => removePlayer(manager.id, playerId)}
                        aria-label={`${player?.name ?? playerId} 제거`}
                      >
                        ×
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
                  <p className="hint">선수 명단이 비어 있습니다.</p>
                ) : availablePlayers.length === 0 ? (
                  <p className="hint">조건에 맞는 미배정 선수가 없습니다.</p>
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
                선수 추가
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
