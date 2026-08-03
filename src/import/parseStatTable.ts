/**
 * 붙여넣은 스탯 표(TSV) 또는 CSV 파일을 도메인 스탯으로 변환한다.
 *
 * 자동 크롤링 대신 이 경로를 쓴다. KBO 공식 사이트와 스탯티즈 모두
 * robots.txt에서 봇 접근을 전면 차단하고 있어(목적 무관), 사람이 브라우저에서
 * 열람한 표를 복사해 넣는 방식으로 데이터를 받는다.
 *
 * 나중에 정식 데이터 제공 경로가 열리면 이 모듈과 같은 ParseResult를 돌려주는
 * 어댑터만 추가하면 되고, 도메인·UI는 건드릴 필요가 없다.
 */

import Papa from 'papaparse';
import { parseInnings } from '../domain/innings';
import { EMPTY_HITTING, EMPTY_PITCHING } from '../domain/types';
import type { HittingLine, PitchingLine, PlayerRole } from '../domain/types';
import { FIELD_LABELS, aliasTable, normalizeHeader, requiredFields } from './columns';
import type { MappedField } from './columns';

export interface ImportedRow {
  name: string;
  kboTeam: string | null;
  hitting: HittingLine | null;
  pitching: PitchingLine | null;
}

export interface ParseResult {
  role: PlayerRole;
  rows: ImportedRow[];
  /** 인식한 열: 열 인덱스 → 필드 */
  mapping: Map<number, MappedField>;
  /** 인식하지 못해 무시한 열 이름 */
  unmappedHeaders: string[];
  /** 필수인데 표에 없는 필드 */
  missingFields: MappedField[];
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
  return hasName && hits >= 3;
}

export function parseStatTable(text: string, role: PlayerRole): ParseResult {
  const warnings: string[] = [];
  const aliases = aliasTable(role);

  const parsed = Papa.parse<string[]>(text.trim(), {
    delimiter: '', // 탭/쉼표 자동 판별
    skipEmptyLines: 'greedy',
  });

  const grid = parsed.data.filter((row) => Array.isArray(row) && row.some((c) => c.trim() !== ''));

  if (grid.length === 0) {
    return {
      role,
      rows: [],
      mapping: new Map(),
      unmappedHeaders: [],
      missingFields: requiredFields(role),
      warnings: ['읽을 내용이 없습니다.'],
    };
  }

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
    if (seenFields.has(field)) {
      // 같은 필드가 두 번 나오면 첫 번째만 쓴다 (KBO 표는 AVG가 두 번 나오는 등 중복이 있다)
      warnings.push(`'${label}' 열이 중복이라 첫 번째 것만 사용했습니다.`);
      return;
    }
    mapping.set(index, field);
    seenFields.add(field);
  });

  const missingFields = requiredFields(role).filter((f) => !seenFields.has(f));

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

    let hitting: HittingLine | null = null;
    let pitching: PitchingLine | null = null;

    if (role === 'hitter') {
      hitting = { ...EMPTY_HITTING };
      for (const field of ['ab', 'h', 'hr', 'rbi', 'r', 'sb'] as const) {
        const n = parseNumber(values.get(field) ?? '');
        if (n === null && values.has(field) && (values.get(field) ?? '') !== '') {
          warnings.push(`${name}: ${FIELD_LABELS[field]} 값 '${values.get(field)}'을 읽지 못했습니다.`);
        }
        hitting[field] = n ?? 0;
      }
    } else {
      pitching = { ...EMPTY_PITCHING };
      const ipRaw = values.get('ip') ?? '';
      const ip = parseInnings(ipRaw);
      if (ip === null && ipRaw !== '') {
        warnings.push(`${name}: 이닝 '${ipRaw}'을 읽지 못했습니다.`);
      }
      pitching.ip = ip ?? 0;

      for (const field of ['er', 'hitsAllowed', 'bb', 'w', 'sv', 'so'] as const) {
        const n = parseNumber(values.get(field) ?? '');
        if (n === null && (values.get(field) ?? '') !== '') {
          warnings.push(`${name}: ${FIELD_LABELS[field]} 값 '${values.get(field)}'을 읽지 못했습니다.`);
        }
        pitching[field] = n ?? 0;
      }
    }

    const key = playerKey(name);
    if (kboTeam) {
      const teams = keyToTeams.get(key) ?? new Set<string>();
      teams.add(kboTeam);
      keyToTeams.set(key, teams);
    }

    rows.push({ name, kboTeam, hitting, pitching });
  }

  // 동명이인 감지 — 이름을 식별자로 쓰기 때문에 여기서 반드시 걸러야 한다
  for (const [key, teams] of keyToTeams) {
    if (teams.size > 1) {
      warnings.push(
        `동명이인 의심: '${key}' 이(가) 서로 다른 팀(${[...teams].join(', ')})으로 ${teams.size}번 나옵니다. ` +
          '선수 관리 화면에서 구분해 주세요. 그대로 두면 스탯이 합쳐집니다.',
      );
    }
  }

  if (rows.length === 0) {
    warnings.push('데이터 행을 찾지 못했습니다.');
  }

  return { role, rows, mapping, unmappedHeaders, missingFields, warnings };
}
