/**
 * 붙여넣은 스탯 표(TSV) 또는 CSV 파일을 도메인 스탯으로 변환한다.
 *
 * 자동 크롤링 대신 이 경로를 쓴다. KBO 공식 사이트와 스탯티즈 모두
 * robots.txt에서 봇 접근을 전면 차단하고 있어(목적 무관), 사람이 브라우저에서
 * 열람한 표를 복사해 넣는 방식으로 데이터를 받는다.
 *
 * 부분 임포트가 기본이다. 필요한 항목이 한 페이지에 다 없기 때문이다 —
 * KBO 기록실은 타자 R·H·HR·RBI가 기본기록1, BB·SO·GDP가 기본기록2에 나뉘어 있다.
 * 그래서 이 파서는 "표에 있는 열만" 읽어 돌려주고, 반영 단계에서 기존 값에 덮어쓴다.
 * 여러 표를 차례로 넣으면 열이 하나씩 채워진다.
 *
 * 나중에 정식 데이터 제공 경로가 열리면 같은 ParseResult를 돌려주는
 * 어댑터만 추가하면 되고, 도메인·UI는 건드릴 필요가 없다.
 */

import Papa from 'papaparse';
import { parseInnings } from '../domain/innings';
import type { PlayerRole, StatField } from '../domain/types';
import { aliasTable, fieldLabel, normalizeHeader, statFieldsFor } from './columns';
import type { MappedField } from './columns';

export interface ImportedRow {
  name: string;
  kboTeam: string | null;
  /** 이 표에서 실제로 읽은 필드만 담는다 */
  stats: Partial<Record<StatField, number>>;
}

export interface ParseResult {
  role: PlayerRole;
  rows: ImportedRow[];
  /** 인식한 열: 열 인덱스 → 필드 */
  mapping: Map<number, MappedField>;
  /** 이 표가 채워주는 스탯 필드 */
  providedFields: StatField[];
  /** 부문 산정에 필요한데 이 표에 없는 필드 */
  absentFields: StatField[];
  /** 인식하지 못해 무시한 열 이름 */
  unmappedHeaders: string[];
  /** 값이 있으면 반영 불가 (이름 열이나 스탯 열이 아예 없는 경우) */
  fatal: string | null;
  warnings: string[];
}

/** 숫자 셀 파싱. 빈칸·'-'는 null. */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/,/g, '');
  if (s === '' || s === '-' || s === '–') return null;
  // '.300' 같은 선행 0 생략 표기 허용
  const n = Number(s.startsWith('.') ? `0${s}` : s);
  return Number.isFinite(n) ? n : null;
}

/** 선수 식별 키. 표기 차이를 흡수하기 위해 공백을 제거한다. */
export function playerKey(name: string): string {
  return name.replace(/\s+/g, '');
}

function looksLikeHeader(cells: string[], aliases: Map<string, MappedField>): boolean {
  let hits = 0;
  let hasName = false;
  for (const cell of cells) {
    const field = aliases.get(normalizeHeader(cell));
    if (field) {
      hits += 1;
      if (field === 'name') hasName = true;
    }
  }
  return hasName && hits >= 2;
}

function emptyResult(role: PlayerRole, fatal: string): ParseResult {
  return {
    role,
    rows: [],
    mapping: new Map(),
    providedFields: [],
    absentFields: statFieldsFor(role),
    unmappedHeaders: [],
    fatal,
    warnings: [],
  };
}

export function parseStatTable(text: string, role: PlayerRole): ParseResult {
  const warnings: string[] = [];
  const aliases = aliasTable(role);
  const wanted = new Set<StatField>(statFieldsFor(role));

  const parsed = Papa.parse<string[]>(text.trim(), {
    delimiter: '', // 탭/쉼표 자동 판별
    skipEmptyLines: 'greedy',
  });

  const grid = parsed.data.filter((row) => Array.isArray(row) && row.some((c) => c.trim() !== ''));

  if (grid.length === 0) return emptyResult(role, '읽을 내용이 없습니다.');

  // 헤더 행 찾기 — 앞에 제목·설명 줄이 붙어 있어도 건너뛴다
  let headerIndex = grid.findIndex((row) => looksLikeHeader(row, aliases));
  if (headerIndex === -1) {
    headerIndex = 0;
    warnings.push(
      '열 제목 행을 찾지 못해 첫 줄을 제목으로 간주했습니다. 표의 머리글까지 함께 복사했는지 확인해 주세요.',
    );
  }

  const headerCells = grid[headerIndex];
  const mapping = new Map<number, MappedField>();
  const unmappedHeaders: string[] = [];
  const seenFields = new Set<MappedField>();

  headerCells.forEach((cell, index) => {
    const label = cell.trim();
    if (label === '') return;
    const field = aliases.get(normalizeHeader(label));
    if (!field) {
      unmappedHeaders.push(label);
      return;
    }
    // 부문에 쓰지 않는 스탯 열은 읽지 않는다
    if (field !== 'name' && field !== 'kboTeam' && !wanted.has(field)) {
      unmappedHeaders.push(label);
      return;
    }
    if (seenFields.has(field)) {
      // KBO 표는 AVG가 두 번 나오는 등 중복 열이 있다. 첫 번째만 쓴다.
      warnings.push(`'${label}' 열이 중복이라 첫 번째 것만 사용했습니다.`);
      return;
    }
    mapping.set(index, field);
    seenFields.add(field);
  });

  if (!seenFields.has('name')) {
    return emptyResult(
      role,
      '선수명 열을 찾지 못했습니다. 표의 머리글까지 함께 복사했는지 확인해 주세요.',
    );
  }

  const providedFields = [...seenFields].filter((f): f is StatField =>
    wanted.has(f as StatField),
  );

  if (providedFields.length === 0) {
    return emptyResult(
      role,
      `${role === 'hitter' ? '타자' : '투수'} 부문에 쓰는 스탯 열이 하나도 없습니다. ` +
        `필요한 열: ${statFieldsFor(role).map((f) => fieldLabel(f, role)).join(', ')}`,
    );
  }

  const absentFields = statFieldsFor(role).filter((f) => !seenFields.has(f));

  const rows: ImportedRow[] = [];
  const keyToTeams = new Map<string, Set<string>>();

  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const cells = grid[i];
    const values = new Map<MappedField, string>();
    for (const [index, field] of mapping) {
      values.set(field, (cells[index] ?? '').trim());
    }

    const name = (values.get('name') ?? '').trim();
    if (name === '') continue;
    // 합계·평균 같은 요약 행은 제외
    if (/^(합계|총계|평균|TOTAL|AVERAGE)$/i.test(name)) continue;

    const kboTeam = (values.get('kboTeam') ?? '').trim() || null;
    const stats: Partial<Record<StatField, number>> = {};

    for (const field of providedFields) {
      const raw = values.get(field) ?? '';
      // 이닝만 '159 2/3' 같은 분수 표기를 쓴다
      const parsedValue = field === 'ip' ? parseInnings(raw) : parseNumber(raw);
      if (parsedValue === null) {
        if (raw !== '') {
          warnings.push(`${name}: ${fieldLabel(field, role)} 값 '${raw}'을 읽지 못했습니다.`);
        }
        continue; // 빈 칸은 0으로 덮어쓰지 않고 건드리지 않는다
      }
      stats[field] = parsedValue;
    }

    if (kboTeam) {
      const teams = keyToTeams.get(playerKey(name)) ?? new Set<string>();
      teams.add(kboTeam);
      keyToTeams.set(playerKey(name), teams);
    }

    rows.push({ name, kboTeam, stats });
  }

  // 동명이인 감지 — 이름을 식별자로 쓰기 때문에 여기서 반드시 걸러야 한다
  for (const [key, teams] of keyToTeams) {
    if (teams.size > 1) {
      warnings.push(
        `동명이인 의심: '${key}' 이(가) 서로 다른 팀(${[...teams].join(', ')})으로 ${teams.size}번 나옵니다. ` +
          '그대로 두면 스탯이 합쳐집니다.',
      );
    }
  }

  if (rows.length === 0) warnings.push('데이터 행을 찾지 못했습니다.');

  return { role, rows, mapping, providedFields, absentFields, unmappedHeaders, fatal: null, warnings };
}
