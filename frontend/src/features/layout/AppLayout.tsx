import { Avatar, Menu } from '@mantine/core';
import { Link, Outlet, useLocation } from 'react-router';
import classes from './AppLayout.module.css';

const user = { name: 'Мария Иванова', role: 'Кредитный аналитик', initials: 'МИ' };

export function AppHeader() {
  return (
    <header className={classes.header}>
      <h1 className={classes.brand}>
        <Link to="/">Лимитный модуль</Link>
      </h1>
      <Menu position="bottom-end" offset={8} zIndex={400} transitionProps={{ transition: 'pop', duration: 180 }}>
        <Menu.Target>
          <button type="button" className={classes.profile} aria-label="Профиль пользователя">
            <Avatar size={28} radius="xl" color="green">{user.initials}</Avatar>
            <Chevron />
          </button>
        </Menu.Target>
        <Menu.Dropdown className={classes.menu}>
          <div className={classes.user}>
            <Avatar size={36} radius="xl" color="green">{user.initials}</Avatar>
            <div>
              <strong>{user.name}</strong>
              <span>{user.role}</span>
            </div>
          </div>
          <Menu.Divider />
          <Menu.Item leftSection={<LogoutIcon />} onClick={() => undefined}>
            Выйти
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </header>
  );
}

function Chevron() {
  return (
    <svg className={classes.chevron} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2M15 12H3m0 0 3-3m-3 3 3 3" />
    </svg>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  return (
    <div className={classes.scene}>
      <div className={classes.blobs} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <AppHeader />
      <main className={classes.main}>
        <div key={pathname} className={classes.pageIn}>
          <Outlet />
        </div>
      </main>
      <footer className={classes.footer}>ПАО «АК БАРС» БАНК</footer>
    </div>
  );
}
