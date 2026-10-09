import { Title } from '@mantine/core';
import classes from './Shell.module.css';

export function Shell() {
  return (
    <main className={classes.shell}>
      <Title order={1}>Лимитный модуль</Title>
      <p className={classes.note}>Новый интерфейс. Экраны ещё не перенесены.</p>
    </main>
  );
}
