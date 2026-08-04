import type { KeyboardEvent } from 'react';

/**
 * IME 조합 중에 눌린 키인지 판별한다.
 *
 * 한글·일본어·중국어는 글자를 조합해서 입력하고, 조합을 확정할 때 Enter를 쓴다.
 * '홍길동'을 치고 Enter를 누르면 그 Enter는 마지막 '동'을 확정하는 키이지
 * 제출하라는 뜻이 아니다. 이걸 구분하지 않으면 '홍길동'이 등록된 뒤
 * 확정된 '동'이 입력창에 남아 두 번 등록되는 일이 생긴다.
 *
 * keyCode 229는 isComposing을 지원하지 않는 환경을 위한 보조 판정이다.
 */
export function isComposing(event: KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
}
