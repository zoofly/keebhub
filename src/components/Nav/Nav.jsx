import React from 'react';
import { Link } from 'react-router-dom';
import LogOutButton from '../LogOutButton/LogOutButton';
import './Nav.css';
import {useSelector} from 'react-redux';

function Nav() {
  const user = useSelector((store) => store.user);

  let loginLinkData = {
    path: '/login',
    text: 'Login / Register',
  };

  if (user.id != null) {
    loginLinkData.path = '/user';
    loginLinkData.text = 'Profile';
  }

  return (
    <div className="nav">
      <Link to="/home">
        <h2 className="nav-title">Keebhub</h2>
      </Link>
      <div>
        <Link className="navLink" to={loginLinkData.path}>
          {loginLinkData.text}
        </Link>
    
        {user.id && (
          <>
            <Link className="navLink" to="/market">
              Market
            </Link> 
            <Link className='navLink' to='/mylistings'>
              My Listings
            </Link>

            <Link className="navLink" to="/saved">
              Saved Listings
            </Link> 

            
            
            <LogOutButton className="navLink" />
            
          </>
          
        )}

        <Link className="navLink" to="/about">
          About
        </Link>
      </div>
    </div>
  );
}

export default Nav;
