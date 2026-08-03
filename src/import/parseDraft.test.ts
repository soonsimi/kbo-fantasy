import { describe, expect, it } from 'vitest';
import { parseDraft } from './parseDraft';
import type { Manager, Player, PlayerId } from '../domain/types';

const MANAGERS: Manager[] = [
  { id: 'm1', name: '홍길동' },
  { id: 'm2', name: '이몽룡' },
  { id: 'm3', name: '김 철수' },
];

const PLAYERS: Record<PlayerId, Player> = Object.fromEntries(
  [
    ['김도영', 'KIA', 'hitter'],
    ['구자욱', '삼성', 'hitter'],
    ['레이예스', '롯데', 'hitter'],
    ['오스틴', 'LG', 'hitter'],
    ['원태인', '삼성', 'pitcher'],
    ['네일', 'KIA', 'pitcher'],
  ].map(([name, kboTeam, role]) => [
    name,
    { id: name, name, kboTeam, role } as Player,
  ]),
);

describe('parseDraft', () => {
  it('콜론 구분 형식을 읽는다', () => {
    const text = ['홍길동: 김도영, 구자욱, 원태인', '이몽룡: 레이예스, 오스틴, 네일'].join('\n');
    const result = parseDraft(text, MANAGERS, PLAYERS);

    expect(result.unknownManagers).toEqual([]);
    expect(result.unknownPlayers).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments[0]).toMatchObject({
      managerId: 'm1',
      playerIds: ['김도영', '구자욱', '원태인'],
    });
    expect(result.assignments[1].playerIds).toEqual(['레이예스', '오스틴', '네일']);
  });

  it('탭 구분과 하이픈 형식도 읽는다', () => {
    const tab = '홍길동\t김도영\t구자욱';
    expect(parseDraft(tab, MANAGERS, PLAYERS).assignments[0].playerIds).toEqual([
      '김도영',
      '구자욱',
    ]);

    const hyphen = '이몽룡 - 레이예스, 오스틴';
    expect(parseDraft(hyphen, MANAGERS, PLAYERS).assignments[0].playerIds).toEqual([
      '레이예스',
      '오스틴',
    ]);
  });

  it('이름의 공백 차이를 무시하고 대조한다', () => {
    const result = parseDraft('김철수: 김 도 영', MANAGERS, PLAYERS);
    expect(result.unknownManagers).toEqual([]);
    expect(result.assignments[0]).toMatchObject({ managerId: 'm3', playerIds: ['김도영'] });
  });

  it('명단에 없는 참가자는 건너뛰고 보고한다', () => {
    const result = parseDraft('장길산: 김도영', MANAGERS, PLAYERS);
    expect(result.unknownManagers).toEqual(['장길산']);
    expect(result.assignments).toEqual([]);
  });

  it('명단에 없는 선수는 배정하지 않고 보고한다', () => {
    const result = parseDraft('홍길동: 김도영, 없는선수', MANAGERS, PLAYERS);
    expect(result.unknownPlayers).toEqual(['없는선수']);
    expect(result.assignments[0].playerIds).toEqual(['김도영']);
  });

  it('같은 선수를 두 참가자에게 주면 충돌로 잡는다', () => {
    const text = ['홍길동: 김도영, 구자욱', '이몽룡: 김도영, 오스틴'].join('\n');
    const result = parseDraft(text, MANAGERS, PLAYERS);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toEqual({
      playerName: '김도영',
      managerNames: ['홍길동', '이몽룡'],
    });
  });

  it('한 줄 안의 중복은 한 번만 넣고 경고한다', () => {
    const result = parseDraft('홍길동: 김도영, 김도영, 구자욱', MANAGERS, PLAYERS);
    expect(result.assignments[0].playerIds).toEqual(['김도영', '구자욱']);
    expect(result.conflicts).toEqual([]);
    expect(result.warnings.join(' ')).toMatch(/두 번/);
  });

  it('같은 참가자가 여러 줄에 나오면 이어 붙인다', () => {
    const text = ['홍길동: 김도영, 구자욱', '홍길동: 원태인'].join('\n');
    const result = parseDraft(text, MANAGERS, PLAYERS);
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].playerIds).toEqual(['김도영', '구자욱', '원태인']);
  });

  it('구분자가 없는 줄은 경고한다', () => {
    const result = parseDraft('김도영 구자욱 원태인', MANAGERS, PLAYERS);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.assignments).toEqual([]);
  });

  it('빈 줄과 공백은 무시한다', () => {
    const text = ['', '  ', '홍길동: 김도영', ''].join('\n');
    const result = parseDraft(text, MANAGERS, PLAYERS);
    expect(result.assignments).toHaveLength(1);
  });

  it('선수 없이 이름만 있으면 경고한다', () => {
    const result = parseDraft('홍길동:', MANAGERS, PLAYERS);
    expect(result.warnings.join(' ')).toMatch(/선수 이름이 없습니다/);
    expect(result.assignments).toEqual([]);
  });
});
