// ============================================================================
// 🏷️ TagRoutine (태그루틴 / 나노바나나) — App.js  Phase 2
// ----------------------------------------------------------------------------
// [변경 사항]
//   - NFC 시뮬레이션 버튼 → react-native-nfc-manager 실제 NFC 연동
//   - 패밀리 모드: NFC 태그 등록/수정/삭제 관리 화면 추가
//   - 시니어 모드: 진입 즉시 NFC 리스닝 시작 (DiscoverTag 이벤트)
//   - AsyncStorage: 등록 태그 앱 재시작 후에도 유지
// ============================================================================
// NFC/AsyncStorage는 Development Build 전용 — Expo Go에서는 mock으로 폴백
let NfcManager, NfcEvents, NfcTech, AsyncStorage;
try {
  const nfc = require('react-native-nfc-manager');
  NfcManager = nfc.default;
  NfcEvents  = nfc.NfcEvents;
  NfcTech    = nfc.NfcTech;
} catch (_) {
  NfcManager = {
    isSupported: async () => false,
    start: async () => {},
    setEventListener: () => {},
    registerTagEvent: async () => {},
    unregisterTagEvent: async () => {},
    requestTechnology: async () => { throw new Error('not supported'); },
    getTag: async () => null,
    cancelTechnologyRequest: async () => {},
  };
  NfcEvents = { DiscoverTag: 'DiscoverTag' };
  NfcTech   = { Ndef: 'Ndef', NfcA: 'NfcA', NfcB: 'NfcB', NfcF: 'NfcF', NfcV: 'NfcV' };
}
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (_) {
  // 인메모리 폴백 — 앱 재시작 시 초기화됨
  const store = {};
  AsyncStorage = {
    getItem:    async (k) => store[k] ?? null,
    setItem:    async (k, v) => { store[k] = v; },
    removeItem: async (k) => { delete store[k]; },
  };
}
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  PanResponder,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Easing,
  Dimensions,
  Modal,
  TextInput,
} from 'react-native';
import {
  Smartphone,
  Users,
  Radio,
  Play,
  Pause,
  Pill,
  MapPin,
  Footprints,
  Church,
  AlertTriangle,
  CheckCircle2,
  BatteryMedium,
  Wifi,
  Home,
  Sun,
  Moon,
  UtensilsCrossed,
  ShieldCheck,
  Activity,
  Tag,
  Plus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react-native';

// ============================================================================
// 🗄️ AsyncStorage 키
// ============================================================================
const STORAGE_KEY = '@tagroutine:nfc_tags_v1';

// ============================================================================
// 🏷️ 태그 동작 정의
// ----------------------------------------------------------------------------
// key: 내부 식별자 / label: 화면 표시 / emoji: 빠른 시각 구분
// ============================================================================
const TAG_ACTIONS = [
  { key: 'medication', label: '약 복용 완료',  emoji: '💊' },
  { key: 'worship',   label: '예배당 진입',    emoji: '⛪' },
  { key: 'home',      label: '귀가 확인',      emoji: '🏠' },
  { key: 'custom',    label: '기록만 남기기',  emoji: '📝' },
];

// ============================================================================
// 🎨 디자인 토큰
// ============================================================================
const THEMES = {
  default: {
    bg: '#0B0F0E',
    surface: '#141A18',
    surfaceAlt: '#1C2422',
    line: '#26302D',
    text: '#F2FBF8',
    subText: '#8FA39D',
    accent: '#00C292',
    accentDim: 'rgba(0,194,146,0.15)',
    amber: '#F59E0B',
    rose: '#EF4444',
    onAccent: '#04110D',
  },
  worship: {
    bg: '#15131D',
    surface: '#1E1B2A',
    surfaceAlt: '#272336',
    line: '#332E47',
    text: '#EFEDF7',
    subText: '#9A94B8',
    accent: '#8B7CF6',
    accentDim: 'rgba(139,124,246,0.15)',
    amber: '#F59E0B',
    rose: '#EF4444',
    onAccent: '#120F1C',
  },
};

const SENIOR_TYPE = {
  hero: 48,
  title: 32,
  body: 24,
  weight: '900',
};

const { width: SCREEN_W } = Dimensions.get('window');

// ============================================================================
// 🔧 유틸리티
// ============================================================================
const minutesToLabel = (mins) => {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
};

const nowLabel = (date) => {
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? '오후' : '오전';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${ampm} ${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const logStamp = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

// NFC 태그 ID를 소문자 hex 문자열로 정규화
const normalizeTagId = (id) => {
  if (!id) return '';
  if (Array.isArray(id)) {
    return id.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return String(id).toLowerCase().replace(/[^a-f0-9]/g, '');
};

// ============================================================================
// 🎚️ CustomSlider
// ============================================================================
const CustomSlider = ({ min, max, step = 1, value, onChange, theme }) => {
  const trackLayout = useRef({ x: 0, width: 1 });
  const trackRef = useRef(null);
  const latest = useRef({ min, max, step, onChange });
  latest.current = { min, max, step, onChange };

  const updateFromPageX = (pageX) => {
    const { x, width } = trackLayout.current;
    const { min: lo, max: hi, step: st, onChange: cb } = latest.current;
    const ratio = Math.min(1, Math.max(0, (pageX - x) / width));
    const raw = lo + ratio * (hi - lo);
    const stepped = Math.round(raw / st) * st;
    cb(Math.min(hi, Math.max(lo, stepped)));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => updateFromPageX(evt.nativeEvent.pageX),
      onPanResponderMove: (evt) => updateFromPageX(evt.nativeEvent.pageX),
    })
  ).current;

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <View
      ref={trackRef}
      style={sliderStyles.hitArea}
      {...panResponder.panHandlers}
      onLayout={() => {
        trackRef.current &&
          trackRef.current.measureInWindow((x, _y, width) => {
            trackLayout.current = { x, width: Math.max(1, width) };
          });
      }}
    >
      <View style={[sliderStyles.track, { backgroundColor: theme.line }]}>
        <View
          style={[
            sliderStyles.fill,
            { width: `${pct}%`, backgroundColor: theme.accent },
          ]}
        />
      </View>
      <View
        style={[
          sliderStyles.thumb,
          {
            left: `${pct}%`,
            backgroundColor: theme.accent,
            shadowColor: theme.accent,
          },
        ]}
      />
    </View>
  );
};

const sliderStyles = StyleSheet.create({
  hitArea: { height: 44, justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  thumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    marginLeft: -13,
    top: 9,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});

// ============================================================================
// 🔊 VoiceVisualizer
// ============================================================================
const VoiceVisualizer = ({ playing, theme }) => {
  const bars = useRef([0, 1, 2, 3].map(() => new Animated.Value(0.3))).current;
  const loops = useRef([]);

  useEffect(() => {
    if (playing) {
      loops.current = bars.map((bar, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(bar, {
              toValue: 1,
              duration: 260 + i * 90,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(bar, {
              toValue: 0.3,
              duration: 260 + i * 90,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ])
        )
      );
      loops.current.forEach((l) => l.start());
    } else {
      loops.current.forEach((l) => l.stop());
      bars.forEach((b) => b.setValue(0.3));
    }
    return () => loops.current.forEach((l) => l.stop());
  }, [playing]);

  return (
    <View style={vizStyles.row}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            vizStyles.bar,
            {
              backgroundColor: playing ? theme.accent : theme.subText,
              transform: [{ scaleY: bar }],
            },
          ]}
        />
      ))}
    </View>
  );
};

const vizStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', height: 44, gap: 6 },
  bar: { width: 8, height: 40, borderRadius: 4 },
});

// ============================================================================
// 🎉 FanfareCheck
// ============================================================================
const FanfareCheck = ({ trigger, theme }) => {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trigger) {
      scale.setValue(0);
      Animated.sequence([
        Animated.spring(scale, {
          toValue: 1.4,
          friction: 3,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [trigger]);

  if (!trigger) return null;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <CheckCircle2 color={theme.accent} size={56} strokeWidth={2.5} />
    </Animated.View>
  );
};

// ============================================================================
// 📡 NfcListenBadge — 시니어 모드에서 NFC 대기 상태를 시각적으로 전달
// ============================================================================
const NfcListenBadge = ({ supported, theme }) => {
  const pulse = useRef(new Animated.Value(1)).current;
  const animRef = useRef(null);

  useEffect(() => {
    if (!supported) return;
    animRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.5,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animRef.current.start();
    return () => {
      animRef.current?.stop();
      pulse.setValue(1);
    };
  }, [supported]);

  if (!supported) {
    return (
      <View
        style={[
          nlb.wrap,
          { backgroundColor: theme.surfaceAlt, borderColor: theme.line },
        ]}
      >
        <Tag color={theme.subText} size={22} strokeWidth={2.5} />
        <Text style={[nlb.text, { color: theme.subText }]}>
          이 기기는 NFC를 지원하지 않습니다
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        nlb.wrap,
        { backgroundColor: theme.accentDim, borderColor: theme.accent },
      ]}
    >
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <View style={[nlb.dot, { backgroundColor: theme.accent }]} />
      </Animated.View>
      <Text style={[nlb.text, { color: theme.accent }]}>
        NFC 대기 중 · 약통에 폰을 대세요
      </Text>
    </View>
  );
};

const nlb = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  text: { fontSize: 18, fontWeight: '800', flex: 1 },
});

// ============================================================================
// 🏷️ TagModal — 태그 등록(스캔 → 상세 입력) 및 수정 바텀 시트
// ============================================================================
const TagModal = ({ visible, editTag, theme, onSave, onCancel }) => {
  const [step, setStep] = useState('scanning'); // 'scanning' | 'details'
  const [scannedId, setScannedId] = useState('');
  const [tagName, setTagName] = useState('');
  const [tagAction, setTagAction] = useState('medication');

  // 모달이 열릴 때마다 초기화
  useEffect(() => {
    if (!visible) return;
    if (editTag) {
      setStep('details');
      setScannedId(editTag.id);
      setTagName(editTag.name);
      setTagAction(editTag.action);
    } else {
      setStep('scanning');
      setScannedId('');
      setTagName('');
      setTagAction('medication');
      startScan();
    }
    return () => {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, [visible]);

  const startScan = async () => {
    try {
      await NfcManager.requestTechnology([
        NfcTech.Ndef,
        NfcTech.NfcA,
        NfcTech.NfcB,
        NfcTech.NfcF,
        NfcTech.NfcV,
      ]);
      const tag = await NfcManager.getTag();
      const id = normalizeTagId(tag?.id);
      setScannedId(id || `manual-${Date.now()}`);
      setStep('details');
    } catch (_) {
      onCancel();
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  };

  const handleCancel = () => {
    NfcManager.cancelTechnologyRequest().catch(() => {});
    onCancel();
  };

  const handleSave = () => {
    if (!tagName.trim()) return;
    onSave({ id: scannedId, name: tagName.trim(), action: tagAction });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <View style={tm.backdrop}>
        <View style={[tm.sheet, { backgroundColor: theme.surface }]}>
          {/* 헤더 */}
          <View style={tm.header}>
            <Text style={[tm.title, { color: theme.text }]}>
              {step === 'scanning'
                ? 'NFC 태그 스캔'
                : editTag
                ? '태그 수정'
                : '태그 등록'}
            </Text>
            <TouchableOpacity
              onPress={handleCancel}
              style={[tm.closeBtn, { backgroundColor: theme.surfaceAlt }]}
            >
              <X color={theme.subText} size={20} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {step === 'scanning' ? (
            /* ── 스캔 대기 화면 ── */
            <View style={tm.scanBody}>
              <View
                style={[
                  tm.scanCircle,
                  {
                    borderColor: theme.accent,
                    backgroundColor: theme.accentDim,
                  },
                ]}
              >
                <Tag color={theme.accent} size={52} strokeWidth={2} />
              </View>
              <Text style={[tm.scanTitle, { color: theme.text }]}>
                태그에 휴대폰을 대세요
              </Text>
              <Text style={[tm.scanSub, { color: theme.subText }]}>
                NFC 스티커 또는 카드에{'\n'}기기 뒷면을 가까이 대주세요
              </Text>
              <TouchableOpacity
                onPress={handleCancel}
                style={[tm.cancelOutlineBtn, { borderColor: theme.line }]}
              >
                <Text style={[tm.cancelOutlineText, { color: theme.subText }]}>
                  취소
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── 상세 입력 화면 ── */
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={tm.detailBody}>
                {/* 태그 ID 표시 */}
                <View
                  style={[tm.idBox, { backgroundColor: theme.surfaceAlt }]}
                >
                  <Tag color={theme.subText} size={14} strokeWidth={2} />
                  <Text
                    style={[tm.idText, { color: theme.subText }]}
                    numberOfLines={1}
                  >
                    {scannedId || '알 수 없는 태그'}
                  </Text>
                </View>

                {/* 이름 입력 */}
                <Text style={[tm.fieldLabel, { color: theme.subText }]}>
                  태그 이름
                </Text>
                <TextInput
                  style={[
                    tm.input,
                    {
                      backgroundColor: theme.surfaceAlt,
                      color: theme.text,
                      borderColor: theme.line,
                    },
                  ]}
                  value={tagName}
                  onChangeText={setTagName}
                  placeholder="예: 약통 스티커"
                  placeholderTextColor={theme.subText}
                  autoFocus={!editTag}
                  returnKeyType="done"
                />

                {/* 동작 선택 */}
                <Text style={[tm.fieldLabel, { color: theme.subText }]}>
                  태그 동작
                </Text>
                {TAG_ACTIONS.map((a) => (
                  <TouchableOpacity
                    key={a.key}
                    style={[
                      tm.actionRow,
                      {
                        borderColor:
                          tagAction === a.key ? theme.accent : theme.line,
                        backgroundColor:
                          tagAction === a.key
                            ? theme.accentDim
                            : 'transparent',
                      },
                    ]}
                    onPress={() => setTagAction(a.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={tm.actionEmoji}>{a.emoji}</Text>
                    <Text
                      style={[
                        tm.actionLabel,
                        {
                          color:
                            tagAction === a.key ? theme.accent : theme.text,
                        },
                      ]}
                    >
                      {a.label}
                    </Text>
                    {tagAction === a.key && (
                      <CheckCircle2
                        color={theme.accent}
                        size={18}
                        strokeWidth={2.5}
                      />
                    )}
                  </TouchableOpacity>
                ))}

                {/* 저장 버튼 */}
                <TouchableOpacity
                  style={[
                    tm.saveBtn,
                    {
                      backgroundColor: tagName.trim()
                        ? theme.accent
                        : theme.line,
                    },
                  ]}
                  onPress={handleSave}
                  disabled={!tagName.trim()}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      tm.saveBtnText,
                      {
                        color: tagName.trim()
                          ? theme.onAccent
                          : theme.subText,
                      },
                    ]}
                  >
                    저장
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const tm = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '900' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBody: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 16,
  },
  scanCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  scanTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  scanSub: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
  },
  cancelOutlineBtn: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 36,
    marginTop: 8,
  },
  cancelOutlineText: { fontSize: 16, fontWeight: '700' },
  detailBody: { padding: 20, gap: 12, paddingBottom: 40 },
  idBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  idText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  fieldLabel: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
  },
  actionEmoji: { fontSize: 20 },
  actionLabel: { fontSize: 15, fontWeight: '700', flex: 1 },
  saveBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { fontSize: 17, fontWeight: '900' },
});

// ============================================================================
// 🗂️ TagManagerSection — 패밀리 모드의 NFC 태그 목록 + CRUD UI
// ============================================================================
const TagManagerSection = ({ tags, theme, onAdd, onEdit, onDelete }) => (
  <View>
    <Text style={[fs.sectionLabel, { color: theme.subText }]}>
      🏷️ NFC 태그 관리
    </Text>
    <View
      style={[fs.card, { backgroundColor: theme.surface, borderColor: theme.line }]}
    >
      {tags.length === 0 ? (
        <View style={tms.emptyWrap}>
          <Tag color={theme.subText} size={36} strokeWidth={1.5} />
          <Text style={[tms.emptyText, { color: theme.subText }]}>
            등록된 태그가 없습니다.{'\n'}아래 버튼으로 NFC 태그를 등록하세요.
          </Text>
        </View>
      ) : (
        tags.map((tag, idx) => {
          const actionDef = TAG_ACTIONS.find((a) => a.key === tag.action);
          return (
            <View
              key={tag.id}
              style={[
                tms.tagRow,
                {
                  borderBottomColor: theme.line,
                  borderBottomWidth: idx < tags.length - 1 ? 1 : 0,
                },
              ]}
            >
              <View
                style={[tms.tagIconWrap, { backgroundColor: theme.accentDim }]}
              >
                <Tag color={theme.accent} size={18} strokeWidth={2.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[tms.tagName, { color: theme.text }]}>
                  {tag.name}
                </Text>
                <Text style={[tms.tagActionLabel, { color: theme.subText }]}>
                  {actionDef?.emoji} {actionDef?.label}
                </Text>
              </View>
              <TouchableOpacity
                style={[tms.iconBtn, { backgroundColor: theme.surfaceAlt }]}
                onPress={() => onEdit(tag)}
                activeOpacity={0.8}
              >
                <Pencil color={theme.subText} size={15} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[tms.iconBtn, { backgroundColor: theme.surfaceAlt }]}
                onPress={() => onDelete(tag.id)}
                activeOpacity={0.8}
              >
                <Trash2 color={theme.rose} size={15} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          );
        })
      )}
      <TouchableOpacity
        style={[tms.addBtn, { backgroundColor: theme.accent }]}
        onPress={onAdd}
        activeOpacity={0.85}
      >
        <Plus color={theme.onAccent} size={20} strokeWidth={3} />
        <Text style={[tms.addBtnText, { color: theme.onAccent }]}>
          새 태그 등록
        </Text>
      </TouchableOpacity>
    </View>
  </View>
);

const tms = StyleSheet.create({
  emptyWrap: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  tagIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagName: { fontSize: 15, fontWeight: '800' },
  tagActionLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 14,
  },
  addBtnText: { fontSize: 15, fontWeight: '900' },
});

// ============================================================================
// 📱 SeniorScreen — 시니어 이지 모드 (NFC 자동 감지 버전)
// ----------------------------------------------------------------------------
// 변경: NFC 시뮬레이션 버튼 제거 → NfcListenBadge로 대체
//       GPS 시뮬레이션 버튼 유지 (GPS는 별도 Phase에서 실제 연동)
// ============================================================================
const SeniorScreen = ({
  theme,
  now,
  meals,
  medicationDone,
  context,
  safeZoneAlert,
  nfcSupported,
  onTriggerWorship,
  onTriggerSafeZone,
  onRollback,
}) => {
  const [playing, setPlaying] = useState(false);

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nextMeal = meals.find((m) => m.timeMins >= nowMins) || meals[0];

  const actionCard = medicationDone
    ? {
        icon: (
          <UtensilsCrossed color={theme.accent} size={48} strokeWidth={2.5} />
        ),
        title: `${nextMeal.label} 식사`,
        sub: `${minutesToLabel(nextMeal.timeMins)} 에 알려드려요`,
      }
    : {
        icon: <Pill color={theme.amber} size={48} strokeWidth={2.5} />,
        title: '약 드실 시간',
        sub: '약통 스티커에 휴대폰을 대주세요',
      };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Safe Zone 이탈 경고 */}
      {safeZoneAlert && (
        <View style={[ss.alertBanner, { backgroundColor: theme.rose }]}>
          <AlertTriangle color="#FFFFFF" size={32} strokeWidth={2.5} />
          <View style={{ flex: 1 }}>
            <Text style={ss.alertTitle}>안전 구역을 벗어났어요</Text>
            <Text style={ss.alertSub}>가족에게 위치를 알려드렸어요</Text>
          </View>
        </View>
      )}

      {/* 예배 중 배지 */}
      {context === 'worship' && (
        <View
          style={[
            ss.contextBadge,
            {
              backgroundColor: theme.accentDim,
              borderColor: theme.accent,
            },
          ]}
        >
          <Church color={theme.accent} size={28} strokeWidth={2.5} />
          <Text style={[ss.contextText, { color: theme.accent }]}>
            🤫 예배 중 · 자동 음소거
          </Text>
        </View>
      )}

      {/* 현재 시각 */}
      <Text style={[ss.clockLabel, { color: theme.subText }]}>현재 시간</Text>
      <Text style={[ss.clock, { color: theme.text }]}>{nowLabel(now)}</Text>

      {/* NFC 대기 배지 — 시뮬레이션 버튼 대체 */}
      <NfcListenBadge supported={nfcSupported} theme={theme} />

      {/* 단 하나의 액션 카드 */}
      <View
        style={[
          ss.actionCard,
          { backgroundColor: theme.surface, borderColor: theme.line },
        ]}
      >
        <View style={{ alignItems: 'center', gap: 12 }}>
          {medicationDone ? (
            <FanfareCheck trigger={medicationDone} theme={theme} />
          ) : (
            actionCard.icon
          )}
          <Text style={[ss.actionTitle, { color: theme.text }]}>
            {actionCard.title}
          </Text>
          <Text style={[ss.actionSub, { color: theme.subText }]}>
            {actionCard.sub}
          </Text>
          {medicationDone && (
            <View
              style={[ss.doneBadge, { backgroundColor: theme.accentDim }]}
            >
              <CheckCircle2 color={theme.accent} size={28} strokeWidth={2.5} />
              <Text style={[ss.doneText, { color: theme.accent }]}>
                약 복용 완료
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* 가족 목소리 브리핑 */}
      <View
        style={[
          ss.radioCard,
          { backgroundColor: theme.surface, borderColor: theme.line },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Radio color={theme.accent} size={32} strokeWidth={2.5} />
          <Text style={[ss.radioTitle, { color: theme.text }]}>
            딸의 아침 인사
          </Text>
        </View>
        <View style={ss.radioRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[ss.playBtn, { backgroundColor: theme.accent }]}
            onPress={() => setPlaying((p) => !p)}
          >
            {playing ? (
              <Pause
                color={theme.onAccent}
                size={36}
                strokeWidth={3}
                fill={theme.onAccent}
              />
            ) : (
              <Play
                color={theme.onAccent}
                size={36}
                strokeWidth={3}
                fill={theme.onAccent}
              />
            )}
          </TouchableOpacity>
          <VoiceVisualizer playing={playing} theme={theme} />
        </View>
        <Text style={[ss.radioScript, { color: theme.subText }]}>
          "아버지, 점심 약 꼭 챙겨 드세요!"
        </Text>
      </View>

      {/* GPS 시뮬레이션 (GPS는 별도 Phase에서 실제 연동 예정) */}
      <Text style={[ss.panelLabel, { color: theme.subText }]}>
        ⚙️ GPS 센서 시뮬레이션
      </Text>
      <View style={{ gap: 12 }}>
        <SensorButton
          theme={theme}
          icon={<Church color={theme.text} size={28} strokeWidth={2.5} />}
          label="💡 GPS 트리거 · 예배당 진입"
          onPress={onTriggerWorship}
        />
        <SensorButton
          theme={theme}
          icon={<Footprints color={theme.text} size={28} strokeWidth={2.5} />}
          label="🚶‍♂️ GPS 트리거 · Safe Zone 이탈"
          onPress={onTriggerSafeZone}
        />
      </View>

      {/* 원터치 롤백 */}
      <TouchableOpacity
        activeOpacity={0.85}
        style={[ss.rollbackBtn, { backgroundColor: theme.amber }]}
        onPress={onRollback}
      >
        <Home color="#1A1304" size={36} strokeWidth={3} />
        <Text style={ss.rollbackText}>⚠️ 원래 화면으로 되돌리기</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const SensorButton = ({ theme, icon, label, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={onPress}
    style={[
      ss.sensorBtn,
      { backgroundColor: theme.surfaceAlt, borderColor: theme.line },
    ]}
  >
    {icon}
    <Text style={[ss.sensorText, { color: theme.text }]}>{label}</Text>
  </TouchableOpacity>
);

const ss = StyleSheet.create({
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 20,
    marginBottom: 16,
  },
  alertTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900' },
  alertSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 2,
  },
  contextBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  contextText: { fontSize: 24, fontWeight: '900' },
  clockLabel: { fontSize: 24, fontWeight: '700', marginTop: 4 },
  clock: {
    fontSize: SENIOR_TYPE.hero,
    fontWeight: SENIOR_TYPE.weight,
    letterSpacing: -1,
    marginBottom: 18,
    fontVariant: ['tabular-nums'],
  },
  actionCard: {
    borderRadius: 28,
    borderWidth: 1.5,
    padding: 28,
    marginBottom: 16,
  },
  actionTitle: { fontSize: 40, fontWeight: '900', textAlign: 'center' },
  actionSub: { fontSize: 24, fontWeight: '600', textAlign: 'center' },
  doneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginTop: 6,
  },
  doneText: { fontSize: 24, fontWeight: '900' },
  radioCard: {
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 20,
    gap: 14,
    marginBottom: 24,
  },
  radioTitle: { fontSize: 24, fontWeight: '900' },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioScript: { fontSize: 24, fontWeight: '600', fontStyle: 'italic' },
  panelLabel: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  sensorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
  },
  sensorText: { fontSize: 18, fontWeight: '700', flex: 1 },
  rollbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 24,
    borderRadius: 24,
    marginTop: 28,
  },
  rollbackText: { color: '#1A1304', fontSize: 24, fontWeight: '900' },
});

// ============================================================================
// 👨‍👩‍👧 FamilyScreen — 원격 제어 대시보드 (태그 관리 섹션 추가)
// ============================================================================
const FamilyScreen = ({
  theme,
  battery,
  logs,
  meals,
  onChangeMeal,
  radius,
  onChangeRadius,
  context,
  medicationDone,
  safeZoneAlert,
  tags,
  onAddTag,
  onEditTag,
  onDeleteTag,
}) => {
  const circleScale = 0.35 + ((radius - 100) / 900) * 0.65;
  const mapSize = SCREEN_W - 40 - 40;
  const circleSize = Math.min(mapSize, 220) * circleScale;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ① 원격 안심 모니터링 카드 */}
      <View
        style={[fs.card, { backgroundColor: theme.surface, borderColor: theme.line }]}
      >
        <View style={fs.cardHeader}>
          <ShieldCheck color={theme.accent} size={22} strokeWidth={2.5} />
          <Text style={[fs.cardTitle, { color: theme.text }]}>
            아버지 기기 · 실시간
          </Text>
          <View style={[fs.liveDot, { backgroundColor: theme.accent }]} />
        </View>

        <View style={fs.statRow}>
          <View style={fs.stat}>
            <BatteryMedium
              color={battery > 20 ? theme.accent : theme.rose}
              size={22}
              strokeWidth={2.5}
            />
            <Text style={[fs.statValue, { color: theme.text }]}>{battery}%</Text>
            <Text style={[fs.statLabel, { color: theme.subText }]}>배터리</Text>
          </View>
          <View style={fs.stat}>
            <Wifi color={theme.accent} size={22} strokeWidth={2.5} />
            <Text style={[fs.statValue, { color: theme.text }]}>좋음</Text>
            <Text style={[fs.statLabel, { color: theme.subText }]}>Wi-Fi</Text>
          </View>
          <View style={fs.stat}>
            {context === 'worship' ? (
              <Church color={theme.accent} size={22} strokeWidth={2.5} />
            ) : safeZoneAlert ? (
              <AlertTriangle color={theme.rose} size={22} strokeWidth={2.5} />
            ) : (
              <Sun color={theme.amber} size={22} strokeWidth={2.5} />
            )}
            <Text style={[fs.statValue, { color: theme.text }]}>
              {context === 'worship'
                ? '예배 중'
                : safeZoneAlert
                ? '구역 이탈'
                : '일상'}
            </Text>
            <Text style={[fs.statLabel, { color: theme.subText }]}>컨텍스트</Text>
          </View>
          <View style={fs.stat}>
            <Pill
              color={medicationDone ? theme.accent : theme.amber}
              size={22}
              strokeWidth={2.5}
            />
            <Text style={[fs.statValue, { color: theme.text }]}>
              {medicationDone ? '완료' : '대기'}
            </Text>
            <Text style={[fs.statLabel, { color: theme.subText }]}>복약</Text>
          </View>
        </View>

        <View style={[fs.divider, { backgroundColor: theme.line }]} />
        <View style={fs.cardHeader}>
          <Activity color={theme.subText} size={16} strokeWidth={2.5} />
          <Text style={[fs.logHeader, { color: theme.subText }]}>
            최근 액션 타임라인
          </Text>
        </View>
        {logs.length === 0 ? (
          <Text style={[fs.logEmpty, { color: theme.subText }]}>
            아직 기록된 이벤트가 없어요. 시니어 모드에서 NFC 태그를 스캔하거나
            GPS 버튼을 작동시키면 여기에 즉시 표시됩니다.
          </Text>
        ) : (
          logs.map((log) => (
            <View key={log.id} style={fs.logRow}>
              <View
                style={[
                  fs.logDot,
                  {
                    backgroundColor:
                      log.type === 'danger'
                        ? theme.rose
                        : log.type === 'warn'
                        ? theme.amber
                        : theme.accent,
                  },
                ]}
              />
              <Text style={[fs.logTime, { color: theme.subText }]}>
                {log.time}
              </Text>
              <Text
                style={[fs.logText, { color: theme.text }]}
                numberOfLines={2}
              >
                {log.text}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* ② 식사 루틴 대리 설정 */}
      <Text style={[fs.sectionLabel, { color: theme.subText }]}>
        🍚 식사 루틴 대리 설정 · Meal Check
      </Text>
      {meals.map((meal, idx) => (
        <View
          key={meal.key}
          style={[
            fs.mealCard,
            { backgroundColor: theme.surface, borderColor: theme.line },
          ]}
        >
          <View style={fs.mealRow}>
            <View
              style={[fs.mealIconWrap, { backgroundColor: theme.accentDim }]}
            >
              {idx === 0 ? (
                <Sun color={theme.accent} size={20} strokeWidth={2.5} />
              ) : idx === 1 ? (
                <UtensilsCrossed
                  color={theme.accent}
                  size={20}
                  strokeWidth={2.5}
                />
              ) : (
                <Moon color={theme.accent} size={20} strokeWidth={2.5} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[fs.mealName, { color: theme.text }]}>
                {meal.en}
              </Text>
              <Text style={[fs.mealKo, { color: theme.subText }]}>
                {meal.label} 알림
              </Text>
            </View>
            <Text style={[fs.mealTime, { color: theme.accent }]}>
              {minutesToLabel(meal.timeMins)}
            </Text>
          </View>
          <CustomSlider
            min={300}
            max={1320}
            step={5}
            value={meal.timeMins}
            onChange={(v) => onChangeMeal(meal.key, v)}
            theme={theme}
          />
        </View>
      ))}

      {/* ③ GPS 나노 존 맵 */}
      <Text style={[fs.sectionLabel, { color: theme.subText }]}>
        📍 GPS 나노 존 · Safe Zone 반경
      </Text>
      <View
        style={[fs.card, { backgroundColor: theme.surface, borderColor: theme.line }]}
      >
        <View style={[fs.mapCanvas, { backgroundColor: theme.surfaceAlt }]}>
          <View style={[fs.gridH, { backgroundColor: theme.line, top: '33%' }]} />
          <View style={[fs.gridH, { backgroundColor: theme.line, top: '66%' }]} />
          <View style={[fs.gridV, { backgroundColor: theme.line, left: '33%' }]} />
          <View style={[fs.gridV, { backgroundColor: theme.line, left: '66%' }]} />
          <View
            style={{
              position: 'absolute',
              width: circleSize,
              height: circleSize,
              borderRadius: circleSize / 2,
              backgroundColor: theme.accent,
              opacity: 0.15,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: circleSize,
              height: circleSize,
              borderRadius: circleSize / 2,
              borderWidth: 2,
              borderColor: theme.accent,
              opacity: 0.7,
            }}
          />
          <View style={[fs.pin, { backgroundColor: theme.accent }]}>
            <MapPin color={theme.onAccent} size={16} strokeWidth={3} />
          </View>
        </View>
        <View style={fs.radiusRow}>
          <Text style={[fs.radiusValue, { color: theme.text }]}>
            {radius >= 1000 ? '1km' : `${radius}m`}
          </Text>
          {radius <= 150 && (
            <View style={[fs.nanoBadge, { backgroundColor: theme.accentDim }]}>
              <Text style={[fs.nanoText, { color: theme.accent }]}>
                Nano Size
              </Text>
            </View>
          )}
        </View>
        <CustomSlider
          min={100}
          max={1000}
          step={50}
          value={radius}
          onChange={onChangeRadius}
          theme={theme}
        />
        <View style={fs.radiusScale}>
          <Text style={[fs.scaleText, { color: theme.subText }]}>
            100m (Nano)
          </Text>
          <Text style={[fs.scaleText, { color: theme.subText }]}>1km</Text>
        </View>
      </View>

      {/* ④ NFC 태그 관리 (신규) */}
      <TagManagerSection
        tags={tags}
        theme={theme}
        onAdd={onAddTag}
        onEdit={onEditTag}
        onDelete={onDeleteTag}
      />
    </ScrollView>
  );
};

const fs = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 18, marginBottom: 20 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', flex: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', gap: 4, flex: 1 },
  statValue: { fontSize: 15, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600' },
  divider: { height: 1, marginVertical: 14 },
  logHeader: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  logEmpty: { fontSize: 13, lineHeight: 19 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  logDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  logTime: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    width: 58,
  },
  logText: { fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  mealCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  mealIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealName: { fontSize: 15, fontWeight: '800' },
  mealKo: { fontSize: 12, fontWeight: '600' },
  mealTime: {
    fontSize: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  mapCanvas: {
    height: 220,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 14,
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    opacity: 0.6,
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    opacity: 0.6,
  },
  pin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radiusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  radiusValue: {
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  nanoBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  nanoText: { fontSize: 11, fontWeight: '800' },
  radiusScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  scaleText: { fontSize: 11, fontWeight: '600' },
});

// ============================================================================
// 🚪 SelectionScreen
// ============================================================================
const SelectionScreen = ({ theme, onSelect }) => (
  <View style={sel.wrap}>
    <View style={[sel.logoBadge, { backgroundColor: theme.accent }]}>
      <Radio color={theme.onAccent} size={36} strokeWidth={2.5} />
    </View>
    <Text style={[sel.brand, { color: theme.text }]}>TagRoutine</Text>
    <Text style={[sel.tagline, { color: theme.subText }]}>
      태그 한 번으로 이어지는 가족의 하루
    </Text>
    <TouchableOpacity
      activeOpacity={0.85}
      style={[sel.bigBtn, { backgroundColor: theme.accent }]}
      onPress={() => onSelect('senior')}
    >
      <Smartphone color={theme.onAccent} size={44} strokeWidth={2.5} />
      <Text style={[sel.bigBtnText, { color: theme.onAccent }]}>
        시니어{'\n'}이지 모드
      </Text>
    </TouchableOpacity>
    <TouchableOpacity
      activeOpacity={0.85}
      style={[
        sel.bigBtn,
        {
          backgroundColor: theme.surface,
          borderWidth: 2,
          borderColor: theme.accent,
        },
      ]}
      onPress={() => onSelect('family')}
    >
      <Users color={theme.accent} size={44} strokeWidth={2.5} />
      <Text style={[sel.bigBtnText, { color: theme.accent }]}>
        보호자{'\n'}패밀리 모드
      </Text>
    </TouchableOpacity>
  </View>
);

const sel = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontSize: 36, fontWeight: '900', letterSpacing: -0.5 },
  tagline: { fontSize: 16, fontWeight: '600', marginBottom: 16 },
  bigBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    padding: 28,
    borderRadius: 28,
  },
  bigBtnText: { fontSize: 28, fontWeight: '900', lineHeight: 34 },
});

// ============================================================================
// 🧠 App — 글로벌 상태 루트 + NFC 초기화 + AsyncStorage 연동
// ============================================================================
export default function App() {
  const [mode, setMode] = useState('selection');

  const [meals, setMeals] = useState([
    { key: 'breakfast', en: 'Breakfast', label: '아침', timeMins: 8 * 60 },
    { key: 'lunch',     en: 'Lunch',     label: '점심', timeMins: 12 * 60 },
    { key: 'dinner',    en: 'Dinner',    label: '저녁', timeMins: 18 * 60 },
  ]);

  const [medicationDone, setMedicationDone] = useState(false);
  const [context, setContext] = useState('normal');
  const [safeZoneAlert, setSafeZoneAlert] = useState(false);
  const [radius, setRadius] = useState(100);
  const [battery, setBattery] = useState(82);
  const [logs, setLogs] = useState([]);
  const [now, setNow] = useState(new Date());

  // NFC 관련 상태
  const [nfcSupported, setNfcSupported] = useState(false);
  const [tags, setTags] = useState([]);         // 등록 태그 목록 (AsyncStorage 연동)

  // 태그 관리 모달 상태
  const [showTagModal, setShowTagModal] = useState(false);
  const [editingTag, setEditingTag] = useState(null); // null = 신규, 객체 = 수정

  // ── 최신 상태를 NFC 이벤트 핸들러에서 읽기 위한 ref ──────────────────────
  const tagsRef = useRef([]);
  useEffect(() => { tagsRef.current = tags; }, [tags]);

  const handlersRef = useRef({});

  // ── 실시간 시계 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── 가상 배터리 드레인 ───────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setBattery((b) => Math.max(5, b - 1)), 25000);
    return () => clearInterval(t);
  }, []);

  // ── 로그 적재 헬퍼 ───────────────────────────────────────────────────────
  const pushLog = useCallback((text, type = 'info') => {
    setLogs((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random()}`,
          time: logStamp(),
          text,
          type,
        },
        ...prev,
      ].slice(0, 8)
    );
  }, []);

  // ── 센서 이벤트 핸들러 ───────────────────────────────────────────────────
  const handleWorship = useCallback(() => {
    setContext('worship');
    setSafeZoneAlert(false);
    pushLog('📍 예배당 진입 감지 → 자동 음소거/방해금지 모드 전환', 'info');
  }, [pushLog]);

  const handleSafeZone = useCallback(() => {
    setSafeZoneAlert(true);
    pushLog(`🚨 Safe Zone(반경 ${radius}m) 이탈 감지 — 위치 공유 시작`, 'danger');
  }, [pushLog, radius]);

  const handleNFC = useCallback(() => {
    setMedicationDone(true);
    pushLog('💊 NFC 약통 스티커 태그 — 약 복용 완료 확인', 'info');
  }, [pushLog]);

  const handleRollback = useCallback(() => {
    setContext('normal');
    setSafeZoneAlert(false);
    pushLog('↩️ 시니어가 원래 화면으로 복귀 (Rollback)', 'warn');
  }, [pushLog]);

  const handleChangeMeal = useCallback((key, timeMins) => {
    setMeals((prev) => prev.map((m) => (m.key === key ? { ...m, timeMins } : m)));
  }, []);

  // handlersRef를 항상 최신으로 유지
  useEffect(() => {
    handlersRef.current = { handleNFC, handleWorship, pushLog };
  }, [handleNFC, handleWorship, pushLog]);

  // ── AsyncStorage: 앱 시작 시 저장된 태그 로드 ────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setTags(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  // ── NFC 초기화 (앱 시작 시 1회) ─────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const supported = await NfcManager.isSupported();
        if (!mounted) return;
        setNfcSupported(supported);
        if (supported) {
          await NfcManager.start();
          // DiscoverTag 이벤트: ref를 통해 최신 tags와 handlers에 접근
          NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag) => {
            const id = normalizeTagId(tag?.id);
            const matched = tagsRef.current.find((t) => t.id === id);
            if (!matched) {
              handlersRef.current.pushLog(
                `🏷️ 미등록 NFC 태그 감지 (${id.slice(0, 8) || '?'}…)`,
                'warn'
              );
              return;
            }
            switch (matched.action) {
              case 'medication':
                handlersRef.current.handleNFC();
                break;
              case 'worship':
                handlersRef.current.handleWorship();
                break;
              case 'home':
                handlersRef.current.pushLog(
                  `🏠 NFC 귀가 확인: ${matched.name}`,
                  'info'
                );
                break;
              default:
                handlersRef.current.pushLog(
                  `🏷️ NFC 태그 감지: ${matched.name}`,
                  'info'
                );
            }
          });
        }
      } catch (e) {
        console.warn('NFC init error', e);
      }
    };
    init();
    return () => {
      mounted = false;
      NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
      NfcManager.unregisterTagEvent().catch(() => {});
    };
  }, []);

  // ── 시니어 모드 진입/이탈 시 NFC 리스닝 토글 ────────────────────────────
  useEffect(() => {
    if (!nfcSupported) return;
    if (mode === 'senior') {
      NfcManager.registerTagEvent({
        alertMessage: '약통이나 등록된 태그에 폰을 대세요',
        invalidateAfterFirstRead: false, // iOS: 첫 스캔 후에도 세션 유지
      }).catch((e) => console.warn('NFC registerTagEvent error', e));
    } else {
      NfcManager.unregisterTagEvent().catch(() => {});
    }
  }, [mode, nfcSupported]);

  // ── 태그 저장 헬퍼 ───────────────────────────────────────────────────────
  const persistTags = useCallback((next) => {
    setTags(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // ── 태그 CRUD ─────────────────────────────────────────────────────────────
  const handleSaveTag = useCallback(
    (tagData) => {
      setTags((prev) => {
        const idx = prev.findIndex((t) => t.id === tagData.id);
        const next =
          idx >= 0
            ? prev.map((t, i) => (i === idx ? tagData : t))
            : [...prev, { ...tagData, createdAt: Date.now() }];
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      setShowTagModal(false);
      setEditingTag(null);
    },
    []
  );

  const handleDeleteTag = useCallback((tagId) => {
    setTags((prev) => {
      const next = prev.filter((t) => t.id !== tagId);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const openAddTag = useCallback(() => {
    setEditingTag(null);
    setShowTagModal(true);
  }, []);

  const openEditTag = useCallback((tag) => {
    setEditingTag(tag);
    setShowTagModal(true);
  }, []);

  const closeTagModal = useCallback(() => {
    setShowTagModal(false);
    setEditingTag(null);
  }, []);

  const theme = context === 'worship' ? THEMES.worship : THEMES.default;

  return (
    <SafeAreaView style={[appStyle.root, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.bg} />

      {mode !== 'selection' && (
        <View
          style={[
            appStyle.segment,
            { backgroundColor: theme.surface, borderColor: theme.line },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              appStyle.segmentBtn,
              mode === 'senior' && { backgroundColor: theme.accent },
            ]}
            onPress={() => setMode('senior')}
          >
            <Smartphone
              color={mode === 'senior' ? theme.onAccent : theme.subText}
              size={20}
              strokeWidth={2.5}
            />
            <Text
              style={[
                appStyle.segmentText,
                {
                  color:
                    mode === 'senior' ? theme.onAccent : theme.subText,
                },
              ]}
            >
              시니어 모드
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              appStyle.segmentBtn,
              mode === 'family' && { backgroundColor: theme.accent },
            ]}
            onPress={() => setMode('family')}
          >
            <Users
              color={mode === 'family' ? theme.onAccent : theme.subText}
              size={20}
              strokeWidth={2.5}
            />
            <Text
              style={[
                appStyle.segmentText,
                {
                  color:
                    mode === 'family' ? theme.onAccent : theme.subText,
                },
              ]}
            >
              패밀리 모드
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'selection' && (
        <SelectionScreen theme={theme} onSelect={setMode} />
      )}
      {mode === 'senior' && (
        <SeniorScreen
          theme={theme}
          now={now}
          meals={meals}
          medicationDone={medicationDone}
          context={context}
          safeZoneAlert={safeZoneAlert}
          nfcSupported={nfcSupported}
          onTriggerWorship={handleWorship}
          onTriggerSafeZone={handleSafeZone}
          onRollback={handleRollback}
        />
      )}
      {mode === 'family' && (
        <FamilyScreen
          theme={theme}
          battery={battery}
          logs={logs}
          meals={meals}
          onChangeMeal={handleChangeMeal}
          radius={radius}
          onChangeRadius={setRadius}
          context={context}
          medicationDone={medicationDone}
          safeZoneAlert={safeZoneAlert}
          tags={tags}
          onAddTag={openAddTag}
          onEditTag={openEditTag}
          onDeleteTag={handleDeleteTag}
        />
      )}

      {/* 태그 등록/수정 모달 — 패밀리 모드에서만 노출 */}
      <TagModal
        visible={showTagModal}
        editTag={editingTag}
        theme={theme}
        onSave={handleSaveTag}
        onCancel={closeTagModal}
      />
    </SafeAreaView>
  );
}

const appStyle = StyleSheet.create({
  root: { flex: 1 },
  segment: {
    flexDirection: 'row',
    margin: 16,
    marginBottom: 8,
    padding: 5,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  segmentText: { fontSize: 15, fontWeight: '800' },
});
