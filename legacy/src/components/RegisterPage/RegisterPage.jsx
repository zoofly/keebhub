import React from 'react';
import { Link } from 'react-router-dom';
import RegisterForm from '../RegisterForm/RegisterForm';
import useDocumentTitle from '../../hooks/useDocumentTitle';

function RegisterPage() {
  useDocumentTitle('Create an account');

  return (
    <div className="page">
      <RegisterForm />
      <p className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}

export default RegisterPage;
