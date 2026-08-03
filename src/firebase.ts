/**
 * Firebase 초기화.
 *
 * 설정은 .env.local 의 VITE_FIREBASE_* 변수에서 읽는다 (.env.example 참고).
 * 변수가 없으면 null을 반환하고, 앱은 localStorage 저장소로 동작한다.
 *
 * 참고: Firebase 웹 API 키는 비밀이 아니라 프로젝트 식별자다.
 * 실제 접근 통제는 Firestore 보안 규칙(firestore.rules)이 담당한다.
 */

import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';

interface FirebaseEnv {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function readEnv(): FirebaseEnv | null {
  const env = import.meta.env;
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length === Object.keys(config).length) return null; // 설정 자체가 없음
  if (missing.length > 0) {
    console.warn(
      `[firebase] 설정이 일부만 있습니다. 누락: ${missing.join(', ')}. localStorage로 동작합니다.`,
    );
    return null;
  }

  return config as FirebaseEnv;
}

let cached: { app: FirebaseApp; db: Firestore } | null | undefined;

/**
 * Firebase가 설정되어 있으면 앱과 Firestore를, 아니면 null을 반환한다.
 *
 * SDK는 설정이 있을 때만 동적으로 불러온다. Firebase 관련 코드가 번들의 대부분을
 * 차지하는데, localStorage로 돌리는 동안은 한 줄도 필요하지 않기 때문이다.
 */
export async function getFirebase(): Promise<{ app: FirebaseApp; db: Firestore } | null> {
  if (cached !== undefined) return cached;

  const config = readEnv();
  if (!config) {
    cached = null;
    return null;
  }

  const [{ initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase/app'),
    import('firebase/firestore'),
  ]);

  const app = initializeApp(config);
  cached = { app, db: getFirestore(app) };
  return cached;
}
