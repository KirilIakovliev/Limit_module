import { Button, Loader, Skeleton, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { useSearch } from '../../api/hooks';
import classes from './SearchPage.module.css';

const MIN_QUERY = 3;
const DEBOUNCE_MS = 360;

export function SearchPage() {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const [debounced, , { flush }] = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const settled = trimmed.length >= MIN_QUERY ? debounced : '';
  const query = settled.length >= MIN_QUERY ? settled : '';
  const search = useSearch(query);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (trimmed.length < MIN_QUERY) return;
    if (trimmed === query) {
      void search.refetch();
      return;
    }
    flush();
  }

  function clear() {
    setDraft('');
  }

  return (
    <>
      <section className={classes.panel}>
        <div className={classes.heading}>
          <span className={classes.mark} aria-hidden="true">
            <SearchIcon />
          </span>
          <div>
            <h2>Поиск компании</h2>
            <p>Поиск по ИНН или названию компании</p>
          </div>
        </div>
        <form className={classes.form} aria-label="Поиск компании" onSubmit={onSubmit}>
          <TextInput
            className={classes.field}
            classNames={{ input: classes.input }}
            aria-label="ИНН или название компании"
            placeholder="Введите ИНН или название компании"
            autoComplete="off"
            size="sm"
            value={draft}
            leftSection={<SearchIcon />}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
          <Button className={classes.press} type="submit" size="sm" disabled={trimmed.length < MIN_QUERY}>
            Найти
          </Button>
        </form>
      </section>
      <SearchResult
        query={query}
        data={search.data}
        fetching={search.isFetching}
        failed={search.isError}
        onClear={clear}
        onRetry={() => void search.refetch()}
      />
    </>
  );
}

function SearchResult({
  query,
  data,
  fetching,
  failed,
  onClear,
  onRetry,
}: {
  query: string;
  data: { inn: string; name?: string | null; kpp?: string | null }[] | undefined;
  fetching: boolean;
  failed: boolean;
  onClear: () => void;
  onRetry: () => void;
}) {
  const rows = data ?? [];
  const view = !query ? 'empty' : failed && !fetching ? 'error' : !data ? 'loading' : rows.length === 0 ? 'missing' : 'found';
  const body = view === 'empty' ? <Empty />
    : view === 'error' ? <Failure onRetry={onRetry} />
    : view === 'loading' ? <Loading />
    : view === 'missing' ? <NotFound onClear={onClear} />
    : <Results rows={rows} />;
  return <div key={view} className={classes.reveal}>{body}</div>;
}

function Empty() {
  return (
    <section className={`${classes.empty} ${classes.slot}`}>
      <SearchIcon />
      <h2>Введите ИНН или название компании, чтобы найти организацию</h2>
      <p>Результат поиска появится здесь</p>
    </section>
  );
}

function Loading() {
  return (
    <section className={`${classes.panel} ${classes.slot} ${classes.center}`} aria-busy="true">
      <p className={classes.status}>
        <Loader size="xs" /> Ищем компанию...
      </p>
      <div className={classes.list}>
        {[0, 1].map((row) => (
          <div className={classes.card} key={row}>
            <Skeleton className={classes.shimmer} animate={false} height={32} width={32} radius="sm" />
            <Skeleton className={classes.shimmer} animate={false} height={14} />
            <Skeleton className={classes.shimmer} animate={false} height={14} />
            <Skeleton className={classes.shimmer} animate={false} height={14} />
            <Skeleton className={classes.shimmer} animate={false} height={32} width={140} radius="sm" />
          </div>
        ))}
      </div>
    </section>
  );
}

function Results({ rows }: { rows: { inn: string; name?: string | null; kpp?: string | null }[] }) {
  return (
    <section className={`${classes.panel} ${classes.slot} ${rows.length === 1 ? classes.center : ''}`}>
      <p className={classes.caption}>Найдено: {rows.length}</p>
      <div className={classes.list}>
        {rows.map((row) => (
          <div className={classes.card} key={row.inn}>
            <span className={classes.mark} aria-hidden="true">
              <BuildingIcon />
            </span>
            <div className={classes.cell}>
              <span>Компания</span>
              <strong>{row.name || '—'}</strong>
            </div>
            <div className={classes.cell}>
              <span>ИНН</span>
              <strong>{row.inn}</strong>
            </div>
            <div className={classes.cell}>
              <span>КПП</span>
              <strong>{row.kpp || '—'}</strong>
            </div>
            <Button className={classes.press} component={Link} to={`/company/${encodeURIComponent(row.inn)}`} size="sm" leftSection={<ArrowIcon />}>
              Открыть профиль
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function NotFound({ onClear }: { onClear: () => void }) {
  return (
    <section className={`${classes.empty} ${classes.slot}`}>
      <SearchIcon />
      <h2>Компания не найдена</h2>
      <p>Попробуйте изменить запрос и проверить ИНН или название</p>
      <Button className={classes.press} variant="default" size="sm" onClick={onClear}>
        Очистить поиск
      </Button>
    </section>
  );
}

function Failure({ onRetry }: { onRetry: () => void }) {
  return (
    <section className={`${classes.failure} ${classes.slot}`} role="alert">
      <span className={classes.warn} aria-hidden="true">
        <WarnIcon />
      </span>
      <div>
        <h2>Не удалось выполнить поиск</h2>
        <p>Проверьте соединение или повторите попытку позже</p>
      </div>
      <Button className={classes.press} variant="outline" size="sm" leftSection={<RetryIcon />} onClick={onRetry}>
        Повторить
      </Button>
    </section>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20h16M7 20V5h10v15M10 9h.01M14 9h.01M10 13h.01M14 13h.01M10 17h4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.2-5.5M20 4v5h-5" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 8v5M12 16.5h.01" />
      <path d="M10.3 4.8 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}
