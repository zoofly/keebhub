import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Card, TextField } from '@material-ui/core';
import { LIMITS, validateRegistration } from '../../utils/validation';
import './AuthForm.css';

function RegisterForm({ headingLevel: Heading = 'h1' }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState(false);
  const errors = useSelector((store) => store.errors);
  const dispatch = useDispatch();

  // Don't show an error left over from an earlier visit
  useEffect(() => {
    dispatch({ type: 'CLEAR_REGISTRATION_ERROR' });
  }, [dispatch]);

  const fieldErrors = validateRegistration({ username, password });
  const errorFor = (field) =>
    (attempted || touched[field]) && fieldErrors[field] ? fieldErrors[field] : '';

  const registerUser = (event) => {
    event.preventDefault();
    setAttempted(true);

    if (fieldErrors.username) {
      document.getElementById('register-username').focus();
      return;
    }
    if (fieldErrors.password) {
      document.getElementById('register-password').focus();
      return;
    }

    dispatch({
      type: 'REGISTER',
      payload: {
        username: username.trim(),
        password: password,
      },
    });
  }; // end registerUser

  const usernameError = errorFor('username');
  const passwordError = errorFor('password');

  return (
    <Card className="auth-card" component="section" aria-labelledby="register-heading">
      <form className="form-stack" onSubmit={registerUser} noValidate>
        <Heading id="register-heading" className="auth-card__title">
          Create an account
        </Heading>
        {errors.registrationMessage && (
          <div className="alert" role="alert">
            {errors.registrationMessage}
          </div>
        )}
        <TextField
          id="register-username"
          label="Username"
          name="username"
          required
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          onBlur={() => setTouched({ ...touched, username: true })}
          error={Boolean(usernameError)}
          helperText={usernameError || `Up to ${LIMITS.usernameMax} characters.`}
          inputProps={{ maxLength: LIMITS.usernameMax }}
        />
        <TextField
          id="register-password"
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onBlur={() => setTouched({ ...touched, password: true })}
          error={Boolean(passwordError)}
          helperText={
            passwordError ||
            `${LIMITS.passwordMin}–${LIMITS.passwordMaxBytes} characters.`
          }
        />
        <Button type="submit" variant="contained" color="primary" size="large" fullWidth>
          Create account
        </Button>
      </form>
    </Card>
  );
}

export default RegisterForm;
