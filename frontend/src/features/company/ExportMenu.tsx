import { Checkbox, Popover } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { createExport, downloadExport, type ExportSection } from '../../api/endpoints';
import { useExportStatus } from '../../api/hooks';
import { todayIso } from './limitsView';
import classes from './ExportMenu.module.css';

const SECTIONS: { id: ExportSection; label: string }[] = [
  { id: 'info', label: 'Общая информация' },
  { id: 'limits', label: 'Лимиты' },
  { id: 'applications', label: 'Лимиты на рассмотрении' },
  { id: 'reserves', label: 'Резервы' },
];

const TAB_SECTION: Record<string, ExportSection> = {
  'Общая информация': 'info',
  Лимиты: 'limits',
  'Лимиты на рассмотрении': 'applications',
  Резервы: 'reserves',
};

const downloads = new Set<string>();

export function clearExportDownloads() {
  downloads.clear();
}

export function ExportMenu({
  inn,
  tab,
  asOf,
  showClosed,
}: {
  inn: string;
  tab: string;
  asOf: string;
  showClosed: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [selected, setSelected] = useState<Set<ExportSection>>(() => new Set());
  const [exportId, setExportId] = useState('');
  const [localError, setLocalError] = useState(false);
  const [manual, setManual] = useState(false);
  const job = useExportStatus(exportId);
  const payload = useCallback(() => ({
    sections: SECTIONS.filter((item) => selected.has(item.id)).map((item) => item.id),
    filters: { as_of: asOf, today: todayIso(), show_closed: showClosed },
  }), [asOf, selected, showClosed]);

  const start = useMutation({
    mutationFn: () => createExport(inn, payload()),
    retry: false,
    onMutate: () => setLocalError(false),
    onSuccess: (created) => {
      setLocalError(false);
      setManual(false);
      setOpened(false);
      setExportId(created.export_id);
    },
    onError: () => {
      setOpened(false);
      setLocalError(true);
    },
  });

  const reset = useCallback(() => {
    setExportId('');
    setLocalError(false);
    setManual(false);
  }, []);

  useEffect(() => {
    if (!exportId || job.data?.status !== 'ready' || downloads.has(exportId)) return;
    downloads.add(exportId);
    let resetTimer = 0;
    downloadExport(exportId)
      .then(() => {
        resetTimer = window.setTimeout(reset, 1400);
      })
      .catch(() => {
        downloads.delete(exportId);
        setManual(true);
      });
    return () => window.clearTimeout(resetTimer);
  }, [exportId, job.data?.status, reset]);

  const status = job.data?.status;
  const failed = !start.isPending && (localError || status === 'failed' || (Boolean(exportId) && job.isError));
  const active = start.isPending || (Boolean(exportId) && !failed && status !== 'ready');
  const ready = status === 'ready' && !failed;

  if (active || failed || ready) {
    const progress = job.data?.progress ?? 0;
    return (
      <div className={classes.progress} role="status" aria-live="polite">
        <p>{failed ? 'Не удалось сформировать файл' : ready ? '✓ Файл готов' : `Формируем Excel · ${progress}%`}</p>
        {active ? <p className={classes.stage}>{job.data?.stage || 'Подготавливаем данные'}</p> : null}
        <div className={classes.track} aria-hidden="true">
          <span style={{ width: `${failed ? 100 : progress}%` }} />
        </div>
        {failed ? (
          <button type="button" className={classes.textButton} disabled={start.isPending} onClick={() => start.mutate()}>
            Повторить
          </button>
        ) : null}
        {manual ? (
          <button type="button" className={classes.textButton} onClick={() => void downloadExport(exportId).then(reset)}>
            Скачать
          </button>
        ) : null}
      </div>
    );
  }

  const all = selected.size === SECTIONS.length;
  const partial = selected.size > 0 && !all;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      offset={8}
      zIndex={400}
      withinPortal
      transitionProps={{ transition: 'pop', duration: reduce ? 0 : 160 }}
    >
      <Popover.Target>
        <button
          type="button"
          className={opened ? `${classes.trigger} ${classes.open}` : classes.trigger}
          data-state={opened ? 'open' : 'closed'}
          onClick={() => {
            const next = !opened;
            if (next) setSelected(new Set([TAB_SECTION[tab] ?? 'info']));
            setOpened(next);
          }}
        >
          <span aria-hidden="true">↓</span>
          Выгрузить в Excel
          <span className={classes.chev} aria-hidden="true">▾</span>
        </button>
      </Popover.Target>
      <Popover.Dropdown className={classes.dropdown}>
        <p className={classes.caption}>Что включить в выгрузку</p>
        <Checkbox
          classNames={{ label: classes.check, body: classes.checkBody }}
          size="xs"
          color="green"
          label="Все разделы"
          checked={all}
          indeterminate={partial}
          onChange={(event) => setSelected(event.currentTarget.checked ? new Set(SECTIONS.map((item) => item.id)) : new Set())}
        />
        {SECTIONS.map((item) => (
          <Checkbox
            key={item.id}
            classNames={{ label: classes.check, body: classes.checkBody }}
            size="xs"
            color="green"
            label={item.label}
            checked={selected.has(item.id)}
            onChange={(event) => {
              const next = new Set(selected);
              if (event.currentTarget.checked) next.add(item.id);
              else next.delete(item.id);
              setSelected(next);
            }}
          />
        ))}
        <div className={classes.actions}>
          <button type="button" className={classes.ghost} onClick={() => setOpened(false)}>Отмена</button>
          <button type="button" className={classes.apply} disabled={selected.size === 0 || start.isPending} onClick={() => start.mutate()}>
            Сформировать файл
          </button>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
