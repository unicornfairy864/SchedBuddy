import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

// SchedBuddy · 移动端骨架（v0.4.1 工程骨架占位首屏）
// 后续迭代：接入 @schedbuddy/shared 引擎 → 主机地址配置 → 只读周/日视图 → PIN 配对。
export default function App() {
  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Text style={styles.logo}>SchedBuddy</Text>
        <Text style={styles.sub}>大学生时间管理 · v0.4</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.step}>0.4.1 · 工程骨架</Text>
        <Text style={styles.note}>app/mobile workspace 已接入 npm workspaces</Text>
        <Text style={styles.note}>下一迭代：复用 shared 规则引擎 + 主机地址配置</Text>
      </View>

      <Text style={styles.footer}>React Native + TypeScript · Expo SDK 57</Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: 40,
    fontWeight: '700',
    color: '#14532D',
    letterSpacing: 0.5,
  },
  sub: {
    marginTop: 6,
    fontSize: 15,
    color: '#4B7B5C',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DCE9DF',
  },
  step: {
    fontSize: 16,
    fontWeight: '600',
    color: '#14532D',
    marginBottom: 8,
  },
  note: {
    fontSize: 13,
    color: '#5B6B60',
    lineHeight: 20,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    fontSize: 11,
    color: '#9DB3A4',
  },
});
