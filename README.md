# 역할4 관제 대시보드 (Next.js)

## 로그인

대시보드는 관리자 계정으로만 접근 가능. `.env.local`의 `NEXT_PUBLIC_ADMIN_USERNAME`/
`NEXT_PUBLIC_ADMIN_PASSWORD`로 계정 설정 (기본값: admin / zerowatch1234).

- 이건 오시은 인증서버(Zero-Watch 서비스 로그인)와는 무관한, 대시보드 화면 자체를 막는 게이트
- **자동 로그아웃 없음** — 로그인 상태가 `localStorage`에 저장되어 브라우저를 껐다 켜도 유지되고,
  헤더의 [로그아웃] 버튼을 직접 눌러야만 로그아웃됨
- 로그인 안 한 상태로 `/`에 접근하면 자동으로 `/login`으로 이동

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 접속

기본값(`.env.local`의 `NEXT_PUBLIC_FORCE_MOCK=true`)은 mock 데이터로 동작하게 되어있음.
인증서버 연동 테스트하려면 `NEXT_PUBLIC_FORCE_MOCK=false`로 바꾸고 재실행.

EC2 배포는 [`DEPLOY.md`](./DEPLOY.md) 참고.

## 폴더 구조

```
dashboard/
├── app/
│   ├── layout.tsx        # 루트 레이아웃 (폰트/메타)
│   ├── page.tsx          # 대시보드 메인 페이지
│   └── globals.css       # 다크 테마 + leaflet 스타일 오버라이드
├── components/
│   ├── DashboardLayout.tsx        # 헤더 + 연결 상태 배지(MOCK/실시간연결됨/재연결중)
│   ├── MapPanel/WorldMap.tsx      # react-leaflet 지도, 정상/이상 마커
│   ├── AlertPanel/AlertList.tsx   # 실시간 알림 + 세션 강제 종료 버튼
│   └── Charts/
│       ├── LoginTrendChart.tsx    # 시간대별 로그인 추이
│       ├── RuleHitChart.tsx       # 룰별(R-01~R-06) 탐지 건수
│       └── ProfileDistChart.tsx   # Low/High/Zero-Trust 분포
├── lib/
│   ├── socket.ts              # Socket.io 클라이언트 싱글톤 + EVENTS 상수
│   ├── api.ts                 # REST API 호출 함수 (세션종료/목록/프로파일/통계)
│   ├── useLiveDashboard.ts    # 지도/알림 데이터: 소켓 연결→실데이터, 실패시 mock 폴백
│   └── useDashboardStats.ts   # 차트 3종 데이터: REST 폴링(30초)→실데이터, 실패시 mock 폴백
├── mock/mockData.ts       # 목업 데이터 스키마 + 더미 데이터 (폴백용으로 계속 사용됨)
├── ecosystem.config.js    # PM2 프로세스 설정
└── DEPLOY.md              # EC2 배포 단계별 가이드
```

## 지금 상태

- `NEXT_PUBLIC_FORCE_MOCK=true` (기본값)이면 항상 mock 데이터로 동작 — 개발/시연용
- `false`로 바꾸면 소켓/REST 연결을 시도하고, 실패하면 자동으로 마지막 mock 상태 유지
- 세션 강제 종료: 소켓 연결 중이면 `session:terminate` emit, 아니면 REST `POST /api/session/kill` fallback

## ⚠️ 오시은(역할2)과 확정 필요한 것

1. **이벤트명** — 지금은 `login:new` / `alert:detected` / `session:terminate` / `session:terminated`로
   짜놨는데, 오시은 잠정 스펙은 `login:success` / `login:anomaly` / `session:killed`. 하나로 통일 필요.
   → 확정되면 `lib/socket.ts`의 `EVENTS` 상수만 고치면 전체 반영됨.
2. **세션 강제종료 식별자** — `sessionId` 기준인지 `userId` 기준인지. 지금은 방어적으로 매핑 캐시를 뒀음.
3. **통계 API (`/api/stats/*`)** — 엔드포인트 자체가 미정. DB/탐지 집계를 누가 제공할지부터 논의 필요
   (오시은뿐 아니라 서지영 쪽과도 얘기해야 할 수 있음).

`mock/mockData.ts`의 타입 정의를 실제 API 응답 형식과 맞춰두면 연동 시 컴포넌트 코드는 거의 안 건드려도 됨.
