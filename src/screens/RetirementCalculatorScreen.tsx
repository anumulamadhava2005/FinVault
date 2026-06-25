/**
 * Interactive retirement calculator. Prefills current corpus + monthly SIP from
 * the live portfolio, then shows required corpus, projected savings and the gap.
 */
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';

import { Screen, SectionCard, Kpi, Row, ProgressBar } from '../components/ui';
import ThemeToggle from '../components/ThemeToggle';
import { useApp } from '../context/AppContext';
import { first } from '../db';
import { netWorth, financialHealth, portfolioSummary } from '../services/finance';
import { retirementPlan } from '../services/portfolioIntelligence';
import { palette } from '../theme';

const rs = (rupees: number): string => {
  const abs = Math.abs(rupees);
  if (abs >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`;
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`;
};

const RetirementCalculatorScreen: React.FC = () => {
  const { userId } = useApp();
  const theme = useTheme();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <View style={{ marginRight: 4 }}><ThemeToggle color={theme.colors.onSurface} /></View>,
    });
  }, [navigation, theme]);

  // Prefill from live data (once).
  const prefill = useMemo(() => {
    const corpusPaise = netWorth(userId!).total_assets;
    const fh = financialHealth(userId!);
    const sipPaise = portfolioSummary(userId!).monthly_sip;
    const monthlyExpense = fh.monthly_expenses ? Math.round(fh.monthly_expenses / 100) : 50000;

    // Derive age from stored DOB, fall back to 30.
    let age = 30;
    const userRow = first<{ date_of_birth: string | null }>(
      'SELECT date_of_birth FROM users WHERE id = ?',
      [userId!],
    );
    if (userRow?.date_of_birth) {
      const born = new Date(userRow.date_of_birth);
      const today = new Date();
      age = today.getFullYear() - born.getFullYear();
      if (
        today.getMonth() < born.getMonth() ||
        (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())
      ) age -= 1;
      age = Math.max(1, Math.min(age, 100));
    }

    return {
      currentCorpus: Math.round(corpusPaise / 100),
      monthlySip: Math.round(sipPaise / 100),
      monthlyExpense,
      age,
    };
  }, [userId]);

  const [currentAge, setCurrentAge] = useState(String(prefill.age));
  const [retireAge, setRetireAge] = useState('60');
  const [lifeExpectancy, setLifeExpectancy] = useState('85');
  const [monthlyExpense, setMonthlyExpense] = useState(String(prefill.monthlyExpense));
  const [inflation, setInflation] = useState('6');
  const [expectedReturn, setExpectedReturn] = useState('11');
  const [postReturn, setPostReturn] = useState('7');
  const [currentCorpus, setCurrentCorpus] = useState(String(prefill.currentCorpus));
  const [monthlySip, setMonthlySip] = useState(String(prefill.monthlySip));

  const num = (s: string) => {
    const n = parseFloat(s.replace(/,/g, ''));
    return isFinite(n) ? n : 0;
  };

  const plan = useMemo(
    () =>
      retirementPlan({
        currentAge: num(currentAge),
        retireAge: num(retireAge),
        lifeExpectancy: num(lifeExpectancy),
        monthlyExpense: num(monthlyExpense),
        inflationPct: num(inflation),
        expectedReturnPct: num(expectedReturn),
        postReturnPct: num(postReturn),
        currentCorpus: num(currentCorpus),
        monthlySip: num(monthlySip),
      }),
    [currentAge, retireAge, lifeExpectancy, monthlyExpense, inflation, expectedReturn, postReturn, currentCorpus, monthlySip],
  );

  const validationError = useMemo(() => {
    const ca = num(currentAge);
    const ra = num(retireAge);
    const le = num(lifeExpectancy);
    const me = num(monthlyExpense);
    const inf = num(inflation);
    const er = num(expectedReturn);

    if (!ca || ca < 1 || ca > 100) return 'Current age must be between 1 and 100';
    if (!ra || ra <= ca) return 'Retirement age must be greater than current age';
    if (!le || le <= ra) return 'Life expectancy must be greater than retirement age';
    if (me <= 0) return 'Monthly expense must be greater than 0';
    if (inf < 0 || inf > 30) return 'Inflation must be between 0% and 30%';
    if (er < 0 || er > 50) return 'Expected return must be between 0% and 50%';
    return null;
  }, [currentAge, retireAge, lifeExpectancy, monthlyExpense, inflation, expectedReturn]);

  const field = (label: string, value: string, setter: (v: string) => void, suffix?: string) => (
    <TextInput
      label={label}
      value={value}
      onChangeText={setter}
      keyboardType="numeric"
      mode="outlined"
      dense
      right={suffix ? <TextInput.Affix text={suffix} /> : undefined}
      style={{ marginBottom: 10, backgroundColor: theme.colors.surface }}
    />
  );

  const cover = Math.min(plan.coverPct, 100);
  const coverColor = plan.onTrack ? palette.good : plan.coverPct >= 60 ? palette.warn : palette.danger;

  return (
    <Screen>
      {/* Result hero */}
      {validationError ? (
        <View style={{ backgroundColor: theme.colors.errorContainer, borderRadius: theme.roundness, padding: 14, marginVertical: 8 }}>
          <Text style={{ color: theme.colors.onErrorContainer, fontWeight: '600' }}>{validationError}</Text>
        </View>
      ) : (
        <SectionCard style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <MaterialCommunityIcons
              name={plan.onTrack ? 'check-decagram' : 'alert-decagram'}
              size={40}
              color={coverColor}
            />
            <View style={{ flex: 1 }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700' }}>RETIREMENT READINESS</Text>
              <Text variant="headlineSmall" style={{ fontWeight: '800', color: coverColor }}>
                {plan.onTrack ? 'On Track 🎉' : `${plan.coverPct}% Funded`}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: 14 }}>
            <ProgressBar pct={cover} color={coverColor} height={10} />
          </View>
          <Row style={{ marginTop: 16 }}>
            <Kpi flex label="Corpus Needed" value={rs(plan.requiredCorpus)} sub={`at age ${num(retireAge)}`} />
            <Kpi flex label="Projected" value={rs(plan.projectedCorpus)} subTone={plan.onTrack ? 'good' : 'muted'} />
          </Row>
          <Row style={{ marginTop: 10 }}>
            {plan.onTrack ? (
              <Kpi flex label="Surplus" value={rs(Math.abs(plan.gap))} subTone="good" />
            ) : (
              <Kpi flex label="Shortfall" value={rs(plan.gap)} subTone="bad" />
            )}
            <Kpi
              flex
              label="Extra SIP Needed"
              value={plan.additionalSip > 0 ? `${rs(plan.additionalSip)}/mo` : '—'}
              subTone={plan.additionalSip > 0 ? 'bad' : 'good'}
            />
          </Row>
          {!plan.onTrack && plan.additionalSip > 0 && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
              Investing an extra {rs(plan.additionalSip)}/month (on top of your current {rs(num(monthlySip))}/month) at {num(expectedReturn)}% should close the gap by age {num(retireAge)}.
            </Text>
          )}
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
            At retirement your {rs(num(monthlyExpense))}/mo lifestyle becomes ≈ {rs(plan.futureMonthlyExpense)}/mo after {num(inflation)}% inflation over {plan.years} years.
          </Text>
        </SectionCard>
      )}

      {/* Inputs */}
      <SectionCard title="Your Details">
        <Row gap={10}>
          <View style={{ flex: 1 }}>{field('Current age', currentAge, setCurrentAge)}</View>
          <View style={{ flex: 1 }}>{field('Retire at', retireAge, setRetireAge)}</View>
          <View style={{ flex: 1 }}>{field('Live until', lifeExpectancy, setLifeExpectancy)}</View>
        </Row>
        {field('Current monthly expense', monthlyExpense, setMonthlyExpense, '₹')}
        {field('Current investments (corpus)', currentCorpus, setCurrentCorpus, '₹')}
        {field('Current monthly SIP', monthlySip, setMonthlySip, '₹')}
      </SectionCard>

      <SectionCard title="Assumptions">
        <Row gap={10}>
          <View style={{ flex: 1 }}>{field('Inflation', inflation, setInflation, '%')}</View>
          <View style={{ flex: 1 }}>{field('Return (pre)', expectedReturn, setExpectedReturn, '%')}</View>
          <View style={{ flex: 1 }}>{field('Return (post)', postReturn, setPostReturn, '%')}</View>
        </Row>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Pre = expected return while still investing; Post = expected return after retirement (usually lower / safer).
        </Text>
      </SectionCard>

      <View style={{ height: 24 }} />
    </Screen>
  );
};

const styles = StyleSheet.create({});

export default RetirementCalculatorScreen;
