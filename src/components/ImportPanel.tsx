import { useMemo, useState } from 'react';
import { FIELD_LABELS } from '../import/columns';
import { parseStatTable, playerKey } from '../import/parseStatTable';
import type { ParseResult } from '../import/parseStatTable';
import { formatInnings } from '../domain/innings';
import type { LeagueSnapshot, PlayerRole } from '../domain/types';

interface Props {
  snapshot: LeagueSnapshot;
  update: (mutate: (current: LeagueSnapshot) => LeagueSnapshot) => void;
}

const GUIDE: Record<PlayerRole, { title: string; url: string; needs: string }> = {
  hitter: {
    title: 'KBO 기록실 → 선수 기록 → 타자',
    url: 'https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx',
    needs: '선수명, AB(타수), H(안타), HR, RBI, R(득점), SB(도루)',
  },
  pitcher: {
    title: 'KBO 기록실 → 선수 기록 → 투수',
    url: 'https://www.koreabaseball.com/Record/Player/PitcherBasic/Basic1.aspx',
    needs: '선수명, IP(이닝), ER(자책점), H(피안타), BB(볼넷), W(승), SV, SO(탈삼진)',
  },
};

export function ImportPanel({ snapshot, update }: Props) {
  const [role, setRole] = useState<PlayerRole>('hitter');
  const [text, setText] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  const result: ParseResult | null = useMemo(
    () => (text.trim() === '' ? null : parseStatTable(text, role)),
    [text, role],
  );

  const canApply = result !== null && result.rows.length > 0 && result.missingFields.length === 0;

  const handleFile = async (file: File) => {
    setText(await file.text());
    setApplied(null);
  };

  const apply = () => {
    if (!result || !canApply) return;

    update((current) => {
      const players = { ...current.players };
      const hitting = replaceExisting && role === 'hitter' ? {} : { ...current.hitting };
      const pitching = replaceExisting && role === 'pitcher' ? {} : { ...current.pitching };

      for (const row of result.rows) {
        const id = playerKey(row.name);
        players[id] = {
          id,
          name: row.name,
          kboTeam: row.kboTeam ?? players[id]?.kboTeam ?? '',
          role,
        };
        if (row.hitting) hitting[id] = row.hitting;
        if (row.pitching) pitching[id] = row.pitching;
      }

      return {
        ...current,
        players,
        hitting,
        pitching,
        statsUpdatedAt: new Date().toISOString(),
      };
    });

    setApplied(`${result.rows.length}명의 ${role === 'hitter' ? '타자' : '투수'} 기록을 반영했습니다.`);
    setText('');
  };

  const guide = GUIDE[role];

  return (
    <div className="import">
      <section className="card">
        <h2>스탯 불러오기</h2>
        <p className="hint">
          KBO 공식 사이트와 스탯티즈는 robots.txt에서 봇 접근을 전면 차단하고 있어 자동 수집을
          하지 않습니다. 브라우저에서 표를 직접 선택·복사해 아래에 붙여넣으세요. 시즌 누적
          방식이므로 주 1회 갱신으로 충분합니다.
        </p>

        <div className="row role-select">
          <label>
            <input
              type="radio"
              checked={role === 'hitter'}
              onChange={() => {
                setRole('hitter');
                setApplied(null);
              }}
            />
            타자 표
          </label>
          <label>
            <input
              type="radio"
              checked={role === 'pitcher'}
              onChange={() => {
                setRole('pitcher');
                setApplied(null);
              }}
            />
            투수 표
          </label>
        </div>

        <p className="hint">
          출처: <strong>{guide.title}</strong>{' '}
          <a href={guide.url} target="_blank" rel="noreferrer noopener">
            열기
          </a>
          <br />
          필요한 열: {guide.needs}
        </p>

        <textarea
          value={text}
          rows={10}
          placeholder="표 전체(머리글 포함)를 복사해 붙여넣으세요. 탭 구분 또는 CSV 모두 됩니다."
          onChange={(e) => {
            setText(e.target.value);
            setApplied(null);
          }}
        />

        <div className="row">
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
            />
            기존 {role === 'hitter' ? '타자' : '투수'} 스탯을 모두 지우고 교체
          </label>
        </div>
        <p className="hint">
          KBO 기록실은 페이지가 나뉘어 있습니다. 여러 페이지를 이어서 붙여넣을 때는 교체 옵션을
          끄고 한 페이지씩 넣으세요. 켜면 이전에 넣은 페이지가 지워집니다.
        </p>
      </section>

      {applied && <p className="ok">{applied}</p>}

      {result && (
        <section className="card">
          <h3>미리보기</h3>

          {result.missingFields.length > 0 && (
            <div className="alert error">
              <strong>필수 열이 없어 반영할 수 없습니다.</strong>
              <ul>
                {result.missingFields.map((f) => (
                  <li key={f}>{FIELD_LABELS[f]}</li>
                ))}
              </ul>
              표의 머리글까지 함께 복사했는지, 필요한 열이 보이는 화면인지 확인하세요.
            </div>
          )}

          <p className="hint">
            인식한 선수 {result.rows.length}명 / 사용한 열{' '}
            {[...result.mapping.values()].map((f) => FIELD_LABELS[f]).join(', ') || '없음'}
            {result.unmappedHeaders.length > 0 && (
              <>
                <br />
                무시한 열: {result.unmappedHeaders.join(', ')}
              </>
            )}
          </p>

          {result.warnings.length > 0 && (
            <div className="alert warn">
              <ul>
                {result.warnings.slice(0, 10).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              {result.warnings.length > 10 && <p>… 외 {result.warnings.length - 10}건</p>}
            </div>
          )}

          {result.rows.length > 0 && (
            <div className="table-scroll">
              <table className="preview-table">
                <thead>
                  {role === 'hitter' ? (
                    <tr>
                      <th>선수</th>
                      <th>팀</th>
                      <th>AB</th>
                      <th>H</th>
                      <th>HR</th>
                      <th>RBI</th>
                      <th>R</th>
                      <th>SB</th>
                    </tr>
                  ) : (
                    <tr>
                      <th>선수</th>
                      <th>팀</th>
                      <th>IP</th>
                      <th>ER</th>
                      <th>피안타</th>
                      <th>BB</th>
                      <th>W</th>
                      <th>SV</th>
                      <th>SO</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {result.rows.slice(0, 8).map((row, i) => (
                    <tr key={`${row.name}-${i}`}>
                      <td>{row.name}</td>
                      <td>{row.kboTeam ?? '-'}</td>
                      {row.hitting && (
                        <>
                          <td>{row.hitting.ab}</td>
                          <td>{row.hitting.h}</td>
                          <td>{row.hitting.hr}</td>
                          <td>{row.hitting.rbi}</td>
                          <td>{row.hitting.r}</td>
                          <td>{row.hitting.sb}</td>
                        </>
                      )}
                      {row.pitching && (
                        <>
                          <td>{formatInnings(row.pitching.ip)}</td>
                          <td>{row.pitching.er}</td>
                          <td>{row.pitching.hitsAllowed}</td>
                          <td>{row.pitching.bb}</td>
                          <td>{row.pitching.w}</td>
                          <td>{row.pitching.sv}</td>
                          <td>{row.pitching.so}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length > 8 && (
                <p className="hint">앞 8명만 표시했습니다 (전체 {result.rows.length}명).</p>
              )}
            </div>
          )}

          <button type="button" onClick={apply} disabled={!canApply}>
            {result.rows.length}명 반영하기
          </button>
        </section>
      )}

      <section className="card">
        <h3>현재 저장된 선수</h3>
        <p className="hint">
          타자 {Object.keys(snapshot.hitting).length}명 / 투수{' '}
          {Object.keys(snapshot.pitching).length}명
          {snapshot.statsUpdatedAt && (
            <>
              <br />
              마지막 갱신: {new Date(snapshot.statsUpdatedAt).toLocaleString('ko-KR')}
            </>
          )}
        </p>
      </section>
    </div>
  );
}
