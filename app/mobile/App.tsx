import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { todayStr, weekIndexOf } from '@schedbuddy/shared';
import { fetchMeta, Meta, MetaError, pairDevice, PairedResult } from './src/api';
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

type Screen = 'home' | 'settings';
type ConnState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; meta: Meta }
  | { kind: 'error'; message: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [host, setHost] = useState<HostConfig | null>(null);
  const [device, setDevice] = useState<PairedDevice | null>(null);
  const [conn, setConn] = useState<ConnState>({ kind: 'idle' });
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

  const connect = useCallback(async (cfg: HostConfig) => {
    setConn({ kind: 'loading' });
    try {
      const meta = await fetchMeta(baseUrlOf(cfg));
      setConn({ kind: 'ok', meta });
    } catch (e) {
      setConn({
        kind: 'error',
        message: e instanceof MetaError ? e.message : `连接失败：${String(e)}`,
      });
    }
  }, []);

  const saveAndConnect = useCallback(async () => {
    const cfg = parseHostInput(input);
    if (!cfg) {
      setConn({ kind: 'error', message: '主机地址格式不正确（示例：192.168.43.12 或 192.168.43.12:3876）' });
      return;
    }
    await saveHost(cfg);
    setHost(cfg);
    setScreen('home');
    void connect(cfg);
  }, [input, connect]);

  const doPair = useCallback(async () => {
    const cfg = parseHostInput(input) ?? host;
    if (!cfg) {
      setConn({ kind: 'error', message: '请先填写并保存主机地址' });
      return;
    }
    if (!pairPin.trim()) return;
    setIoBusy(true);
    try {
      const res: PairedResult = await pairDevice(baseUrlOf(cfg), pairPin);
      const dev: PairedDevice = { deviceId: res.deviceId, token: res.token, name: res.name };
      await saveDevice(dev);
      setDevice(dev);
      setPairPin('');
      setConn({ kind: 'ok', meta: await fetchMeta(baseUrlOf(cfg)) });
    } catch (e) {
      setConn({ kind: 'error', message: e instanceof MetaError ? `配对失败：${e.message}` : `配对失败：${String(e)}` });
    } finally {
      setIoBusy(false);
    }
  }, [input, host, pairPin]);

  const unpair = useCallback(async () => {
    await clearDevice();
    setDevice(null);
  }, []);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      {screen === 'home' ? (
        <Home
          host={host}
          device={device}
          conn={conn}
          onSettings={() => setScreen('settings')}
          onReconnect={() => host && void connect(host)}
        />
      ) : (
        <Settings
          host={host}
          device={device}
          input={input}
          pairPin={pairPin}
          ioBusy={ioBusy}
          onChangeInput={setInput}
          onChangePin={setPairPin}
          onSaveHost={saveAndConnect}
          onPair={doPair}
          onUnpair={unpair}
          onBack={() => {
            setScreen('home');
            if (host) setInput(`${host.host}:${host.port}`);
            else setInput('');
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function Home(props: {
  host: HostConfig | null;
  device: PairedDevice | null;
  conn: ConnState;
  onSettings: () => void;
  onReconnect: () => void;
}) {
  const { host, device, conn, onSettings, onReconnect } = props;
  const today = todayStr();
  return (
    <View style={styles.inner}>
      <View style={styles.brand}>
        <Text style={styles.logo}>SchedBuddy</Text>
        <Text style={styles.sub}>大学生时间管理 · v0.4 · 0.4.3</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.label}>主机</Text>
          {host ? <Text style={styles.hostText}>{`${host.host}:${host.port}`}</Text> : <Text style={styles.hostText}>未配置</Text>}

          <View style={styles.divider} />
          <Text style={styles.label}>连接状态</Text>
          {conn.kind === 'idle' && <Text style={styles.muted}>尚未连接 — 点「连接测试」确认主机可达</Text>}
          {conn.kind === 'loading' && (
            <View style={styles.row}>
              <ActivityIndicator size="small" color="#2F855A" />
              <Text style={styles.muted}> 正在连接…</Text>
            </View>
          )}
          {conn.kind === 'ok' && (
            <View>
              <Text style={styles.okText}>
                ✅ 已连接 · 主机 SchedBuddy v{conn.meta.version}
                {conn.meta.readOnly ? '' : '（可写）'}
              </Text>
              <Text style={styles.muted}>
                今天是 {today}
                {conn.meta.termStart ? ` · 第 ${weekIndexOf(today, conn.meta.termStart)} 周` : ' · 主机未设学期起点'}
              </Text>
            </View>
          )}
          {conn.kind === 'error' && <Text style={styles.errText}>{conn.message}</Text>}

          <View style={styles.divider} />
          <Text style={styles.label}>配对状态</Text>
          {device ? (
            <Text style={styles.okText}>✅ 已配对 · {device.name || device.deviceId.slice(0, 12)}</Text>
          ) : (
            <Text style={styles.muted}>未配对 — 只读查看；配对后可获得主机写入权限</Text>
          )}
        </View>
      </ScrollView>

      <View style={styles.btnRow}>
        <Pressable style={styles.btnPrimary} onPress={host ? onReconnect : onSettings}>
          <Text style={styles.btnPrimaryText}>
            {conn.kind === 'ok' ? '重新连接' : host ? '连接测试' : '去设置主机'}
          </Text>
        </Pressable>
        <Pressable style={styles.btnGhost} onPress={onSettings}>
          <Text style={styles.btnGhostText}>主机设置 / 配对</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>shared 规则引擎 · 局域网直连 · PIN 配对</Text>
    </View>
  );
}

function Settings(props: {
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
    <ScrollView style={styles.innerScroll} contentContainerStyle={styles.inner}>
      <Text style={styles.h1}>主机设置</Text>
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
        <Pressable style={styles.btnPrimary} onPress={onSaveHost}>
          <Text style={styles.btnPrimaryText}>保存并连接</Text>
        </Pressable>
        <Pressable style={styles.btnGhost} onPress={onBack}>
          <Text style={styles.btnGhostText}>返回</Text>
        </Pressable>
      </View>

      <View style={styles.dividerWide} />
      <Text style={styles.h1}>设备配对</Text>
      <Text style={styles.help}>
        在电脑「设置 → 移动设备配对」点「生成配对 PIN」，把 6 位 PIN 填到下面完成配对；配对后本机拥有写权限。
      </Text>
      {device ? (
        <View style={styles.pairedBox}>
          <Text style={styles.okText}>✅ 已配对：{device.name || '设备'}</Text>
          <Text style={styles.muted}>device: {device.deviceId.slice(0, 18)}…</Text>
          <Pressable style={[styles.btnGhost, styles.unpairBtn]} onPress={onUnpair} disabled={ioBusy}>
            <Text style={styles.btnGhostText}>解除配对（本机删除凭证）</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <TextInput
            style={[styles.input, styles.pinInput]}
            value={pairPin}
            onChangeText={(v) => onChangePin(v.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="6 位配对 PIN"
            placeholderTextColor="#9AA8A0"
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={onPair}
          />
          <Pressable
            style={[styles.btnPrimary, (!pairPin || ioBusy) && styles.btnDisabled]}
            onPress={onPair}
            disabled={!pairPin || ioBusy}
          >
            <Text style={styles.btnPrimaryText}>{ioBusy ? '配对中…' : '配对'}</Text>
          </Pressable>
        </>
      )}
      <Text style={styles.footer}>本机调试可填 127.0.0.1:3876（仅模拟器可用）</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6FAFB' },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    width: '100%',
  },
  innerScroll: { flex: 1, backgroundColor: '#F6FAFB' },
  scroll: { width: '100%', flexShrink: 1 },
  scrollContent: { paddingVertical: 4 },
  brand: { alignItems: 'center', marginBottom: 18, marginTop: 8 },
  logo: { fontSize: 40, fontWeight: '700', color: '#14532D', letterSpacing: 0.5 },
  sub: { marginTop: 6, fontSize: 15, color: '#4B7B5C' },
  h1: { fontSize: 24, fontWeight: '700', color: '#14532D', marginBottom: 12, alignSelf: 'flex-start' },
  help: { fontSize: 14, color: '#5B6B60', lineHeight: 21, marginBottom: 16, alignSelf: 'flex-start' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 18,
    width: '100%',
    borderWidth: 1,
    borderColor: '#DCE9DF',
  },
  label: { fontSize: 12, color: '#7A8C81', marginBottom: 4 },
  hostText: { fontSize: 20, fontWeight: '600', color: '#1C2B22', marginBottom: 8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#DCE9DF', marginVertical: 10 },
  dividerWide: { height: StyleSheet.hairlineWidth, backgroundColor: '#DCE9DF', marginVertical: 22, width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center' },
  okText: { fontSize: 15, fontWeight: '600', color: '#2F855A', marginBottom: 4 },
  errText: { fontSize: 14, color: '#C0392B', lineHeight: 20 },
  muted: { fontSize: 13, color: '#7A8C81', lineHeight: 20, marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' },
  btnPrimary: {
    flex: 1,
    backgroundColor: '#2F855A',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  btnGhost: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2F855A',
  },
  btnGhostText: { color: '#2F855A', fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  input: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C9D9CF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1C2B22',
  },
  pinInput: { marginBottom: 14, letterSpacing: 6, textAlign: 'center', fontSize: 20 },
  pairedBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFE6DD',
    padding: 14,
    alignItems: 'center',
  },
  unpairBtn: { marginTop: 12, alignSelf: 'stretch' },
  footer: { fontSize: 11, color: '#9DB3A4', marginTop: 24, textAlign: 'center', alignSelf: 'center' },
});
