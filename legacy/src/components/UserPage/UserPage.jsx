import React from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Button, Card } from '@material-ui/core';
import LogOutButton from '../LogOutButton/LogOutButton';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import './UserPage.css';

function UserPage() {
  useDocumentTitle('Profile');
  const user = useSelector((store) => store.user);

  return (
    <div className="page page_narrow">
      <Card className="profile-card">
        <h1>Hi, {user.username}!</h1>
        <p className="page-lede">Manage your listings or see what's new on the market.</p>

        <dl className="profile-card__details">
          <div>
            <dt>Username</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt>Member ID</dt>
            <dd>{user.id}</dd>
          </div>
        </dl>

        <div className="profile-card__actions">
          <Button component={Link} to="/mylistings" variant="contained" color="primary">
            My listings
          </Button>
          <Button component={Link} to="/market" variant="outlined" color="primary">
            Browse the market
          </Button>
          <LogOutButton />
        </div>
      </Card>
    </div>
  );
}

// this allows us to use <App /> in index.js
export default UserPage;
