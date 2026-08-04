// @vitest-environment jsdom

/**
 * 렌더 스모크 테스트.
 *
 * 타입체크와 빌드는 통과해도 훅 사용 오류 같은 런타임 문제는 잡히지 않는다.
 * 리그 설정 → 스탯 불러오기 → 드래프트 결과 → 순위표까지 실제로 마운트해 흘려본다.
 * 저장소는 Firebase 설정이 없으므로 localStorage 구현이 쓰인다.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

const HITTERS_1 = [
  '순위\t선수명\t팀명\tR\tH\tHR\tRBI\tSB',
  '1\t김도영\tKIA\t25\t34\t9\t22\t8',
  '2\t레이예스\t롯데\t14\t33\t2\t18\t1',
].join('\n');

const HITTERS_2 = [
  '순위\t선수명\t팀명\tBB\tSO\tGDP',
  '1\t김도영\tKIA\t12\t17\t1',
  '2\t레이예스\t롯데\t7\t13\t4',
].join('\n');

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

const goTo = (tab: string) => fireEvent.click(screen.getByRole('button', { name: tab }));

async function addManagers(names: string[]) {
  goTo('리그 설정');
  for (const name of names) {
    fireEvent.change(screen.getByPlaceholderText('참가자 이름'), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    await waitFor(() => expect(screen.getByText(name)).toBeTruthy());
  }
}

/** 임포트 탭에서 표를 붙여넣고 지정한 달에 반영한다 */
async function importInto(month: string, text: string) {
  goTo('스탯 불러오기');
  // 월 선택 (월 버튼은 월 선택 영역에 있다)
  const monthButton = screen
    .getAllByRole('button', { name: new RegExp(`^${month}$`) })
    .find((b) => b.closest('.month-picker'));
  if (monthButton) fireEvent.click(monthButton);

  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  const apply = await waitFor(() =>
    screen.getByRole('button', { name: new RegExp(`${month}에 2명 반영하기`) }),
  );
  fireEvent.click(apply);
  await waitFor(() => screen.getByText(/반영했습니다/));
}

describe('App', () => {
  it('앱이 마운트되고 localStorage 저장소로 연결된다', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'KBO 판타지 리그' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/localStorage/)).toBeTruthy());
  });

  it('참가자가 없으면 순위표가 리그 설정으로 안내한다', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/참가자가 없습니다/)).toBeTruthy());
  });

  it('리그 설정에서 참여 인원을 등록하면 만점이 함께 표시된다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));

    await addManagers(['홍길동', '이몽룡', '김철수']);

    // 인원수와 부문 만점 안내
    expect(screen.getByText('3').closest('.big-count')).toBeTruthy();
    expect(screen.getByText(/한 달 만점은/).textContent).toMatch(/45점/); // 15부문 × 3명
    expect(screen.getByText(/참가자 3명/)).toBeTruthy();
  });

  it('한글 조합을 확정하는 Enter는 참가자를 등록하지 않는다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));
    goTo('리그 설정');

    const input = screen.getByPlaceholderText('참가자 이름');
    fireEvent.change(input, { target: { value: '홍길동' } });

    // '동'을 확정하는 Enter — 조합 중이므로 제출이 아니다
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(screen.queryByText('홍길동')).toBeNull();
    expect((input as HTMLInputElement).value).toBe('홍길동');

    // 조합이 끝난 뒤의 Enter만 등록한다
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeTruthy();
    });

    // '홍길동' 하나만 등록되고 마지막 글자 '동'이 따로 생기지 않아야 한다
    expect(screen.queryByText('동')).toBeNull();
    expect(screen.getByText(/참가자 1명/)).toBeTruthy();
    expect(document.querySelectorAll('.manager-list li')).toHaveLength(1);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('이름 수정에서도 조합 중 Enter를 무시한다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));
    await addManagers(['홍길동']);

    fireEvent.click(screen.getByRole('button', { name: '이름 수정' }));
    const input = screen.getByDisplayValue('홍길동');
    fireEvent.change(input, { target: { value: '이몽룡' } });

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    // 아직 편집 중이어야 한다
    expect(screen.getByRole('button', { name: '저장' })).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByText('이몽룡')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
    expect(screen.getByText(/참가자 1명/)).toBeTruthy();
    expect(document.querySelectorAll('.manager-list li')).toHaveLength(1);
  });

  it('아직 안 넣은 항목을 달별로 알려준다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));
    await addManagers(['홍길동', '이몽룡']);

    goTo('스탯 불러오기');
    expect(screen.getByText(/아직 안 넣은 항목/)).toBeTruthy();

    await importInto('4월', HITTERS_1);

    await waitFor(() => {
      const warn = screen.getByText(/아직 안 넣은 항목/).parentElement!;
      expect(warn.textContent).toMatch(/볼넷/);
      expect(warn.textContent).toMatch(/병살타/);
      expect(warn.textContent).not.toMatch(/홈런/);
    });

    await importInto('4월', HITTERS_2);
    await waitFor(() => {
      expect(screen.getByText(/4월 타자 부문 항목이 모두 채워졌습니다/)).toBeTruthy();
    });
  });

  it('드래프트 결과를 일괄 입력하면 로스터에 반영된다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));
    await addManagers(['홍길동', '이몽룡']);
    await importInto('4월', HITTERS_1);

    goTo('드래프트 결과');
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '홍길동: 김도영\n이몽룡: 레이예스' },
    });

    const apply = await waitFor(() => screen.getByRole('button', { name: '배정하기' }));
    fireEvent.click(apply);

    await waitFor(() => {
      expect(screen.getByText(/2명에게 총 2명의 선수를 배정했습니다/)).toBeTruthy();
    });
    expect(screen.getByRole('heading', { level: 3, name: /홍길동/ }).textContent).toMatch(/1명/);
  });

  it('같은 선수를 두 명에게 주면 배정을 막는다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));
    await addManagers(['홍길동', '이몽룡']);
    await importInto('4월', HITTERS_1);

    goTo('드래프트 결과');
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '홍길동: 김도영\n이몽룡: 김도영' },
    });

    await waitFor(() => {
      expect(screen.getByText(/같은 선수를 두 명 이상에게 배정했습니다/)).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '배정하기' })).toHaveProperty('disabled', true);
  });

  it('월별 순위와 시즌 종합을 모두 보여준다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));
    await addManagers(['홍길동', '이몽룡']);

    await importInto('4월', HITTERS_1);
    await importInto('4월', HITTERS_2);

    goTo('드래프트 결과');
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '홍길동: 김도영\n이몽룡: 레이예스' },
    });
    fireEvent.click(await waitFor(() => screen.getByRole('button', { name: '배정하기' })));
    await waitFor(() => screen.getByText(/배정했습니다/));

    goTo('순위표');

    // 시즌 종합 — 4월만 산정에 포함
    await waitFor(() => {
      expect(screen.getByText(/월별 순위의 합산/)).toBeTruthy();
    });
    expect(screen.getByText(/산정에 포함된 달: 4월/)).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '순위 합' })).toBeTruthy();

    // 4월 상세로 이동
    const aprilTab = screen
      .getAllByRole('button', { name: '4월' })
      .find((b) => b.closest('.view-switch'))!;
    fireEvent.click(aprilTab);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: /4월 순위/ })).toBeTruthy();
    });
    // 15부문 × 2명 = 30점 만점
    expect(screen.getByText(/이 달 만점은 30점입니다/)).toBeTruthy();
  });

  it('기록이 없는 달을 고르면 안내한다', async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/참가자가 없습니다/));
    await addManagers(['홍길동', '이몽룡']);
    await importInto('4월', HITTERS_1);

    goTo('순위표');
    const mayTab = screen
      .getAllByRole('button', { name: '5월' })
      .find((b) => b.closest('.view-switch'))!;
    fireEvent.click(mayTab);

    await waitFor(() => {
      expect(screen.getByText(/5월 기록이 없습니다/)).toBeTruthy();
    });
  });
});
