import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { SpectrumData } from '../types/dataset';

// We need to mock the module before importing to avoid the setInterval
vi.mock('../types/dataset', () => ({
  CACHE_TTL: 60000, // 1 minute for testing
}));

describe('datasetCache', () => {
  let datasetCache: typeof import('./datasetCache').datasetCache;

  const mockSpectrumData: SpectrumData = {
    id: 'test-id',
    label: 'Test Spectrum',
    xValues: [1, 2, 3],
    xLabel: 'wavelength',
    series: [{ label: 'intensity', yValues: [10, 20, 30] }],
    mimeType: 'text/csv',
    points: [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 30 }],
    yLabel: 'intensity',
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    // Reset the module to get a fresh cache instance
    vi.resetModules();
    const module = await import('./datasetCache');
    datasetCache = module.datasetCache;
    datasetCache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get/set', () => {
    it('should store and retrieve data', () => {
      datasetCache.set('http://example.com/data.csv', mockSpectrumData);
      const result = datasetCache.get('http://example.com/data.csv');
      expect(result).toEqual(mockSpectrumData);
    });

    it('should return null for non-existent key', () => {
      expect(datasetCache.get('http://nonexistent.com')).toBeNull();
    });

    it('should return null for expired data', () => {
      datasetCache.set('http://example.com/data.csv', mockSpectrumData);

      // Advance time past cache TTL (60 seconds + 1ms)
      vi.advanceTimersByTime(60001);

      expect(datasetCache.get('http://example.com/data.csv')).toBeNull();
    });

    it('should return data before expiration', () => {
      datasetCache.set('http://example.com/data.csv', mockSpectrumData);

      // Advance time but stay within TTL
      vi.advanceTimersByTime(30000);

      expect(datasetCache.get('http://example.com/data.csv')).toEqual(mockSpectrumData);
    });
  });

  describe('has', () => {
    it('should return true for cached data', () => {
      datasetCache.set('http://example.com/data.csv', mockSpectrumData);
      expect(datasetCache.has('http://example.com/data.csv')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(datasetCache.has('http://nonexistent.com')).toBe(false);
    });

    it('should return true even for expired data (has checks existence, not validity)', () => {
      datasetCache.set('http://example.com/data.csv', mockSpectrumData);
      vi.advanceTimersByTime(60001);
      // Note: has() checks existence, not expiration
      expect(datasetCache.has('http://example.com/data.csv')).toBe(true);
    });
  });

  describe('delete', () => {
    it('should remove data from cache', () => {
      datasetCache.set('http://example.com/data.csv', mockSpectrumData);
      datasetCache.delete('http://example.com/data.csv');
      expect(datasetCache.get('http://example.com/data.csv')).toBeNull();
    });

    it('should not throw when deleting non-existent key', () => {
      expect(() => datasetCache.delete('http://nonexistent.com')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all cached data', () => {
      datasetCache.set('http://example.com/data1.csv', mockSpectrumData);
      datasetCache.set('http://example.com/data2.csv', mockSpectrumData);

      datasetCache.clear();

      expect(datasetCache.get('http://example.com/data1.csv')).toBeNull();
      expect(datasetCache.get('http://example.com/data2.csv')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      expect(datasetCache.getStats()).toEqual({ size: 0, pendingCount: 0 });

      datasetCache.set('http://example.com/data1.csv', mockSpectrumData);
      datasetCache.set('http://example.com/data2.csv', mockSpectrumData);

      expect(datasetCache.getStats()).toEqual({ size: 2, pendingCount: 0 });
    });
  });

  describe('pending requests', () => {
    it('should store and retrieve pending requests', async () => {
      const promise = Promise.resolve(mockSpectrumData);
      datasetCache.setPendingRequest('http://example.com/data.csv', promise);

      expect(datasetCache.getPendingRequest('http://example.com/data.csv')).toBe(promise);
    });

    it('should return null for non-existent pending request', () => {
      expect(datasetCache.getPendingRequest('http://nonexistent.com')).toBeNull();
    });

    it('should clean up pending request after completion', async () => {
      vi.useRealTimers(); // Use real timers for this async test

      let resolvePromise: (data: SpectrumData) => void;
      const promise = new Promise<SpectrumData>((resolve) => {
        resolvePromise = resolve;
      });

      datasetCache.setPendingRequest('http://example.com/data.csv', promise);
      expect(datasetCache.getPendingRequest('http://example.com/data.csv')).toBe(promise);

      // Resolve the promise
      resolvePromise!(mockSpectrumData);
      await promise;

      // Wait for finally block to execute
      await new Promise((r) => setTimeout(r, 10));

      expect(datasetCache.getPendingRequest('http://example.com/data.csv')).toBeNull();

      vi.useFakeTimers(); // Restore fake timers
    });

    it('should track pending count in stats', () => {
      const promise1 = new Promise<SpectrumData>(() => {});
      const promise2 = new Promise<SpectrumData>(() => {});

      datasetCache.setPendingRequest('http://example.com/data1.csv', promise1);
      datasetCache.setPendingRequest('http://example.com/data2.csv', promise2);

      expect(datasetCache.getStats().pendingCount).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('should remove only expired entries', () => {
      datasetCache.set('http://example.com/data1.csv', mockSpectrumData);

      // Advance time past TTL
      vi.advanceTimersByTime(60001);

      datasetCache.set('http://example.com/data2.csv', mockSpectrumData);

      datasetCache.cleanup();

      expect(datasetCache.has('http://example.com/data1.csv')).toBe(false);
      expect(datasetCache.has('http://example.com/data2.csv')).toBe(true);
    });
  });
});
