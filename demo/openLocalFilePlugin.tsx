/**
 * Demo-only: "Open local file" inside Mirador's own UI — an icon in the workspace
 * rail and a labelled button in the "Add resource" drawer. NOT part of the published plugin.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ComponentType, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AnyAction, Dispatch } from 'redux';
import { MiradorMenuButton, setWorkspaceAddVisibility, useTranslation } from 'mirador';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import UploadFileSharp from '@mui/icons-material/UploadFileSharp';
import { createContentStateOpener, openFileInto, subscribeNotices } from './contentStateInputs';
import type { NoticeSeverity } from './contentStateInputs';

// Demo-only typings for the Mirador exports used here.
declare module 'mirador' {
  // Rail icon button (IconButton + Tooltip titled by its aria-label)
  export const MiradorMenuButton: import('react').ComponentType<{
    'aria-label': string;
    children?: import('react').ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }>;

  // react-i18next hook
  export function useTranslation(): { t: (key: string) => string };

  // Show or hide the "Add resource" panel
  export function setWorkspaceAddVisibility(visible: boolean): import('redux').AnyAction;
}

const ACCEPT = '.json,.jsonld,application/json,application/ld+json';

/** Move keyboard focus to the newest window once the Add panel is gone. */
function focusNewestWindow(): void {
  requestAnimationFrame(() => {
    const wins = document.querySelectorAll<HTMLElement>('section.mirador-window');
    const win = wins[wins.length - 1];
    if (!win) return;
    if (!win.hasAttribute('tabindex')) win.tabIndex = -1;
    win.focus({ preventScroll: true });
  });
}

/** Open a picked file; on success leave the Add panel so the new window is visible. */
async function openLocalFile(dispatch: Dispatch<AnyAction>, file: File): Promise<boolean> {
  const opened = await openFileInto(createContentStateOpener({ dispatch }), file);
  if (opened) {
    dispatch(setWorkspaceAddVisibility(false));
    focusNewestWindow();
  }
  return opened;
}

/** Hidden file input plus a `pick` trigger; the value is reset so the same file can be re-picked. */
function useLocalFilePicker(onFile: (file: File) => unknown) {
  const ref = useRef<HTMLInputElement>(null);
  const pick = useCallback(() => ref.current?.click(), []);
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onFile(file);
  };
  const inputEl = <input ref={ref} type="file" hidden accept={ACCEPT} onChange={onChange} />;
  return { inputEl, pick };
}

/** Latest notice only, top-centre like Mirador's export Snackbar but below the window bars. */
function ContentStateSnackbar(): ReactNode {
  const [notice, setNotice] = useState<{ id: number; message: string; severity: NoticeSeverity } | null>(null);
  const seq = useRef(0);
  useEffect(() => subscribeNotices((message, severity) => setNotice({ id: ++seq.current, message, severity })), []);
  const close = () => setNotice(null);
  // Portaled to <body>: the background plugin area sits under the workspace.
  // The key remounts per notice, restarting the auto-hide timer and the enter transition.
  return createPortal(
    <Snackbar
      key={notice?.id}
      open={!!notice}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      autoHideDuration={8000}
      onClose={(_e, reason) => { if (reason !== 'clickaway') close(); }}
      sx={(theme) => ({ top: theme.spacing(9) })}
    >
      {notice ? (
        <Alert severity={notice.severity} variant="filled" onClose={close} sx={{ maxWidth: 480 }}>
          {notice.message}
        </Alert>
      ) : undefined}
    </Snackbar>,
    document.body
  );
}

interface FileProps { onFile: (file: File) => Promise<boolean> | void }

function OpenLocalFileButton({ onFile }: FileProps) {
  const { t } = useTranslation();
  const { inputEl, pick } = useLocalFilePicker(onFile);
  return (
    <>
      <MiradorMenuButton aria-label={t('openLocalFile')} aria-haspopup="dialog" onClick={pick}>
        <UploadFileSharp />
      </MiradorMenuButton>
      {inputEl}
    </>
  );
}

interface FormProps extends FileProps {
  TargetComponent: ComponentType<Record<string, unknown>>;
  targetProps: Record<string, unknown> & { addResourcesOpen?: boolean; onCancel?: () => void };
}

function ManifestFormWithFile({ TargetComponent, targetProps, onFile }: FormProps) {
  const { t } = useTranslation();
  // Close the form only once the file opened, so a bad file can be retried.
  const { inputEl, pick } = useLocalFilePicker(async (file) => {
    if (await onFile(file)) targetProps.onCancel?.();
  });
  return (
    <>
      <TargetComponent {...targetProps} />
      {targetProps.addResourcesOpen && (
        <>
          <Divider sx={{ my: 2 }}>
            <Typography variant="caption" color="text.secondary">{t('or')}</Typography>
          </Divider>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<UploadFileSharp />}
              onClick={pick}
              sx={{ flexShrink: 0, width: { xs: '100%', sm: 'auto' } }}
            >
              {t('openLocalFile')}
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '60ch' }}>{t('openLocalFileHelp')}</Typography>
          </Stack>
          {inputEl}
        </>
      )}
    </>
  );
}

const mapDispatchToProps = (dispatch: Dispatch<AnyAction>) => ({
  onFile: (file: File) => openLocalFile(dispatch, file),
});

export const openLocalFilePlugins = [
  { target: 'WorkspaceControlPanelButtons', mode: 'add', component: OpenLocalFileButton, mapDispatchToProps },
  { target: 'BackgroundPluginArea', mode: 'add', component: ContentStateSnackbar },
  { target: 'ManifestForm', mode: 'wrap', component: ManifestFormWithFile, mapDispatchToProps },
];
