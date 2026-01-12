/**
 * Dataset Cache Service
 * Global cache for fetched and parsed datasets
 */

import type { SpectrumData, CacheEntry } from '../types/dataset';
import { CACHE_TTL } from '../types/dataset';

class DatasetCacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private pendingRequests: Map<string, Promise<SpectrumData>> = new Map();

  /**
   * Get cached data if available and not expired
   */
  get(url: string): SpectrumData | null {
    const entry = this.cache.get(url);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(url);
      return null;
    }

    return entry.data;
  }

  /**
   * Store data in cache
   */
  set(url: string, data: SpectrumData): void {
    const now = Date.now();
    this.cache.set(url, {
      data,
      timestamp: now,
      expiresAt: now + CACHE_TTL,
    });
  }

  /**
   * Check if there's a pending request for this URL
   */
  getPendingRequest(url: string): Promise<SpectrumData> | null {
    return this.pendingRequests.get(url) || null;
  }

  /**
   * Register a pending request
   */
  setPendingRequest(url: string, promise: Promise<SpectrumData>): void {
    this.pendingRequests.set(url, promise);

    // Clean up after request completes
    promise.finally(() => {
      this.pendingRequests.delete(url);
    });
  }

  /**
   * Check if URL is cached (even if expired)
   */
  has(url: string): boolean {
    return this.cache.has(url);
  }

  /**
   * Remove specific entry from cache
   */
  delete(url: string): void {
    this.cache.delete(url);
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; pendingCount: number } {
    return {
      size: this.cache.size,
      pendingCount: this.pendingRequests.size,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [url, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(url);
      }
    }
  }
}

// Singleton instance
export const datasetCache = new DatasetCacheService();

// Periodic cleanup (every 5 minutes)
if (typeof window !== 'undefined') {
  setInterval(() => datasetCache.cleanup(), 5 * 60 * 1000);
}
