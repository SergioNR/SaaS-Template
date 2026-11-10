import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';

const AuthNavBar = () => {
  const { t } = useTranslation();

  return (
    <div className="navBarWrapper">
      <div className="logoContainer">
        <NavLink to="/">
          <img src="/logo.svg" alt={t('common.logoAlt')} />
        </NavLink>
      </div>
    </div>
  );
};

export default AuthNavBar;
