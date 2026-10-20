import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Card, TextField } from '@material-ui/core';
import '../RegisterForm/AuthForm.css';

function LoginForm({ headingLevel: Heading = 'h1' }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const errors = useSelector((store) => store.errors);
  const dispatch = useDispatch();

  // Don't show an error left over from an earlier visit
  useEffect(() => {
    dispatch({ type: 'CLEAR_LOGIN_ERROR' });
  }, [dispatch]);

  const login = (event) => {
    event.preventDefault();

    if (username.trim() && password) {
      dispatch({
        type: 'LOGIN',
        payload: {
          username: username.trim(),
          password: password,
        },
      });
    } else {
      dispatch({ type: 'LOGIN_INPUT_ERROR' });
    }
  }; // end login

  return (
    <Card className="auth-card" component="section" aria-labelledby="login-heading">
      <form className="form-stack" onSubmit={login} noValidate>
        <Heading id="login-heading" className="auth-card__title">
          Log in
        </Heading>
        {errors.loginMessage && (
          <div className="alert" role="alert">
            {errors.loginMessage}
          </div>
        )}
        <TextField
          id="login-username"
          label="Username"
          name="username"
          required
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <TextField
          id="login-password"
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" variant="contained" color="primary" size="large" fullWidth>
          Log in
        </Button>
      </form>
    </Card>
  );
}

export default LoginForm;
