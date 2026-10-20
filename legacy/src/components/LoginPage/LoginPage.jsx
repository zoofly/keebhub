import React from 'react';
import { Link } from 'react-router-dom';
import LoginForm from '../LoginForm/LoginForm';
import useDocumentTitle from '../../hooks/useDocumentTitle';

function LoginPage() {
  useDocumentTitle('Log in');

  return (
    <div className="page">
      <LoginForm />
      <p className="auth-switch">
        New to Keebhub? <Link to="/registration">Create an account</Link>
      </p>
    </div>
  );
}

export default LoginPage;
