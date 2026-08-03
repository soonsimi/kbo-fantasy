// @vitest-environment jsdom

/**
 * 렌더 스모크 테스트.
 *
 * 타입체크와 빌드는 통과해도 훅 사용 오류 같은 런타임 문제는 잡히지 않는다.
 * 실제로 마운트해서 탭 이동·참가자 추가·표 붙여넣기까지 동작하는지 확인한다.
 * 저장소는 Firebase 설정이 없으므로 localStorage 구현이 쓰인다.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

const HITTER_TSV = [
  '순위\t선수명\t팀명\tAVG\tG\tPA\tAB\tR\tH\t2B\t3B\tHR\tTB\tRBI\tSB',
  '1\t김도영\tKIA\t0.347\t141\t625\t544\t143\t189\t29\t10\t38\t363\t109\t40',
  '2\t구자욱\t삼성\t0.343\t129\t558\t484\t92\t166\t39\t1\t33\t306\t115\t13',
].join('\n');

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('App', () => {
  it('앱이 마운트되고 localStorage 저장소로 연결된다', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'KBO 판타지 리그' })).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/localStorage/)).toBeTruthy();
    });
  });

  it('참가자가 없으면 순위표가 안내 문구를 보여준다', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/참가자가 없습니다/)).toBeTruthy();
    });
  });

  it('참가자를 추가하면 목록과 머리글에 반영된다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));

    fireEvent.click(screen.getByRole('button', { name: '참가자 · 로스터' }));

    const input = screen.getByPlaceholderText('참가자 이름');
    fireEvent.change(input, { target: { value: '홍길동' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: /홍길동/ })).toBeTruthy();
    });
    expect(screen.getByText(/참가자 1명/)).toBeTruthy();
  });

  it('표를 붙여넣으면 미리보기가 나오고 반영된다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));

    fireEvent.click(screen.getByRole('button', { name: '스탯 불러오기' }));

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: HITTER_TSV } });

    await waitFor(() => {
      expect(screen.getByText(/인식한 선수 2명/)).toBeTruthy();
    });
    expect(screen.getByText('김도영')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '2명 반영하기' }));

    await waitFor(() => {
      expect(screen.getByText(/2명의 타자 기록을 반영했습니다/)).toBeTruthy();
    });
    expect(screen.getByText(/타자 2명/)).toBeTruthy();
  });

  it('참가자와 스탯이 모두 있으면 순위표에 점수가 표시된다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));

    // 스탯 먼저 넣는다
    fireEvent.click(screen.getByRole('button', { name: '스탯 불러오기' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: HITTER_TSV } });
    await waitFor(() => screen.getByRole('button', { name: '2명 반영하기' }));
    fireEvent.click(screen.getByRole('button', { name: '2명 반영하기' }));
    await waitFor(() => screen.getByText(/타자 2명/));

    // 참가자 2명 등록
    fireEvent.click(screen.getByRole('button', { name: '참가자 · 로스터' }));
    for (const name of ['가팀', '나팀']) {
      fireEvent.change(screen.getByPlaceholderText('참가자 이름'), { target: { value: name } });
      fireEvent.click(screen.getByRole('button', { name: '추가' }));
      await waitFor(() => screen.getByRole('heading', { level: 3, name: new RegExp(name) }));
    }

    // 가팀에 김도영 지명
    fireEvent.click(screen.getAllByRole('button', { name: '선수 지명' })[0]);
    await waitFor(() => screen.getByPlaceholderText('선수명 또는 팀으로 검색'));
    fireEvent.click(screen.getByRole('button', { name: /김도영/ }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: /가팀/ }).textContent).toMatch(/1명/);
    });

    // 순위표에서 점수 확인
    fireEvent.click(screen.getByRole('button', { name: '순위표' }));
    await waitFor(() => {
      expect(screen.getByText(/만점은 20점입니다/)).toBeTruthy();
    });

    const rows = screen.getAllByRole('row');
    // 머리글 2행 + 참가자 2행
    expect(rows.length).toBe(4);
  });
});
