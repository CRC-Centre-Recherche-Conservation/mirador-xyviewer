import { describe, it, expect, afterEach } from 'vitest';
import {
  configureDatasetAuth,
  getRegisteredAuthHandler,
  getRegisteredCanStartLogin,
} from './datasetAuth';
import type { DatasetBody } from '../types/iiif';

const body: DatasetBody = { type: 'Dataset', id: 'https://x/d.csv', format: 'text/csv' };

afterEach(() => configureDatasetAuth(undefined));

describe('dataset auth registry', () => {
  it('stores and returns the handler; no availability predicate by default', () => {
    const handler = () => {};
    configureDatasetAuth(handler);
    expect(getRegisteredAuthHandler()).toBe(handler);
    expect(getRegisteredCanStartLogin()).toBeUndefined();
  });

  it('stores an optional canStartLogin predicate alongside the handler', () => {
    const handler = () => {};
    const canStartLogin = (b: DatasetBody) => b.id.includes('d.csv');
    configureDatasetAuth(handler, { canStartLogin });
    expect(getRegisteredCanStartLogin()).toBe(canStartLogin);
    expect(getRegisteredCanStartLogin()?.(body)).toBe(true);
  });

  it('clears both handler and predicate when reset with undefined', () => {
    configureDatasetAuth(() => {}, { canStartLogin: () => true });
    configureDatasetAuth(undefined);
    expect(getRegisteredAuthHandler()).toBeUndefined();
    expect(getRegisteredCanStartLogin()).toBeUndefined();
  });
});
