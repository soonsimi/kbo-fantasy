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

const HITTER_BASIC1 = [
  '순위\t선수명\t팀명\tR\tH\tHR\tRBI\tSB',
  '1\t김도영\tKIA\t143\t189\t38\t109\t40',
  '2\t구자욱\t삼성\t92\t166\t33\t115\t13',
].join('\n');

const HITTER_BASIC2 = [
  '순위\t선수명\t팀명\tBB\tSO\tGDP',
  '1\t김도영\tKIA\t66\t97\t7',
  '2\t구자욱\t삼성\t58\t70\t11',
].join('\n');

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

/** 임포트 탭에서 표 하나를 붙여넣고 반영한다 */
async function pasteAndApply(text: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  await waitFor(() => screen.getByRole('button', { name: '2명 반영하기' }));
  fireEvent.click(screen.getByRole('button', { name: '2명 반영하기' }));
  await waitFor(() => screen.getByText(/반영했습니다/));
}

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

    fireEvent.change(screen.getByPlaceholderText('참가자 이름'), { target: { value: '홍길동' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: /홍길동/ })).toBeTruthy();
    });
    expect(screen.getByText(/참가자 1명/)).toBeTruthy();
  });

  it('아직 안 넣은 항목을 알려준다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));

    fireEvent.click(screen.getByRole('button', { name: '스탯 불러오기' }));

    // 아무것도 넣기 전에는 8개 항목 전부 미입력
    expect(screen.getByText(/아직 안 넣은 항목/)).toBeTruthy();

    await pasteAndApply(HITTER_BASIC1);

    // 1번 표를 넣으면 BB·SO·GDP만 남는다
    await waitFor(() => {
      const missing = screen.getByText(/아직 안 넣은 항목/).parentElement!;
      expect(missing.textContent).toMatch(/볼넷/);
      expect(missing.textContent).toMatch(/병살타/);
      expect(missing.textContent).not.toMatch(/홈런/);
    });
  });

  it('두 표를 이어 넣으면 타자 항목이 모두 채워진다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));
    fireEvent.click(screen.getByRole('button', { name: '스탯 불러오기' }));

    await pasteAndApply(HITTER_BASIC1);
    await pasteAndApply(HITTER_BASIC2);

    await waitFor(() => {
      expect(screen.getByText(/타자 부문 항목이 모두 채워졌습니다/)).toBeTruthy();
    });
  });

  it('선수명 열이 없는 표는 반영을 막는다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));
    fireEvent.click(screen.getByRole('button', { name: '스탯 불러오기' }));

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'R\tH\tHR\n143\t189\t38' },
    });

    await waitFor(() => {
      expect(screen.getByText(/선수명 열을 찾지 못했습니다/)).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /반영하기/ })).toBeNull();
  });

  it('참가자와 스탯이 모두 있으면 순위표에 점수가 표시된다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));

    fireEvent.click(screen.getByRole('button', { name: '스탯 불러오기' }));
    await pasteAndApply(HITTER_BASIC1);
    await pasteAndApply(HITTER_BASIC2);

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

    fireEvent.click(screen.getByRole('button', { name: '순위표' }));

    // 15부문 × 2명 = 30점 만점
    await waitFor(() => {
      expect(screen.getByText(/만점은 30점입니다/)).toBeTruthy();
    });

    const rows = screen.getAllByRole('row');
    // 머리글 2행 + 참가자 2행
    expect(rows.length).toBe(4);
  });
});
