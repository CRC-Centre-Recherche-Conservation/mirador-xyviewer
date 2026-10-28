/**
 * ErrorBoundary
 * Contains a rendering error to its subtree so one malformed annotation cannot
 * unmount the whole viewer. Resets when `resetKey` changes.
 */

import React from 'react';
import { Typography } from '@mui/material';

/** Default notice shown in place of an annotation or body that failed to render. */
export const DEFAULT_ERROR_NOTICE = 'This annotation could not be displayed.';

export interface ErrorBoundaryProps {
  children?: React.ReactNode;
  /** Rendered after an error (default: nothing). */
  fallback?: React.ReactNode;
  /** Clears the error state whenever this value changes (e.g. windowId, canvasId, annotation id). */
  resetKey?: unknown;
  /** Short context for the log line (no producer data). */
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Logs a contained error with its name only (the message may echo producer data). */
export function logContainedError(error: unknown, label?: string): void {
  const name = error instanceof Error ? error.name : typeof error;
  console.error(`[mirador-xyviewer] Rendering error contained${label ? ` in ${label}` : ''} (${name})`);
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    logContainedError(error, this.props.label);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && !Object.is(prevProps.resetKey, this.props.resetKey)) {
      this.setState({ hasError: false });
    }
  }

  render(): React.ReactNode {
    return this.state.hasError ? (this.props.fallback ?? null) : this.props.children;
  }
}

/** Unobtrusive inline notice used as a fallback for a failed annotation or body. */
export const ErrorNotice: React.FC<{ message?: string }> = ({ message = DEFAULT_ERROR_NOTICE }) => (
  <Typography variant="caption" role="note" color="text.secondary" sx={{ display: 'block', py: 0.5 }}>
    {message}
  </Typography>
);

export default ErrorBoundary;
