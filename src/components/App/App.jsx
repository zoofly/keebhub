import React, { useEffect, useRef } from 'react';
import {
  HashRouter as Router,
  Route,
  Redirect,
  Switch,
  useLocation,
} from 'react-router-dom';

import { useDispatch } from 'react-redux';

import Nav from '../Nav/Nav';
import Footer from '../Footer/Footer';

import ProtectedRoute from '../ProtectedRoute/ProtectedRoute';

import AboutPage from '../AboutPage/AboutPage';
import UserPage from '../UserPage/UserPage';
import LandingPage from '../LandingPage/LandingPage';
import LoginPage from '../LoginPage/LoginPage';
import RegisterPage from '../RegisterPage/RegisterPage';
import Market from '../Market/Market';
import PostingForm from '../PostingForm/PostingForm';
import MyListings from '../MyListings/myListings';
import NotFoundPage from '../NotFoundPage/NotFoundPage';
import './App.css';

// On every page change, scroll to the top and move keyboard / screen reader
// focus to the main content (single-page apps don't do this on their own).
function RouteChangeFocus({ targetRef }) {
  const { pathname } = useLocation();
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    if (targetRef.current) {
      targetRef.current.focus({ preventScroll: true });
    }
  }, [pathname, targetRef]);

  return null;
}

function App() {
  const dispatch = useDispatch();
  const mainRef = useRef(null);

  useEffect(() => {
    dispatch({ type: 'FETCH_USER' });
  }, [dispatch]);

  return (
    <Router>
      <div className="app">
        <a className="skip-link" href="#main-content" onClick={(event) => {
          // HashRouter owns the URL hash, so move focus without changing it
          event.preventDefault();
          if (mainRef.current) mainRef.current.focus();
        }}>
          Skip to main content
        </a>
        <RouteChangeFocus targetRef={mainRef} />
        <Nav />
        <main id="main-content" className="app-main" tabIndex={-1} ref={mainRef}>
          <Switch>
            {/* Visiting localhost:3000 will redirect to localhost:3000/home */}
            <Redirect exact from="/" to="/home" />

            <Route exact path="/home">
              <LandingPage />
            </Route>

            {/* Visiting localhost:3000/about will show the about page. */}
            <Route
              // shows AboutPage at all times (logged in or not)
              exact
              path="/about"
            >
              <AboutPage />
            </Route>

            {/* For protected routes, the view could show one of several things on the same route.
              Visiting localhost:3000/user will show the UserPage if the user is logged in.
              If the user is not logged in, the ProtectedRoute will show the LoginPage (component).
              Even though it seems like they are different pages, the user is always on localhost:3000/user */}
            <ProtectedRoute
              // logged in shows UserPage else shows LoginPage
              exact
              path="/user"
            >
              <UserPage />
            </ProtectedRoute>

            <ProtectedRoute
              // logged in shows MarketPage else shows LoginPage
              exact
              path="/market"
            >
              <Market />
            </ProtectedRoute>

            {/* When a value is supplied for the authRedirect prop the user will
              be redirected to the path supplied when logged in, otherwise they will
              be taken to the component and path supplied. */}
            <ProtectedRoute
              // with authRedirect:
              // - if logged in, redirects to "/market"
              // - else shows LoginPage at /login
              exact
              path="/login"
              authRedirect="/market"
            >
              <LoginPage />
            </ProtectedRoute>

            <ProtectedRoute
              // with authRedirect:
              // - if logged in, redirects to "/market"
              // - else shows RegisterPage at "/registration"
              exact
              path="/registration"
              authRedirect="/market"
            >
              <RegisterPage />
            </ProtectedRoute>

            <ProtectedRoute
              // logged in shows PostingForm else shows LoginPage
              exact
              path="/create"
            >
              <PostingForm />
            </ProtectedRoute>

            <ProtectedRoute
              // logged in shows MyListings else shows LoginPage
              exact
              path="/mylistings"
            >
              <MyListings />
            </ProtectedRoute>

            {/* If none of the other routes matched, we will show a 404. */}
            <Route>
              <NotFoundPage />
            </Route>
          </Switch>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
