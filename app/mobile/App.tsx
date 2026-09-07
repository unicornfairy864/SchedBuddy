import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  addDays,
  diffDays,
  expandAll,
  minutesToHM,
  mondayOf,
  rangeDates,
  todayStr,
  TYPE_CN,
  weekdayOf,
  type Occurrence,
  type Schedule,
} from '@schedbuddy/shared';
import { fetchMeta, fetchSchedules, Meta, MetaError, pairDevice } from './src/api';
import {
  baseUrlOf,
  clearDevice,
  DEFAULT_PORT,
  HostConfig,
  loadDevice,
  loadHost,
  parseHostInput,
  PairedDevice,
  saveDevice,
  saveHost,
} from './src/host';

type Mode = 'week' | 'day';
type Screen = 'view' | 'settings';

const WEEK_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const CAL_WEEK = ['一', '二', '三', '四', '五', '六', '日'];

/** 以某日期所在月为基准的完整周网格（周一开头，42 格，含邻月补位）。 */
function monthGridOf(anchor: string): { cells: { date: string; inMonth: boolean }[]; month: string } {
  const month = anchor.slice(0, 7);
  const first = mondayOf(`${month}-01`);
  return {
    month,
    cells: rangeDates(first, addDays(first, 41)).map((date) => ({ date, inMonth: date.slice(0, 7) === month })),
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('view');
  const [host, setHost] = useState<HostConfig | null>(null);
  const [device, setDevice] = useState<PairedDevice | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<Mode>('week');
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [calMonthOff, setCalMonthOff] = useState(0);

  const [input, setInput] = useState('');
  const [pairPin, setPairPin] = useState('');
  const [ioBusy, setIoBusy] = useState(false);

  useEffect(() => {
    loadHost().then((cfg) => {
      setHost(cfg);
      if (cfg) setInput(`${cfg.host}:${cfg.port}`);
    });
    loadDevice().then(setDevice);
  }, []);

  const loadAll = useCallback(async (cfg: HostConfig) => {
    setLoading(true);
    setErr('');
    try {
      const base = baseUrlOf(cfg);
      const [m, list] = await Promise.all([fetchMeta(base), fetchSchedules(base)]);
      setMeta(m);
      setSchedules(list);
      setPicked(null);
    } catch (e) {
      setMeta(null);
      setSchedules(null);
      setErr(e instanceof MetaError ? e.message : `加载失败：${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // 主机存在即自动拉取
  useEffect(() => {
    if (host) void loadAll(host);
  }, [host, loadAll]);

  const today = todayStr();

  const goToday = useCallback(() => setOffset(0), []);
  const goPrev = useCallback(() => setOffset((o) => o - 1), []);
  const goNext = useCallback(() => setOffset((o) => o + 1), []);

  /** 日历选点：日模式 → 直达该日；周模式 → 跳到该日所在周 */
  const pickDate = useCallback(
    (date: string) => {
      setCalOpen(false);
      setCalMonthOff(0);
      if (mode === 'day') setOffset(diffDays(today, date));
      else setOffset(Math.round(diffDays(mondayOf(today), mondayOf(date)) / 7));
    },
    [mode, today],
  );

  /* ---------- 数据窗口（引擎复用：mondayOf/rangeDates/addDays/expandAll） ---------- */
  const win = useMemo(() => {
    if (mode === 'week') {
      const anchor = mondayOf(addDays(today, offset * 7));
      const dates = rangeDates(anchor, addDays(anchor, 6));
      return { dates, from: dates[0], to: dates[dates.length - 1] };
    }
    const d = addDays(today, offset);
    return { dates: [d], from: d, to: d };
  }, [mode, offset, today]);

  const occs = useMemo(() => {
    if (!schedules) return [];
    return expandAll(schedules, { from: win.from, to: win.to, termStart: meta?.termStart ?? null, holidays: null });
  }, [schedules, win, meta?.termStart]);

  const byDate = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of occs) {
      const list = m.get(o.date) ?? [];
      list.push(o);
      m.set(o.date, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.startMin - b.startMin);
    return m;
  }, [occs]);

  // 展开详情用：scheduleId → 完整日程（取 notes 等 Occurrence 未携带的字段）
  const byId = useMemo(() => new Map((schedules ?? []).map((s) => [s.id, s])), [schedules]);

  const rangeLabel = useMemo(() => {
    const fmt = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
    if (mode === 'week') {
      return `${fmt(win.dates[0])}–${fmt(win.dates[6])}`;
    }
    const wd = weekdayOf(win.dates[0]);
    return `${fmt(win.dates[0])} ${WEEK_CN[wd - 1]}`;
  }, [mode, win]);

  /* ---------- 配对 / 保存（设置页复用） ---------- */
  const saveAndConnect = useCallback(async () => {
    const cfg = parseHostInput(input);
    if (!cfg) return;
    await saveHost(cfg);
    setHost(cfg);
    setInput(`${cfg.host}:${cfg.port}`);
    setScreen('view');
    void loadAll(cfg);
  }, [input, loadAll]);

  const doPair = useCallback(async () => {
    const cfg = parseHostInput(input) ?? host;
    if (!cfg || !pairPin.trim()) return;
    setIoBusy(true);
    try {
      const res = await pairDevice(baseUrlOf(cfg), pairPin);
      const dev: PairedDevice = { deviceId: res.deviceId, token: res.token, name: res.name };
      await saveDevice(dev);
      setDevice(dev);
      setPairPin('');
      setScreen('view');
      if (host) void loadAll(host);
    } catch (e) {
      setErr(e instanceof MetaError ? `配对失败：${e.message}` : `配对失败：${String(e)}`);
    } finally {
      setIoBusy(false);
    }
  }, [input, host, pairPin, loadAll]);

  const unpair = useCallback(async () => {
    await clearDevice();
    setDevice(null);
  }, []);

  const backToView = useCallback(() => setScreen('view'), []);

  if (screen === 'settings') {
    return (
      <SettingsView
        host={host}
        device={device}
        input={input}
        pairPin={pairPin}
        ioBusy={ioBusy}
        onChangeInput={setInput}
        onChangePin={(v) => setPairPin(v.replace(/[^0-9]/g, '').slice(0, 6))}
        onSaveHost={saveAndConnect}
        onPair={doPair}
        onUnpair={unpair}
        onBack={backToView}
      />
    );
  }

  /* ============ 只读 周/日 视图 ============ */
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {/* 顶栏：品牌 + 主机状态 + 操作 */}
      <View style={styles.topbar}>
        <View style={styles.brandBlock}>
          <Text style={styles.logoMini}>SchedBuddy</Text>
          <Text style={styles.hostLine}>
            {host ? `${host.host}:${host.port}` : '未配置主机'}
            {meta ? ` · v${meta.version}` : ''}
          </Text>
        </View>
        <View style={styles.topActions}>
          <Pressable style={styles.iconBtn} onPress={() => host && void loadAll(host)} accessibilityLabel="刷新">
            <Text style={styles.iconText}>↻</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => setScreen('settings')} accessibilityLabel="设置">
            <Text style={styles.iconText}>⚙</Text>
          </Pressable>
        </View>
      </View>

      {/* 导航行 */}
      <View style={styles.navRow}>
        <Pressable style={styles.navBtn} onPress={goPrev}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Pressable style={styles.navBtn} onPress={goToday}>
          <Text style={styles.navText}>今天</Text>
        </Pressable>
        <Pressable style={styles.navPill} onPress={() => { setCalMonthOff(0); setCalOpen(true); }} accessibilityLabel="打开日历选择">
          <Text style={styles.navPillText} numberOfLines={1}>{rangeLabel}</Text>
        </Pressable>
        <Pressable style={styles.navBtn} onPress={goNext}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
        <View style={styles.segment}>
          <Pressable style={[styles.segBtn, mode === 'week' && styles.segOn]} onPress={() => { setMode('week'); setOffset(0); }}>
            <Text style={[styles.segText, mode === 'week' && styles.segTextOn]}>周</Text>
          </Pressable>
          <Pressable style={[styles.segBtn, mode === 'day' && styles.segOn]} onPress={() => { setMode('day'); setOffset(0); }}>
            <Text style={[styles.segText, mode === 'day' && styles.segTextOn]}>日</Text>
          </Pressable>
        </View>
      </View>

      {/* 主体 */}
      {!host ? (
        <Centered
          text="尚未配置主机 — 请先到「设置」填写电脑局域网地址"
          actionLabel="去设置"
          onAction={() => setScreen('settings')}
        />
      ) : loading && !schedules ? (
        <Centered loading text={`正在连接 ${host.host}…`} />
      ) : err && !schedules ? (
        <Centered text={`${err}\n（主机可能未启动或地址不对）`} actionLabel="重试" onAction={() => void loadAll(host)} />
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollPad}>
          {schedules === null ? null : (
            win.dates.map((d) => {
              const list = byDate.get(d) ?? [];
              const isToday = d === today;
              return (
                <View key={d} style={[styles.dayCard, isToday && styles.dayCardToday]}>
                  <View style={styles.dayHead}>
                    <Text style={styles.dayTitle}>
                      {d.slice(5)} {WEEK_CN[weekdayOf(d) - 1]}
                    </Text>
                    {isToday && <Text style={styles.todayBadge}>今天</Text>}
                    <Text style={styles.dayCount}>{list.length} 项</Text>
                  </View>
                  {list.length === 0 ? (
                    <Text style={styles.empty}>无日程</Text>
                  ) : (
                    list.map((o) => {
                      const key = `${o.scheduleId}:${o.date}:${o.startMin}`;
                      const open = picked === key;
                      return (
                        <View key={key}>
                          <Pressable
                            style={[styles.occRow, open && styles.occRowOpen]}
                            onPress={() => setPicked(open ? null : key)}
                          >
                            <View style={[styles.occBar, { backgroundColor: o.color }]} />
                            <Text style={styles.occTime}>
                              {minutesToHM(o.startMin)}–{minutesToHM(o.endMin)}
                            </Text>
                            <Text style={styles.occTitle} numberOfLines={1}>{o.title}</Text>
                            <Text style={styles.occType}>{TYPE_CN[o.type] ?? ''}</Text>
                          </Pressable>
                          {open && (
                            <View style={styles.occDetail}>
                              <Text style={styles.detailText}>
                                {TYPE_CN[o.type] ?? '日程'} · {minutesToHM(o.startMin)}–{minutesToHM(o.endMin)}
                              </Text>
                              {(() => {
                                const notes = (byId.get(o.scheduleId)?.notes ?? '').trim();
                                return notes ? (
                                  <Text style={styles.detailNotes}>{notes}</Text>
                                ) : (
                                  <Text style={styles.detailNotesMuted}>（无备注）</Text>
                                );
                              })()}
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>
              );
            })
          )}
          {win.dates.length === 0 && <Text style={styles.empty}>窗口为空</Text>}
        </ScrollView>
      )}

      {/* 日历弹层：周视图=周历选周；日视图=日历选日 */}
      {calOpen &&
        (() => {
          const d0 = win.dates[0];
          const t0 = new Date(Number(d0.slice(0, 4)), Number(d0.slice(5, 7)) - 1 + calMonthOff, 1);
          const base = `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(2, '0')}-01`;
          const { cells, month } = monthGridOf(base);
          const mon = mondayOf(d0);
          return (
            <Modal transparent visible animationType="fade" onRequestClose={() => setCalOpen(false)}>
              <Pressable style={styles.calMask} onPress={() => setCalOpen(false)}>
                <Pressable style={styles.calSheet} onPress={() => undefined}>
                  <View style={styles.calHead}>
                    <Pressable style={styles.calNavBtn} onPress={() => setCalMonthOff((o) => o - 1)}>
                      <Text style={styles.calNavText}>‹</Text>
                    </Pressable>
                    <Text style={styles.calTitle}>
                      {Number(month.slice(0, 4))} 年 {Number(month.slice(5, 7))} 月
                    </Text>
                    <Pressable style={styles.calNavBtn} onPress={() => setCalMonthOff((o) => o + 1)}>
                      <Text style={styles.calNavText}>›</Text>
                    </Pressable>
                  </View>
                  <View style={styles.calWeekRow}>
                    {CAL_WEEK.map((w) => (
                      <Text key={w} style={styles.calWeekLabel}>{w}</Text>
                    ))}
                  </View>
                  {chunk(cells, 7).map((row, ri) => {
                    // 周视图：当前周 = 整行一个深绿圆角框（row[0] 即该行周一）
                    const selRow = mode === 'week' && row[0].date === mon;
                    return (
                      <View key={ri} style={[styles.calWeekRow, selRow && styles.calWeekSelRow]}>
                        {row.map(({ date, inMonth }) => {
                          const daySel = mode === 'day' && date === d0;
                          const dot = (selRow && date === today) || daySel; // 框内今天 / 日视图选中 = 实心圆点
                          const todayPlain = date === today && !dot;
                          return (
                            <Pressable
                              key={date}
                              style={[styles.calCell, !inMonth && styles.calCellMuted, dot && styles.calDot]}
                              onPress={() => pickDate(date)}
                            >
                              <Text style={[styles.calCellText, todayPlain && styles.calTodayText, dot && styles.calDotText]}>
                                {Number(date.slice(8, 10))}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    );
                  })}
                  <Text style={styles.calHint}>{mode === 'week' ? '点日期 → 跳到其所在周' : '点日期 → 跳到该日'}</Text>
                </Pressable>
              </Pressable>
            </Modal>
          );
        })()}
    </View>
  );
}

function Centered(props: { text: string; actionLabel?: string; onAction?: () => void; loading?: boolean }) {
  return (
    <View style={styles.centered}>
      {props.loading && <ActivityIndicator size="large" color="#2F855A" />}
      <Text style={styles.centeredText}>{props.text}</Text>
      {props.actionLabel && props.onAction && (
        <Pressable style={styles.primaryBtn} onPress={props.onAction}>
          <Text style={styles.primaryText}>{props.actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

/* ============ 设置页（主机 + 配对） ============ */
function SettingsView(props: {
  host: HostConfig | null;
  device: PairedDevice | null;
  input: string;
  pairPin: string;
  ioBusy: boolean;
  onChangeInput: (v: string) => void;
  onChangePin: (v: string) => void;
  onSaveHost: () => void;
  onPair: () => void;
  onUnpair: () => void;
  onBack: () => void;
}) {
  const { host, device, input, pairPin, ioBusy, onChangeInput, onChangePin, onSaveHost, onPair, onUnpair, onBack } = props;
  return (
    <ScrollView style={styles.settingsScroll} contentContainerStyle={styles.settingsInner}>
      <StatusBar style="dark" />
      <Text style={[styles.h1, styles.h1Top]}>主机设置</Text>
      <Text style={styles.help}>
        填写运行 SchedBuddy 的电脑在局域网中的地址（桌面/网页端页脚可查看）。端口默认 {DEFAULT_PORT}，可省略。
      </Text>
      <TextInput
        style={styles.input}
        value={input}
        onChangeText={onChangeInput}
        placeholder={`192.168.x.x[:${DEFAULT_PORT}]`}
        placeholderTextColor="#9AA8A0"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={onSaveHost}
      />
      <View style={styles.btnRow}>
        <Pressable style={styles.primaryBtn} onPress={onSaveHost}>
          <Text style={styles.primaryText}>保存并加载</Text>
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={onBack}>
          <Text style={styles.ghostText}>返回</Text>
        </Pressable>
      </View>

      <View style={styles.divider} />
      <Text style={styles.h1}>设备配对</Text>
      <Text style={styles.help}>
        在电脑「设置 → 移动设备配对」点「生成配对 PIN」，把 6 位 PIN 填到下面完成配对。
      </Text>
      {device ? (
        <View style={styles.pairedBox}>
          <Text style={styles.pairedOk}>✅ 已配对：{device.name || '设备'}</Text>
          <Text style={styles.muted}>device: {(device.deviceId || '').slice(0, 18)}…</Text>
          <Pressable style={[styles.ghostBtn, styles.blockBtn]} onPress={onUnpair} disabled={ioBusy}>
            <Text style={styles.ghostText}>解除配对（本机删除凭证）</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <TextInput
            style={[styles.input, styles.pinInput]}
            value={pairPin}
            onChangeText={onChangePin}
            placeholder="6 位配对 PIN"
            placeholderTextColor="#9AA8A0"
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={onPair}
          />
          <Pressable
            style={[styles.primaryBtn, styles.blockBtn, (!pairPin || ioBusy) && styles.disabled]}
            onPress={onPair}
            disabled={!pairPin || ioBusy}
          >
            <Text style={styles.primaryText}>{ioBusy ? '配对中…' : '配对'}</Text>
          </Pressable>
        </>
      )}
      <Text style={styles.footer}>本机调试可填 127.0.0.1:3876（仅模拟器可用）</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6FAFB' },
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8,
    backgroundColor: '#F6FAFB',
  },
  brandBlock: { flexShrink: 1 },
  logoMini: { fontSize: 20, fontWeight: '700', color: '#14532D' },
  hostLine: { fontSize: 12, color: '#7A8C81', marginTop: 2 },
  topActions: { flexDirection: 'row', gap: 10 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#DCE9DF', alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 20, color: '#2F855A' },

  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DCE9DF',
  },
  navBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE9DF',
  },
  navText: { fontSize: 15, color: '#2F855A', fontWeight: '600' },
  navPill: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#C9D9CF',
    borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14,
    marginHorizontal: 2,
  },
  navPillText: { fontSize: 13.5, fontWeight: '700', color: '#1C2B22' },
  segment: { flexDirection: 'row', backgroundColor: '#E4EEE7', borderRadius: 8, padding: 2 },
  segBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  segOn: { backgroundColor: '#2F855A' },
  segText: { fontSize: 14, color: '#4B7B5C', fontWeight: '600' },
  segTextOn: { color: '#FFFFFF' },

  scroll: { flex: 1 },
  scrollPad: { padding: 12, gap: 10, paddingBottom: 40 },
  dayCard: {
    backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E4EEE7',
    padding: 12,
  },
  dayCardToday: { borderColor: '#2F855A', borderWidth: 1.5 },
  dayHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dayTitle: { fontSize: 15, fontWeight: '700', color: '#1C2B22' },
  todayBadge: {
    marginLeft: 8, fontSize: 11, color: '#FFFFFF', backgroundColor: '#2F855A',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden',
  },
  dayCount: { marginLeft: 'auto', fontSize: 12, color: '#9AA8A0' },
  empty: { fontSize: 13, color: '#9AA8A0', paddingVertical: 8, textAlign: 'center' },
  occRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEF3F0',
  },
  occRowOpen: { backgroundColor: '#F2FBF8' },
  occBar: { width: 4, borderRadius: 2, alignSelf: 'stretch', minHeight: 18 },
  occTime: { fontSize: 12.5, color: '#4B7B5C', fontVariant: ['tabular-nums'], width: 92 },
  occTitle: { flex: 1, fontSize: 15, color: '#1C2B22', fontWeight: '500' },
  occType: { fontSize: 11, color: '#7A8C81' },
  occDetail: { paddingVertical: 6, paddingLeft: 12, gap: 4 },
  detailText: { fontSize: 12.5, color: '#5B6B60', lineHeight: 18 },
  detailNotes: { fontSize: 13, color: '#1C2B22', lineHeight: 19 },
  detailNotesMuted: { fontSize: 12, color: '#B4C4BA', fontStyle: 'italic' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  centeredText: { fontSize: 14, color: '#5B6B60', textAlign: 'center', lineHeight: 22 },
  primaryBtn: {
    backgroundColor: '#2F855A', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24,
    alignItems: 'center',
  },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  ghostBtn: {
    backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24,
    alignItems: 'center', borderWidth: 1, borderColor: '#2F855A',
  },
  ghostText: { color: '#2F855A', fontSize: 15, fontWeight: '600' },

  settingsScroll: { flex: 1, backgroundColor: '#F6FAFB' },
  settingsInner: { padding: 24, alignItems: 'center' },
  h1: { fontSize: 24, fontWeight: '700', color: '#14532D', marginBottom: 12, alignSelf: 'flex-start' },
  h1Top: { marginTop: 24 },
  help: { fontSize: 14, color: '#5B6B60', lineHeight: 21, marginBottom: 16, alignSelf: 'flex-start' },
  input: {
    width: '100%', backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1,
    borderColor: '#C9D9CF', paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#1C2B22',
  },
  pinInput: { marginBottom: 14, letterSpacing: 6, textAlign: 'center', fontSize: 20 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#DCE9DF', marginVertical: 24, width: '100%' },
  blockBtn: { flex: 0, width: '100%' },
  disabled: { opacity: 0.5 },
  pairedBox: {
    width: '100%', backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1,
    borderColor: '#BFE6DD', padding: 14, alignItems: 'center', gap: 8,
  },
  pairedOk: { fontSize: 15, fontWeight: '600', color: '#2F855A' },
  muted: { fontSize: 13, color: '#7A8C81' },
  footer: { fontSize: 11, color: '#9DB3A4', marginTop: 28, textAlign: 'center' },

  /* 日历弹层 */
  calMask: { flex: 1, backgroundColor: 'rgba(20,43,32,0.35)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  calSheet: {
    width: '100%', maxWidth: 320, backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 14, gap: 4,
  },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  calNavBtn: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#DCE9DF', backgroundColor: '#FFFFFF',
  },
  calNavText: { fontSize: 18, color: '#2F855A', lineHeight: 20 },
  calTitle: { fontSize: 16, fontWeight: '700', color: '#1C2B22' },
  calWeekRow: { flexDirection: 'row', width: '100%' },
  calWeekSelRow: {
    borderWidth: 1.5, borderColor: '#2F855A', borderRadius: 14,
    backgroundColor: '#F4FAF7', paddingVertical: 2, marginVertical: 1,
  },
  calWeekLabel: { flex: 1, textAlign: 'center', fontSize: 12.5, color: '#7A8C81', paddingVertical: 5 },
  calCell: {
    flexBasis: '14.28%', flexGrow: 1, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center', borderRadius: 999,
  },
  calCellMuted: { opacity: 0.35 },
  calDot: { backgroundColor: '#2F855A' },
  calCellText: { fontSize: 14.5, color: '#1C2B22' },
  calTodayText: { color: '#2F855A' },
  calDotText: { color: '#FFFFFF' },
  calHint: { marginTop: 8, fontSize: 12, color: '#7A8C81', textAlign: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4EEE7', paddingTop: 8 },
});
