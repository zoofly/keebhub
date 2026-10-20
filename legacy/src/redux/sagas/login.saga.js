import { put, takeLatest } from 'redux-saga/effects';
import axios from 'axios';
import { statusOf } from '../../utils/apiErrors';

// worker Saga: will be fired on "LOGIN" actions
function* loginUser(action) {
  try {
    // clear any existing error on the login page
    yield put({ type: 'CLEAR_LOGIN_ERROR' });

    const config = {
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true,
    };

    // send the action.payload as the body
    // the config includes credentials which
    // allow the server session to recognize the user
    yield axios.post('/api/user/login', action.payload, config);

    // after the user has logged in
    // get the user information from the server
    yield put({ type: 'FETCH_USER' });
  } catch (error) {
    // Don't log the error object: it includes the request body (the password)
    const status = statusOf(error);
    if (status === 401 || status === 404) {
      // passport rejects unknown users and wrong passwords
      yield put({ type: 'LOGIN_FAILED' });
    } else if (status === 429) {
      yield put({ type: 'LOGIN_RATE_LIMITED' });
    } else {
      // Most common cause is the server not running
      yield put({ type: 'LOGIN_FAILED_NO_CODE' });
    }
  }
}

// worker Saga: will be fired on "LOGOUT" actions
function* logoutUser(action) {
  try {
    const config = {
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true,
    };

    // the config includes credentials which
    // allow the server session to recognize the user
    // when the server recognizes the user session
    // it will end the session
    yield axios.post('/api/user/logout', {}, config);

    // now that the session has ended on the server
    // remove the client-side user object to let
    // the client-side code know the user is logged out
    yield put({ type: 'UNSET_USER' });
  } catch (error) {
    console.log('Error with user logout, status', statusOf(error));
  }
}

function* loginSaga() {
  yield takeLatest('LOGIN', loginUser);
  yield takeLatest('LOGOUT', logoutUser);
}

export default loginSaga;
