import React from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Button } from '@material-ui/core';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import './LandingPage.css';

// CUSTOM COMPONENTS
import RegisterForm from '../RegisterForm/RegisterForm';
import SwitchList from '../SwitchList/SwitchList';

function LandingPage() {
  useDocumentTitle('');
  const user = useSelector((store) => store.user);

  return (
    <div className="page">
      <section className={`hero ${user.id ? '' : 'hero_with-form'}`}>
        <div className="hero__intro">
          <p className="hero__eyebrow">The mechanical keyboard marketplace</p>
          <h1 className="hero__title">
            {user.id ? `Welcome back, ${user.username}!` : 'Welcome to Keebhub'}
          </h1>
          <p className="hero__text">
            Buy, sell, and trade keyboards, switches, and keycaps with people in
            the community. No more sifting through forum threads that send you
            to vendors you've never heard of.
          </p>
          <div className="hero__actions">
            {user.id ? (
              <>
                <Button component={Link} to="/market" variant="contained" color="primary" size="large">
                  Browse the market
                </Button>
                <Button component={Link} to="/create" variant="outlined" color="primary" size="large">
                  Create a listing
                </Button>
              </>
            ) : (
              <Button component={Link} to="/login" variant="outlined" color="primary" size="large">
                I already have an account
              </Button>
            )}
          </div>
        </div>

        {!user.id && (
          <div className="hero__form">
            <RegisterForm headingLevel="h2" />
          </div>
        )}
      </section>

      <SwitchList />
    </div>
  );
}

export default LandingPage;
