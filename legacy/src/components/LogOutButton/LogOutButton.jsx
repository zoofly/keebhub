import React from 'react';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { Button } from '@material-ui/core';

// Renders a plain <button> when a className is passed (e.g. styled as a
// nav link), otherwise a Material-UI outlined button.
function LogOutButton(props) {
  const dispatch = useDispatch();
  const history = useHistory();

  const logOut = () => {
    dispatch({ type: 'LOGOUT' });
    history.push('/home');
  };

  if (props.className) {
    return (
      <button type="button" className={props.className} onClick={logOut}>
        Log out
      </button>
    );
  }

  return (
    <Button variant="outlined" color="primary" onClick={logOut}>
      Log out
    </Button>
  );
}

export default LogOutButton;
