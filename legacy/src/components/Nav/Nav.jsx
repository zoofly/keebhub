import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import LogOutButton from '../LogOutButton/LogOutButton';
import './Nav.css';

const guestLinks = [
  { to: '/home', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/login', label: 'Log in' },
  { to: '/registration', label: 'Sign up', cta: true },
];

const memberLinks = [
  { to: '/market', label: 'Market' },
  { to: '/mylistings', label: 'My listings' },
  { to: '/create', label: 'Sell' },
  { to: '/user', label: 'Profile' },
  { to: '/about', label: 'About' },
];

function Nav() {
  const user = useSelector((store) => store.user);
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = user.id ? memberLinks : guestLinks;

  // Close the mobile menu after navigating
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close the mobile menu with Escape
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/home" className="site-brand">
          <span className="site-brand__key" aria-hidden="true">
            K
          </span>
          Keebhub
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-nav"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="nav-toggle__bars" aria-hidden="true" />
          Menu
        </button>

        <nav
          id="primary-nav"
          aria-label="Main"
          className={`site-nav ${menuOpen ? 'site-nav_open' : ''}`}
        >
          <ul className="site-nav__list">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  className={`site-nav__link ${link.cta ? 'site-nav__link_cta' : ''}`}
                  activeClassName="site-nav__link_active"
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
            {user.id && (
              <li>
                <LogOutButton className="site-nav__link site-nav__button" />
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export default Nav;
