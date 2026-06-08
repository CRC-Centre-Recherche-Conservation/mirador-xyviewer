/**
 * Tests for the ManifestBody component (Pattern B).
 *
 * Covers the valid-URL path (renders an accessible button that dispatches the
 * addWindow action on click) and the invalid-URL path (renders a warning Alert,
 * no button). Uses fireEvent (user-event is not a devDependency).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ManifestBody } from './ManifestBody';
import type { ManifestBody as ManifestBodyType } from '../types/iiif';

const manifest = (id: string): ManifestBodyType => ({ type: 'Manifest', id });

describe('ManifestBody', () => {
  describe('valid manifest URL', () => {
    it('renders an accessible "View IIIF Manifest" button', () => {
      render(
        <ManifestBody
          body={manifest('https://example.org/manifest.json')}
          dispatch={vi.fn()}
          addWindow={vi.fn()}
        />,
      );
      // The MUI Tooltip sets the button's accessible name to the full manifest URL;
      // the short visible label lives in the button's text content.
      const button = screen.getByRole('button', { name: 'https://example.org/manifest.json' });
      expect(button).toHaveTextContent('View IIIF Manifest');
    });

    it('dispatches the addWindow action with the manifest id on click', () => {
      const dispatch = vi.fn();
      const action = { type: 'mirador/ADD_WINDOW' };
      const addWindow = vi.fn(() => action);

      render(
        <ManifestBody
          body={manifest('https://example.org/manifest.json')}
          dispatch={dispatch}
          addWindow={addWindow}
        />,
      );
      fireEvent.click(screen.getByRole('button'));

      expect(addWindow).toHaveBeenCalledWith({ manifestId: 'https://example.org/manifest.json' });
      expect(dispatch).toHaveBeenCalledWith(action);
    });
  });

  describe('invalid manifest URL', () => {
    it('renders a warning Alert and no button', () => {
      render(
        <ManifestBody body={manifest('ftp://bad/manifest')} dispatch={vi.fn()} addWindow={vi.fn()} />,
      );
      expect(screen.getByRole('alert')).toHaveTextContent(/Invalid manifest URL/i);
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('does not dispatch for an invalid URL', () => {
      const dispatch = vi.fn();
      render(
        <ManifestBody body={manifest('javascript:alert(1)')} dispatch={dispatch} addWindow={vi.fn()} />,
      );
      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
