import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { todayStr, weekIndexOf } from '@schedbuddy/shared';
import { fetchMeta, Meta, MetaError } from './src/api';
import {
  baseUrlOf,
  DEFAULT_PORT,
  HostConfig,
  loadHost,
  parseHostInput,
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
  const [conn, setConn] = useState<ConnState>({ kind: 'idle' });
  const [input, setInput] = useState('');

  // 启动：读取已保存主机配置
  useEffect(() => {
    loadHost().then((cfg) => {
      setHost(cfg);
      if (cfg) setInput(`${cfg.host}:${cfg.port}`);
    });
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

  const openSettings = useCallback(() => setScreen('settings'), []);

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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />
      {screen === 'home' ? (
        <Home
          host={host}
          conn={conn}
          onSettings={openSettings}
          onReconnect={() => host && void connect(host)}
        />
      ) : (
        <Settings
          input={input}
          onChangeInput={setInput}
          onCancel={() => {
            setScreen('home');
            if (host) setInput(`${host.host}:${host.port}`);
            else setInput('');
          }}
          onSave={saveAndConnect}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function Home(props: {
  host: HostConfig | null;
  conn: ConnState;
  onSettings: () => void;
  onReconnect: () => void;
}) {
  const { host, conn, onSettings, onReconnect } = props;
  const today = todayStr(); // shared 引擎：本地日期
  return (
    <View style={styles.inner}>
      <View style={styles.brand}>
        <Text style={styles.logo}>SchedBuddy</Text>
        <Text style={styles.sub}>大学生时间管理 · v0.4 · 0.4.2</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>主机</Text>
        {host ? (
          <Text style={styles.hostText}>{`${host.host}:${host.port}`}</Text>
        ) : (
          <Text style={styles.hostText}>未配置</Text>
        )}

        <View style={styles.divider} />

        <Text style={styles.label}>连接状态</Text>
        {conn.kind === 'idle' && (
          <Text style={styles.muted}>尚未连接 — 点「连接测试」确认主机可达</Text>
        )}
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
              {conn.meta.readOnly ? '（只读）' : ''}
            </Text>
            <Text style={styles.muted}>
              今天是 {today}
              {conn.meta.termStart
                ? ` · 第 ${weekIndexOf(today, conn.meta.termStart)} 周` // shared 引擎：学期周次
                : ' · 主机未设学期起点'}
            </Text>
          </View>
        )}
        {conn.kind === 'error' && <Text style={styles.errText}>{conn.message}</Text>}
      </View>

      <View style={styles.btnRow}>
        <Pressable style={styles.btnPrimary} onPress={host ? onReconnect : onSettings}>
          <Text style={styles.btnPrimaryText}>
            {conn.kind === 'ok' ? '重新连接' : host ? '连接测试' : '去设置主机'}
          </Text>
        </Pressable>
        <Pressable style={styles.btnGhost} onPress={onSettings}>
          <Text style={styles.btnGhostText}>主机设置</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>复用 shared 规则引擎 · AsyncStorage 持久化</Text>
    </View>
  );
}

function Settings(props: {
  input: string;
  onChangeInput: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { input, onChangeInput, onCancel, onSave } = props;
  return (
    <View style={styles.inner}>
      <Text style={styles.h1}>主机设置</Text>
      <Text style={styles.help}>
        填写运行 SchedBuddy 的电脑在局域网中的地址（桌面/网页端页脚可查看）。
        端口默认 {DEFAULT_PORT}，可省略。
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
        onSubmitEditing={onSave}
      />
      <View style={styles.btnRow}>
        <Pressable style={styles.btnPrimary} onPress={onSave}>
          <Text style={styles.btnPrimaryText}>保存并连接</Text>
        </Pressable>
        <Pressable style={styles.btnGhost} onPress={onCancel}>
          <Text style={styles.btnGhostText}>取消</Text>
        </Pressable>
      </View>
      <Text style={styles.footer}>本机调试可填 127.0.0.1:3876（仅模拟器可用）</Text>
    </View>
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
  brand: { alignItems: 'center', marginBottom: 28 },
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
  footer: { position: 'absolute', bottom: 28, fontSize: 11, color: '#9DB3A4' },
});
