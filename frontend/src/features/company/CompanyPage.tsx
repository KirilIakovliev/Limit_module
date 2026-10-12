import { Skeleton } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../../api/http';
import { useClient, useGroup, useLimits, useMeta } from '../../api/hooks';
import { compactMoney, formatStamp } from './format';
import { ApplicationsTab } from './ApplicationsTab';
import { ExportMenu } from './ExportMenu';
import { LimitsTab } from './LimitsTab';
import { todayIso } from './limitsView';
import classes from './CompanyPage.module.css';

const TABS = ['Общая информация', 'Лимиты', 'Лимиты на рассмотрении', 'Резервы'] as const;
const NO_DATA = 'нет данных';

type Member = NonNullable<NonNullable<ReturnType<typeof useGroup>['data']>['members']>[number];
type Summary = NonNullable<NonNullable<ReturnType<typeof useGroup>['data']>['summaries']>[number];

export function CompanyPage() {
  const { inn = '' } = useParams();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Общая информация');
  const today = todayIso();
  const [day, setDay] = useState(today);
  const [showClosed, setShowClosed] = useState(true);
  const card = useClient(inn);
  const meta = useMeta();
  const limits = useLimits(tab === 'Лимиты' || tab === 'Лимиты на рассмотрении' ? inn : '');
  const crmId = card.data?.group?.crm_id ?? '';
  const group = useGroup(crmId, crmId.length > 0);
  const company = card.data;

  return (
    <div className={classes.page} data-page="company">
      <Link className={classes.back} to="/">К поиску</Link>
      {card.isError ? <Message error={card.error} onRetry={() => void card.refetch()} /> : null}
      {!company && !card.isError ? <Skeleton className={classes.bone} height={72} radius="md" /> : null}
      {company ? (
        <>
          <section className={classes.panel}>
            <div className={classes.identity}>
              <span className={classes.mark} aria-hidden="true"><BuildingIcon /></span>
              <Field label="Компания" value={company.name || '—'} />
              <Field label="ИНН" value={company.inn} />
              <Field label="КПП" value={text(company.kpp)} />
              <Field label="События" value={NO_DATA} muted />
            </div>
          </section>
          <div className={classes.toolbar}>
            <div className={classes.tabs} role="tablist" aria-label="Разделы профиля">
              {TABS.map((item) => {
                const open = item !== 'Резервы';
                return (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    className={item === tab ? classes.tabActive : classes.tab}
                    aria-selected={item === tab}
                    aria-disabled={!open}
                    onClick={() => { if (open) setTab(item); }}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
            <div className={classes.side}>
              <ExportMenu inn={company.inn} tab={tab} asOf={day} showClosed={showClosed} />
              <p className={classes.fresh}>Дата актуализации данных: {formatStamp(meta.data?.updated_at)}</p>
            </div>
          </div>
          {tab === 'Общая информация' ? (
            <>
              <InfoTable company={company} />
              {crmId ? <GroupBlock query={group} currentInn={company.inn} /> : null}
            </>
          ) : tab === 'Лимиты' ? (
            <LimitsTab query={limits} group={group} day={day} showClosed={showClosed} onDay={setDay} onShowClosed={setShowClosed} />
          ) : (
            <ApplicationsTab query={limits} />
          )}
        </>
      ) : null}
    </div>
  );
}

function GroupBlock({
  query,
  currentInn,
}: {
  query: ReturnType<typeof useGroup>;
  currentInn: string;
}) {
  if (query.isError) {
    return <section className={classes.panel}><p className={classes.muted}>Не удалось загрузить данные группы</p></section>;
  }
  if (!query.data) return <Skeleton className={classes.bone} height={120} radius="md" />;
  const { data } = query;
  const rows = groupCompanies(data.members, currentInn);
  return (
    <section className={`${classes.panel} ${classes.rise}`} aria-label="Группа компаний">
      <div className={classes.blockHead}>
        <h2>{data.name || 'Группа компаний'}</h2>
      </div>
      <h3>Единый лимит</h3>
      <div className={classes.metrics}>
        <Fact label="Сумма единого лимита" value={<SummaryLines rows={data.summaries} field="unified_limit" />} />
        <Fact label="Единый утилизированный лимит" value={<SummaryLines rows={data.summaries} field="unified_utilized" />} />
        <Fact label="Единый доступный лимит" value={<SummaryLines rows={data.summaries} field="unified_available" />} />
        <Fact label="Совокупный лимит" value={<SummaryLines rows={data.summaries} field="total_limit" />} />
        <Fact label="«Крышка»" value={NO_DATA} />
      </div>
      <h3>Компании в структуре ГК</h3>
      <p className={classes.hint}>Выберите наименование компании, чтобы перейти к её карточке</p>
      <div className={classes.scroll}>
        <table className={classes.grid}>
          <thead>
            <tr>
              <th>Наименование ГК</th>
              <th>Совокупный лимит</th>
              <th>Сумма единого лимита</th>
              <th>Единый утилизированный лимит</th>
              <th>Единый доступный лимит</th>
              <th>«Крышка»</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.inn}>
                <td>
                  <CompanyName row={row} currentInn={currentInn} />
                </td>
                <td>{NO_DATA}</td>
                <td><MemberLines rows={row.rows} field="unified_limit" /></td>
                <td><MemberLines rows={row.rows} field="unified_utilized" /></td>
                <td><MemberLines rows={row.rows} field="unified_available" /></td>
                <td>{NO_DATA}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InfoTable({ company }: { company: NonNullable<ReturnType<typeof useClient>['data']> }) {
  const rows: [string, string][] = [
    ['Наименование компании', company.name || '—'],
    ['ИНН', company.inn],
    ['ОГРН', text(company.ogrn)],
    ['КПП', text(company.kpp)],
    ['Адрес', text(company.address)],
    ['ОКВЭД', text(company.okved)],
    ['Группа компаний', company.group?.name || 'Отсутствует'],
  ];
  return (
    <section className={classes.panel} aria-label="Общая информация">
      <h2>Общая информация</h2>
      <table className={classes.attrs}>
        <thead>
          <tr><th>Атрибут</th><th>Значение</th></tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}><td>{label}</td><td>{value}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SummaryLines({ rows, field }: { rows: Summary[]; field: 'unified_limit' | 'unified_utilized' | 'unified_available' | 'total_limit' }) {
  return <MoneyLines rows={rows} field={field} />;
}

function MemberLines({ rows, field }: { rows: Member[]; field: 'unified_limit' | 'unified_utilized' | 'unified_available' }) {
  return <MoneyLines rows={rows} field={field} />;
}

function MoneyLines({
  rows,
  field,
}: {
  rows: { currency?: string | null; unified_limit?: string | null; unified_utilized?: string | null; unified_available?: string | null; total_limit?: string | null; is_exceeded?: boolean }[];
  field: 'unified_limit' | 'unified_utilized' | 'unified_available' | 'total_limit';
}) {
  if (!rows.length) return '—';
  return (
    <span className={classes.lines}>
      {rows.map((row, index) => (
        <span key={`${row.currency ?? ''}-${index}`} className={row.is_exceeded ? classes.exceeded : undefined}>
          {compactMoney(row[field], row.currency)}
        </span>
      ))}
    </span>
  );
}

function groupCompanies(members: Member[], currentInn: string) {
  const byInn = new Map<string, { inn: string; name: string | null; hasCard: boolean; rows: Member[] }>();
  for (const member of members) {
    const item = byInn.get(member.inn) ?? { inn: member.inn, name: member.name ?? null, hasCard: false, rows: [] };
    if (!item.name && member.name) item.name = member.name;
    item.hasCard = item.hasCard || member.has_card;
    item.rows.push(member);
    byInn.set(member.inn, item);
  }
  return [...byInn.values()].sort((a, b) => Number(b.inn === currentInn) - Number(a.inn === currentInn));
}

function CompanyName({
  row,
  currentInn,
}: {
  row: { inn: string; name: string | null; hasCard: boolean };
  currentInn: string;
}) {
  if (row.inn === currentInn) {
    return (
      <>
        <strong>{row.name || '—'}</strong>
        <span className={classes.note}>текущая компания</span>
      </>
    );
  }
  if (!row.hasCard) {
    return (
      <>
        <strong>{row.name || '—'}</strong>
        <span className={classes.note}>карточки нет</span>
      </>
    );
  }
  return (
    <Link className={classes.companyLink} to={`/company/${encodeURIComponent(row.inn)}`}>
      <span>{row.name || '—'}</span>
      <ArrowIcon />
    </Link>
  );
}

function Field({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={classes.field}>
      <span>{label}</span>
      <strong className={muted ? classes.muted : undefined}>{value}</strong>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={classes.fact}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Message({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const missing = error instanceof ApiError && error.status === 404;
  return (
    <section className={classes.panel}>
      <h2>{missing ? 'Компания не найдена' : 'Не удалось открыть профиль'}</h2>
      <button type="button" className={classes.retry} onClick={onRetry}>Повторить</button>
    </section>
  );
}

function text(value: string | null | undefined) {
  return value?.trim() ? value : '—';
}

function BuildingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12 2.5 4.5 7.2V21h15V7.2L12 2.5ZM8.8 10.2h2.2v2.2H8.8v-2.2Zm4.2 0h2.2v2.2h-2.2v-2.2ZM8.8 14h2.2v2.2H8.8V14Zm4.2 0h2.2v2.2h-2.2V14ZM10.8 17.4h2.4V21h-2.4v-3.6Z"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className={classes.go} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
