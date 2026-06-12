@AGENTS.md
# TagRoutine (태그루틴)

## 프로젝트 목적
70대 시니어의 인지 비용을 제로로 수렴시키는 [시니어 모드]와
보호자가 원격 세팅·모니터링하는 [패밀리 모드] 간 실시간 동기화 앱.

## 기술 스택
- React Native (Expo, Development Build)
- NFC: react-native-nfc-manager
- GPS: expo-location + expo-task-manager
- 아이콘: lucide-react-native만 사용

## 핵심 아키텍처
- 모든 공유 상태는 App.js 루트에 단일 보유 (Reactive Data-Sync)
- 시니어 모드 최소 폰트 24pt, 강조 40~48pt
- 다크 모드 기반, 컨텍스트별 테마 전환 (일상=민트, 예배=퍼플)

## 현재 진행 상황
- 프로토타입 완성 (시뮬레이션 버튼 방식)
- 다음 단계: 실제 NFC 태그 등록/스캔/관리 구현