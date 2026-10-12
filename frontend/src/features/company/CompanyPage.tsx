import { useParams } from 'react-router';
import classes from './CompanyPage.module.css';

export function CompanyPage() {
  const { inn = '' } = useParams();
  return (
    <section className={classes.page}>
      <h2>Профиль компании</h2>
      <p>ИНН {inn}</p>
    </section>
  );
}
