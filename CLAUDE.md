@AGENTS.md
# TagRoutine (태그루틴)

## 프로젝트 목적
70대 시니어의 인지 비용을 제로로 수렴시키는 **[시니어 모드]** 와
보호자가 원격 세팅·모니터링하는 **[패밀리 모드]** 간 실시간 Firebase 동기화 앱.
빅스비 루틴처럼 NFC·GPS·시간 트리거 → 복약/컨텍스트/로그 액션을 조합하는 커스텀 루틴이 핵심 기능.

---

## 기술 스택
- **React Native** Expo SDK ~54.0.34, RN 0.81.5
- **NFC**: react-native-nfc-manager v3.17.2
- **GPS**: expo-location ~18.1.5 (`Accuracy.Balanced` + `getLastKnownPositionAsync` 폴백)
- **저장**: @react-native-async-storage/async-storage 2.2.0
- **실시간 동기화**: Firebase Realtime Database (Web SDK 순수 JS, 네이티브 설정 불필요)
- **아이콘**: lucide-react-native **만** 사용 (다른 아이콘 라이브러리 추가 금지)
- `newArchEnabled: false` (Expo Go 호환 및 네이티브 모듈 안정성)

---

## 단일 파일 아키텍처
**모든 코드가 `App.js` 하나에 있음.** 컴포넌트·상태·Firebase 동기화 모두 포함.
- 모든 공유 상태는 App 루트에서 관리 (Prop Drilling 방식)
- stale closure 방지: `tagsRef`, `gpsLocationsRef`, `routinesRef`, `handlersRef`, `executeRoutineRef` 패턴 사용
- 시니어 모드 최소 폰트 24pt, 강조 40~48pt
- 다크 모드 기반, 컨텍스트별 테마 전환 (일상=민트, 예배=퍼플)

---

## 파일 구조
```
TagRoutine/
├── App.js              ← 전체 앱 코드 (2200+ 줄, 단일 파일)
├── firebaseConfig.js   ← Firebase 초기화 및 db export
├── app.json            ← Expo 설정 (NFC·GPS 권한, 플러그인, EAS projectId)
├── eas.json            ← EAS Build 프로파일 (development / preview APK / production)
├── package.json
└── assets/
```

---

## 브랜치 현황 (2026-06-13 기준)

| 브랜치 | 상태 | 내용 |
|--------|------|------|
| `main` | 최신 안정 | NFC 실제 연동, GPS 장소관리, 커스텀 루틴, RoutineModal 버그픽스 |
| `feature/firebase-sync` | **현재 작업 브랜치**, main에 미머지 | Firebase 양방향 동기화, 안부인사, 시니어 스케줄, GPS mock 픽스, 배열 변환 픽스, 연결 해제 버튼 |
| `fix/gps-location` | 구버전 GPS 브랜치 (병합 불필요) | feature/firebase-sync에 이미 포함됨 |
| `feature/custom-routines` | main에 머지 완료 | 커스텀 루틴 빌더 |

**다음 작업**: `feature/firebase-sync` → `main` 머지 후 새 APK 빌드

---

## 주요 컴포넌트 (App.js 내)

| 컴포넌트 | 역할 |
|----------|------|
| `PairingScreen` | 6자리 코드로 가족 그룹 생성/참여. 완료 시 `householdId` AsyncStorage 저장 |
| `SelectionScreen` | 시니어/패밀리 모드 선택 초기 화면 |
| `SeniorScreen` | 시니어 메인 UI. 복약·컨텍스트·안부인사·오늘 스케줄 표시 |
| `FamilyScreen` | 패밀리 메인 UI. 모니터링·식사·GPS·NFC·루틴·안부인사·원격알림 관리 |
| `TagModal` | NFC 태그 등록/수정 모달 |
| `LocationModal` | GPS 장소 등록/수정 모달 (현재 위치 사용 버튼 포함) |
| `RoutineModal` | 커스텀 루틴 생성/수정 (2단계: 트리거 설정 → 액션 설정) |
| `TagManagerSection` | 패밀리 모드 NFC 태그 목록 관리 |
| `LocationManagerSection` | 패밀리 모드 GPS 장소 목록 관리 |
| `RoutineManagerSection` | 패밀리 모드 커스텀 루틴 목록 관리 |
| `FamilyMessageSection` | 패밀리 모드 안부인사 작성/삭제 |
| `RemoteAlertSection` | 패밀리 → 시니어 원격 알림 전송 |
| `NfcListenBadge` | 시니어 모드 NFC 리스닝 상태 표시 배지 |
| `PendingTagsBanner` | 미등록 태그 감지 시 등록 유도 배너 |

---

## Firebase 동기화 구조

```
households/{householdId}/
  config/           ← 패밀리가 쓰고, 시니어가 읽음
    tags            ← NFC 태그 목록
    gpsLocations    ← GPS 장소 목록
    routines        ← 커스텀 루틴 목록
    messages        ← 안부인사 목록
  status/           ← 시니어가 쓰고, 패밀리가 읽음
    medicationDone
    context
    safeZoneAlert
    logs
  commands/         ← 패밀리가 쓰고, 시니어가 읽음
    latestAlert     ← { message, sentAt } 원격 알림
  meta/
    createdAt
```

**중요**: Firebase는 JS 배열을 `{"0":{...},"1":{...}}` 객체로 변환해 저장함.
읽을 때 반드시 `Array.isArray(v) ? v : Object.values(v)` 로 배열 복원 필요.

---

## AsyncStorage 키
```
@tagroutine:nfc_tags_v1       ← NFC 태그 배열
@tagroutine:gps_locations_v1  ← GPS 장소 배열
@tagroutine:routines_v1       ← 커스텀 루틴 배열
@tagroutine:family_messages_v1 ← 안부인사 배열
@tagroutine:household_id      ← 6자리 가족 그룹 코드
```

---

## 커스텀 루틴 구조
```js
{
  id, name, enabled,
  trigger: {
    type: 'nfc' | 'gps' | 'time',
    tagId,          // type=nfc 일 때
    locationId,     // type=gps 일 때
    hour, minute,   // type=time 일 때
  },
  actions: [
    { type: 'log', message },
    { type: 'alert', message },
    { type: 'set_context', context: 'worship'|'normal' },
    { type: 'medication' },
  ]
}
```

---

## Expo Go 호환 처리
네이티브 모듈은 최상단에서 try/catch require로 로드, 실패 시 mock 사용:
```js
try { NfcManager = require('react-native-nfc-manager').default; ... }
catch (_) { /* mock */ }

try { Location = require('expo-location'); }
catch (_) {
  Location = {
    requestForegroundPermissionsAsync, getCurrentPositionAsync,
    getLastKnownPositionAsync,   // ← 반드시 포함 (없으면 catch 블록에서 TypeError)
    watchPositionAsync, Accuracy,
  };
}
```

---

## 빌드
```bash
# APK 빌드 (preview 프로파일 = internal 배포용 APK)
npx eas build --platform android --profile preview

# EAS CLI가 PATH에 없을 경우
npx eas build --platform android --profile preview
```
- `app.json` plugins에 `react-native-nfc-manager`와 `expo-location` 반드시 포함
- 네이티브 모듈 변경 시 반드시 새 빌드 필요 (Expo Go로는 NFC/GPS 실제 동작 불가)

---

## 알려진 이슈 / TODO
- **GPS 실내 정확도**: `Accuracy.Balanced` 사용 중이나 실내에서 여전히 느릴 수 있음
- **feature/firebase-sync → main 머지 필요**: 현재 Firebase 동기화 코드가 main에 없음
- **EAS 빌드 필요**: expo-location 플러그인 반영 및 최신 수정사항 적용을 위해 새 APK 빌드 필요
- **시니어 모드 NFC**: `NfcEvents.DiscoverTag` + `registerTagEvent` 로 상시 리스닝
- **패밀리 모드 NFC**: `requestTechnology` + `getTag` 로 1회 스캔 후 태그 등록
