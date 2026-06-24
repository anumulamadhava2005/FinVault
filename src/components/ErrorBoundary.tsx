import React from 'react';
import { View, ScrollView } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (__DEV__) {
      console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <ScrollView
        contentContainerStyle={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 32,
          backgroundColor: '#181818',
        }}
      >
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={56}
          color="#EF4444"
          style={{ marginBottom: 20 }}
        />
        <Text
          style={{
            fontSize: 20,
            fontWeight: '700',
            color: '#FAFAFA',
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          Something went wrong
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: '#A1A1AA',
            textAlign: 'center',
            marginBottom: 32,
            lineHeight: 20,
          }}
        >
          An unexpected error occurred. Your data is safe — please restart the app.
        </Text>
        {__DEV__ && this.state.error ? (
          <View
            style={{
              backgroundColor: '#1F1F1F',
              borderRadius: 8,
              padding: 12,
              marginBottom: 24,
              width: '100%',
            }}
          >
            <Text style={{ fontSize: 11, color: '#A1A1AA', fontFamily: 'monospace' }}>
              {this.state.error.message}
            </Text>
          </View>
        ) : null}
        <Button
          mode="contained"
          onPress={() => this.setState({ hasError: false, error: null })}
          style={{ borderRadius: 12 }}
        >
          Try Again
        </Button>
      </ScrollView>
    );
  }
}

export default ErrorBoundary;
