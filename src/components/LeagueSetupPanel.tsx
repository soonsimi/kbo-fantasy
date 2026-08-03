import { useState } from 'react';
import { scoredMonthKeys } from '../domain/season';
import { DEFAULT_CATEGORIES } from '../domain/categories';
import { monthLabel } from '../domain/types';
import type { LeagueSnapshot, ManagerId } from '../domain/types';

interface Props {
  snapshot: LeagueSnapshot;
  update: (mutate: (current: LeagueSnapshot) => LeagueSnapshot) => void;
}

export function LeagueSetupPanel({ snapshot, update }: Props) {
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<ManagerId | null>(null);
  const [editName, setEditName] = useState('');

  const count = snapshot.managers.length;
  const scored = scoredMonthKeys(snapshot);
  const maxPerMonth = DEFAULT_CATEGORIES.length * count;

  const addManager = () => {
    const name = newName.trim();
    if (name === '') return;
    update((current) => ({
      ...current,
      managers: [...current.managers, { id: crypto.randomUUID(), name }],
    }));
    setNewName('');
  };

  const removeManager = (managerId: ManagerId) => {
    update((current) => ({
      ...current,
      managers: current.managers.filter((m) => m.id !== managerId),
      rosters: current.rosters.filter((r) => r.managerId !== managerId),
    }));
  };

  const saveName = (managerId: ManagerId) => {
    const name = editName.trim();
    if (name === '') return;
    update((current) => ({
      ...current,
      managers: current.managers.map((m) => (m.id === managerId ? { ...m, name } : m)),
    }));
    setEditing(null);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= count) return;
    update((current) => {
      const managers = [...current.managers];
      [managers[index], managers[target]] = [managers[target], managers[index]];
      return { ...current, managers };
    });
  };

  return (
    <div className="setup">
      <section className="card">
        <h2>참여 인원</h2>
        <p className="big-count">
          {count}
          <span className="unit">명</span>
        </p>
        <p className="hint">
          부문마다 1위 <strong>{count || 'N'}점</strong> ~ 최하위 <strong>1점</strong>을 줍니다.
          {count > 0 && (
            <>
              {' '}
              부문이 {DEFAULT_CATEGORIES.length}개이므로 한 달 만점은{' '}
              <strong>{maxPerMonth}점</strong>입니다.
            </>
          )}
        </p>

        <div className="row">
          <input
            type="text"
            value={newName}
            placeholder="참가자 이름"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addManager();
            }}
          />
          <button type="button" onClick={addManager} disabled={newName.trim() === ''}>
            추가
          </button>
        </div>

        {count > 0 && (
          <ol className="manager-list">
            {snapshot.managers.map((manager, index) => (
              <li key={manager.id}>
                {editing === manager.id ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveName(manager.id);
                        if (e.key === 'Escape') setEditing(null);
                      }}
                      autoFocus
                    />
                    <button type="button" onClick={() => saveName(manager.id)}>
                      저장
                    </button>
                    <button type="button" onClick={() => setEditing(null)}>
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <span className="manager-name">{manager.name}</span>
                    <span className="manager-actions">
                      <button
                        type="button"
                        className="link"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`${manager.name} 위로`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => move(index, 1)}
                        disabled={index === count - 1}
                        aria-label={`${manager.name} 아래로`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => {
                          setEditing(manager.id);
                          setEditName(manager.name);
                        }}
                      >
                        이름 수정
                      </button>
                      <button
                        type="button"
                        className="link danger-link"
                        onClick={() => removeManager(manager.id)}
                      >
                        삭제
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {scored.length > 0 && (
        <section className="card">
          <h3>인원 변경 주의</h3>
          <p className="alert warn">
            이미 <strong>{scored.map(monthLabel).join(', ')}</strong> 기록이 들어와 있습니다.
            <br />
            시즌 종합 순위는 월별 순위의 <strong>합산</strong>이라, 달마다 인원수가 다르면 순위
            범위가 달라져 합산이 왜곡됩니다. 예를 들어 9명이던 달의 최하위는 9위지만 8명인 달의
            최하위는 8위이므로, 같은 성적이라도 불리하거나 유리해집니다.
            <br />
            인원은 시즌 시작 전에 확정하는 것이 안전합니다.
          </p>
        </section>
      )}

      <section className="card">
        <h3>산정 방식</h3>
        <ul className="rules">
          <li>각 부문에서 참가자끼리 순위를 매기고, 그 순위에 역순으로 점수를 준다 (1위 = 인원수).</li>
          <li>동점자는 차지한 점수 구간을 균등 배분한다.</li>
          <li>부문 점수의 합이 그 달의 총점이고, 총점 순서가 그 달의 순위다.</li>
          <li>
            시즌 종합 순위는 <strong>월별 순위의 합산</strong>이다. 합이 작을수록 상위.
          </li>
          <li>순위 합이 같으면 월별 총점 합계가 높은 쪽이 상위다.</li>
          <li>기록이 없는 달은 산정에서 제외한다.</li>
        </ul>
      </section>
    </div>
  );
}
