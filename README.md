# TripFit

어린 자녀와 여행하는 가족이 **방문 조건과 주변 지원시설을 비교하고, 필요한 정보를 미리 챙길 수 있는** 모바일 우선 웹앱입니다. 대학 프로젝트 MVP로, 웹과 Android 테스트 앱을 함께 제공합니다.

## 주요 기능

- **여행지 탐색·비교** — 위치, 반경, 시간, 날씨를 기준으로 후보를 살펴보고 두 장소의 방문 조건을 비교합니다.
- **주변 도움 지도** — 화장실·병의원 등 공공지원시설을 찾아 주소, 제공된 진료과·시간표와 정보 출처를 확인합니다.
- **오프라인 방문 준비** — 미리 저장한 준비 카드, 후보 비교, 시설 목록을 열고 현장 메모를 남깁니다. 지도 타일과 최신 데이터 조회는 인터넷 연결이 필요합니다.
- **수동 SOS 안내** — 기기 위치를 확인하고 신고 문구를 복사하거나 전화 앱을 엽니다. 최종 발신은 사용자가 합니다.

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 웹 | React · TypeScript · Vite · MapLibre GL JS · OpenFreeMap |
| 서버 | Node.js · Express · TypeScript · 한국관광공사 등 공공데이터 어댑터 |
| 모바일·저장 | PWA 서비스 워커 · 브라우저 로컬 저장 · Capacitor Android |
| 검증 | Node.js 테스트 러너 · tsx · Gradle |

## 실행 방법

Node.js **22.12 이상**을 설치한 뒤 저장소 루트에서 실행합니다.

```bash
npm ci
npm run dev
```

- 웹 화면은 [127.0.0.1:5173](http://127.0.0.1:5173), API는 포트 8787에서 실행됩니다.
- 기본 DEMO 모드는 API 키 없이 사용할 수 있습니다. 실데이터를 조회하려면 [환경변수 예시](.env.example)를 루트의 `.env`로 복사하고 필요한 서비스의 키를 입력한 뒤 서버를 재시작합니다.
- `npm run build` 후 `npm start`를 실행하면 브라우저 화면과 API를 포트 8787에서 함께 제공합니다.

### Android 테스트 빌드

Windows에서 JDK 21과 Android SDK를 준비합니다. 기본 빌드 스크립트는 도구 경로를 `D:\CodexData\TourSafe-Android`에서 찾으며, 다른 위치를 쓰는 경우 `-ToolsRoot`로 지정할 수 있습니다.

```powershell
.\scripts\build-android.ps1 -ToolsRoot "C:\path\to\TourSafe-Android"
```

도구 폴더에는 `jdk`와 `sdk` 하위 폴더가 필요합니다. 테스트 앱에서 실시간 데이터를 조회할 때는 앱에서 PC API 주소를 설정합니다. [Android 빌드 스크립트](scripts/build-android.ps1)

## 검증과 자료

- 11월 16일 작업본에서 자동 테스트 224개와 웹·Android 빌드를 통과했습니다. 테스트는 `npm test`로 실행합니다.
- 방문 조건과 지원시설 정보를 비교하는 도구입니다. 실데이터의 조회 시각과 누락 여부는 화면에서 확인할 수 있습니다.
- 데이터 출처, 점수 기준, 이전 웹 구현과 운영 설정은 [기존 개발 기록](https://github.com/hacho1/tourSafe/blob/85edd73c79e65dc57f94a7598a215a1d2272a7c8/README.md)에 있습니다.
