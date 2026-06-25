import React from 'react';
import { View, ScrollView, Linking } from 'react-native';
import { Text, Divider, useTheme, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { palette } from '../theme';

const APP_VERSION = '1.0.0';
const BUILD_DATE = 'June 2026';
const CREATOR = 'Team FinVault — Accenture Innovation Cohort';

const TEAM_MEMBERS = [
  { name: 'Anumula Madhava', email: 'anumula.madhava@accenture.com', role: 'Lead Developer' },
  { name: 'R D Shri Harie Vignesh', email: 'r.d.shri.h.vignesh@accenture.com', role: 'Developer' },
  { name: 'Bandi V. Shreyank', email: 'bandi.v.shreyank@accenture.com', role: 'Developer' },
  { name: 'Raut Yash K.', email: 'yash.k.raut@accenture.com', role: 'Developer' },
  { name: 'Sharon David', email: 'sharon.a.david@accenture.com', role: 'Developer' },
];

const VALUE_PROPS = [
  {
    icon: 'shield-lock',
    title: 'Privacy-First',
    desc: '100% offline. All your wealth data stays on your device — never on any server.',
  },
  {
    icon: 'chart-timeline-variant',
    title: 'Complete Wealth Picture',
    desc: 'Track assets, loans, expenses, goals, insurance, and retirement — all in one place.',
  },
  {
    icon: 'brain',
    title: 'AI-Powered Insights',
    desc: 'Portfolio health scores, hold/exit calls, news-impact analysis, and spending patterns.',
  },
  {
    icon: 'bell-ring',
    title: 'Proactive Alerts',
    desc: 'SIP reminders, loan due-date nudges, and goal-progress notifications so nothing slips.',
  },
];

const FEATURES = [
  { feature: 'Asset Portfolio Tracker', benefit: 'Know your net worth in real time — equities, gold, FDs, real estate, MFs, PPF.' },
  { feature: 'OCR Bill Scanner', benefit: 'Scan receipts to log expenses instantly — no manual entry.' },
  { feature: 'Secure Vault', benefit: 'Store credentials and sensitive docs with biometric lock — zero cloud exposure.' },
  { feature: 'Wealth Feed', benefit: 'Personalised market news with direct portfolio-impact scoring.' },
  { feature: 'Retirement Calculator', benefit: 'Know exactly how much to save today to retire on your own terms.' },
  { feature: 'Goals Engine', benefit: 'Visual milestones and auto-projection so dreams become plans.' },
  { feature: 'Insurance Manager', benefit: 'Never miss a premium — all policies tracked with renewal alerts.' },
  { feature: 'SIP Automation', benefit: 'Schedule and track SIP contributions with smart reminders.' },
  { feature: 'PDF Reports', benefit: 'Generate shareable, printable portfolio reports on demand.' },
  { feature: 'Multi-Profile Support', benefit: 'Manage finances for the whole family — each profile fully isolated.' },
];

const ARCH_LAYERS = [
  {
    label: 'UI Layer',
    color: '#4A7C6F',
    items: ['React Native 0.85', 'Expo Router v56', 'React Native Paper (MD3)', 'Reanimated 4'],
  },
  {
    label: 'State & Logic',
    color: '#316357',
    items: ['Zustand Store', 'Custom Hooks', 'Context API', 'Portfolio Intelligence Service'],
  },
  {
    label: 'Data Layer',
    color: '#2A4A40',
    items: ['Expo SQLite (local)', 'Encrypted Vault (expo-crypto)', 'AsyncStorage (prefs)', 'PDF-lib (reports)'],
  },
  {
    label: 'Platform & Device',
    color: '#1A2E28',
    items: ['Biometric Auth', 'Camera / OCR', 'Push Notifications', 'File System & Sharing'],
  },
];

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: 24 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 1.4,
          color: theme.colors.primary,
          opacity: 0.7,
          marginBottom: 12,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
};

const Card: React.FC<{ children: React.ReactNode; style?: object }> = ({ children, style }) => {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.roundness,
          borderWidth: 1,
          borderColor: theme.colors.outline,
          padding: 16,
          marginBottom: 10,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const AboutScreen: React.FC = () => {
  const theme = useTheme();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
    >
      {/* ── Hero ─────────────────────────────────────────────── */}
      <View
        style={{
          alignItems: 'center',
          paddingVertical: 32,
          marginBottom: 28,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.roundness,
          borderWidth: 1,
          borderColor: theme.colors.outline,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: theme.colors.primaryContainer,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 16,
            borderWidth: 1.5,
            borderColor: theme.colors.primary,
          }}
        >
          <MaterialCommunityIcons name="wallet-outline" size={38} color={theme.colors.primary} />
        </View>

        <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -0.5 }}>
          FinVault
        </Text>
        <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center', paddingHorizontal: 24 }}>
          Your private, offline-first wealth command centre
        </Text>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <Chip compact icon="tag-outline" style={{ backgroundColor: theme.colors.primaryContainer }}>
            v{APP_VERSION}
          </Chip>
          <Chip compact icon="calendar-outline" style={{ backgroundColor: theme.colors.primaryContainer }}>
            {BUILD_DATE}
          </Chip>
        </View>
      </View>

      {/* ── Value Proposition ────────────────────────────────── */}
      <Section title="What is FinVault?">
        <Card>
          <Text style={{ fontSize: 15, lineHeight: 23, color: theme.colors.onSurface }}>
            FinVault is a <Text style={{ fontWeight: '700' }}>privacy-first personal wealth manager</Text> built for
            individuals who want complete visibility over their financial life — without trusting any cloud service with
            their data.
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 23, color: theme.colors.onSurface, marginTop: 10 }}>
            From tracking multi-asset portfolios and scanning expense bills with OCR, to retirement planning and
            insurance management — FinVault is the single source of truth for your money, running entirely on your
            device.
          </Text>
        </Card>
      </Section>

      {/* ── Who it's for ─────────────────────────────────────── */}
      <Section title="Who Is It For?">
        {[
          { icon: 'account-tie', label: 'Working Professionals', desc: 'Managing salaries, SIPs, loans, and growing investment portfolios.' },
          { icon: 'home-heart', label: 'Families', desc: 'Multi-profile support to track finances across family members privately.' },
          { icon: 'sprout', label: 'First-Time Investors', desc: 'Simple goal-setting and guided portfolio insights to start investing with confidence.' },
          { icon: 'shield-account', label: 'Privacy-Conscious Users', desc: 'Zero cloud, zero account required — data never leaves the device.' },
        ].map((item) => (
          <Card key={item.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: theme.colors.primaryContainer,
                justifyContent: 'center',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <MaterialCommunityIcons name={item.icon as any} size={20} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', fontSize: 14, color: theme.colors.onSurface }}>{item.label}</Text>
              <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, marginTop: 2, lineHeight: 19 }}>{item.desc}</Text>
            </View>
          </Card>
        ))}
      </Section>

      {/* ── Key Value Props ──────────────────────────────────── */}
      <Section title="Core Value Pillars">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {VALUE_PROPS.map((vp) => (
            <View
              key={vp.title}
              style={{
                width: '47.5%',
                backgroundColor: theme.colors.surface,
                borderRadius: theme.roundness,
                borderWidth: 1,
                borderColor: theme.colors.outline,
                padding: 14,
              }}
            >
              <MaterialCommunityIcons name={vp.icon as any} size={24} color={palette.good} style={{ marginBottom: 8 }} />
              <Text style={{ fontWeight: '700', fontSize: 13, color: theme.colors.onSurface, marginBottom: 4 }}>{vp.title}</Text>
              <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, lineHeight: 17 }}>{vp.desc}</Text>
            </View>
          ))}
        </View>
      </Section>

      {/* ── Feature → Benefit Map ────────────────────────────── */}
      <Section title="Features & Customer Benefits">
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {FEATURES.map((item, i) => (
            <View key={item.feature}>
              <View style={{ flexDirection: 'row', padding: 14, gap: 10, alignItems: 'flex-start' }}>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={16}
                  color={palette.good}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 13, color: theme.colors.onSurface }}>{item.feature}</Text>
                  <Text style={{ fontSize: 12.5, color: theme.colors.onSurfaceVariant, marginTop: 2, lineHeight: 18 }}>
                    {item.benefit}
                  </Text>
                </View>
              </View>
              {i < FEATURES.length - 1 && <Divider style={{ opacity: 0.4 }} />}
            </View>
          ))}
        </Card>
      </Section>

      {/* ── Technical Architecture ───────────────────────────── */}
      <Section title="Technical Architecture">
        <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, marginBottom: 12, lineHeight: 19 }}>
          FinVault is built on a fully offline, on-device architecture. Every layer from UI to storage runs locally —
          no network calls, no user accounts, no third-party telemetry.
        </Text>

        {ARCH_LAYERS.map((layer, idx) => (
          <View
            key={layer.label}
            style={{
              borderRadius: idx === 0 ? theme.roundness : 0,
              borderTopLeftRadius: idx === 0 ? theme.roundness : 0,
              borderTopRightRadius: idx === 0 ? theme.roundness : 0,
              borderBottomLeftRadius: idx === ARCH_LAYERS.length - 1 ? theme.roundness : 0,
              borderBottomRightRadius: idx === ARCH_LAYERS.length - 1 ? theme.roundness : 0,
              backgroundColor: layer.color,
              padding: 14,
              borderBottomWidth: idx < ARCH_LAYERS.length - 1 ? 1 : 0,
              borderColor: 'rgba(255,255,255,0.12)',
            }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>
              {layer.label.toUpperCase()}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {layer.items.map((item) => (
                <View
                  key={item}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 20,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.2)',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '600' }}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Data flow arrows */}
        <View style={{ alignItems: 'center', marginTop: 10, gap: 2 }}>
          <MaterialCommunityIcons name="arrow-up-down" size={20} color={theme.colors.onSurfaceVariant} />
          <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant }}>All data flows stay on-device</Text>
        </View>
      </Section>

      {/* ── Tech Stack Summary ───────────────────────────────── */}
      <Section title="Tech Stack">
        {[
          { label: 'Framework', value: 'React Native 0.85 + Expo SDK 56' },
          { label: 'Navigation', value: 'Expo Router v56 (file-based)' },
          { label: 'UI Library', value: 'React Native Paper (Material Design 3)' },
          { label: 'Database', value: 'Expo SQLite — fully on-device' },
          { label: 'Security', value: 'expo-crypto AES encryption + biometric auth' },
          { label: 'State Management', value: 'Zustand + React Context' },
          { label: 'Animations', value: 'Reanimated 4 + React Native Animated' },
          { label: 'Charts', value: 'react-native-chart-kit + react-native-svg' },
          { label: 'OCR', value: '@dariyd/react-native-text-recognition' },
          { label: 'Reports', value: 'pdf-lib + expo-print + expo-sharing' },
        ].map((row, i, arr) => (
          <View key={row.label}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 10,
                paddingHorizontal: 14,
                backgroundColor: i % 2 === 0 ? theme.colors.surface : theme.colors.surfaceVariant + '60',
                borderTopLeftRadius: i === 0 ? theme.roundness : 0,
                borderTopRightRadius: i === 0 ? theme.roundness : 0,
                borderBottomLeftRadius: i === arr.length - 1 ? theme.roundness : 0,
                borderBottomRightRadius: i === arr.length - 1 ? theme.roundness : 0,
                borderWidth: 1,
                borderColor: theme.colors.outline,
                borderTopWidth: i === 0 ? 1 : 0,
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: theme.colors.onSurfaceVariant, width: 120 }}>
                {row.label}
              </Text>
              <Text style={{ fontSize: 12.5, color: theme.colors.onSurface, flex: 1, textAlign: 'right' }}>
                {row.value}
              </Text>
            </View>
          </View>
        ))}
      </Section>

      {/* ── Creator / Team ───────────────────────────────────── */}
      <Section title="Created By">
        <Card style={{ alignItems: 'center', paddingVertical: 20, marginBottom: 10 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: theme.colors.primaryContainer,
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <MaterialCommunityIcons name="account-group" size={28} color={theme.colors.primary} />
          </View>
          <Text style={{ fontWeight: '700', fontSize: 15, color: theme.colors.onSurface, textAlign: 'center' }}>
            {CREATOR}
          </Text>
          <Text style={{ fontSize: 12.5, color: theme.colors.onSurfaceVariant, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
            Built as part of the Accenture internal fintech innovation programme.{'\n'}
            Designed, developed, and iterated with a focus on real-world financial literacy.
          </Text>
        </Card>

        {TEAM_MEMBERS.map((member, i) => (
          <Card
            key={member.email}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              paddingVertical: 12,
              marginBottom: i < TEAM_MEMBERS.length - 1 ? 8 : 0,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: theme.colors.primaryContainer,
                justifyContent: 'center',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <Text style={{ fontWeight: '800', fontSize: 14, color: theme.colors.onPrimaryContainer }}>
                {member.name.charAt(0)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', fontSize: 13.5, color: theme.colors.onSurface }}>
                {member.name}
              </Text>
              <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 1 }}>
                {member.email}
              </Text>
            </View>
          </Card>
        ))}
      </Section>

      {/* ── App Info ─────────────────────────────────────────── */}
      <Section title="App Information">
        {[
          { icon: 'tag', label: 'Version', value: `v${APP_VERSION}` },
          { icon: 'calendar', label: 'Release', value: BUILD_DATE },
          { icon: 'database', label: 'Storage', value: 'Local SQLite — on-device only' },
          { icon: 'cloud-off-outline', label: 'Cloud', value: 'None — fully offline' },
          { icon: 'shield-lock', label: 'Encryption', value: 'AES-256 for vault data' },
          { icon: 'cellphone', label: 'Platform', value: 'Android & iOS (Expo Go / Dev Build)' },
        ].map((item) => (
          <Card key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 }}>
            <MaterialCommunityIcons name={item.icon as any} size={20} color={theme.colors.onSurfaceVariant} />
            <Text style={{ fontWeight: '600', fontSize: 13, color: theme.colors.onSurfaceVariant, width: 90 }}>
              {item.label}
            </Text>
            <Text style={{ fontSize: 13, color: theme.colors.onSurface, flex: 1 }}>{item.value}</Text>
          </Card>
        ))}
      </Section>
    </ScrollView>
  );
};

export default AboutScreen;
