import { combineReducers } from 'redux';

const RATE_LIMITED =
  'Too many attempts in a short time. Please wait about 15 minutes and try again.';

// loginMessage holds the string that will display
// on the login screen if there's an error
const loginMessage = (state = '', action) => {
  switch (action.type) {
    case 'CLEAR_LOGIN_ERROR':
      return '';
    case 'LOGIN_INPUT_ERROR':
      return 'Enter your username and password.';
    case 'LOGIN_FAILED':
      return "That username and password didn't match. Please try again.";
    case 'LOGIN_RATE_LIMITED':
      return RATE_LIMITED;
    case 'LOGIN_FAILED_NO_CODE':
      return 'We could not reach the server. Check your connection and try again.';
    default:
      return state;
  }
};

// registrationMessage holds the string that will display
// on the registration screen if there's an error
const registrationMessage = (state = '', action) => {
  switch (action.type) {
    case 'CLEAR_REGISTRATION_ERROR':
      return '';
    case 'REGISTRATION_INPUT_ERROR':
      return 'Choose a username and password.';
    case 'REGISTRATION_INVALID':
      return 'Usernames must be 1–80 characters and passwords 8–72 characters.';
    case 'REGISTRATION_RATE_LIMITED':
      return RATE_LIMITED;
    case 'REGISTRATION_FAILED':
      return 'That account could not be created. The username might already be taken. Try another one.';
    case 'REGISTRATION_FAILED_NO_CODE':
      return 'We could not reach the server. Check your connection and try again.';
    default:
      return state;
  }
};

// make one object that has keys loginMessage, registrationMessage
// these will be on the redux state at:
// state.errors.loginMessage and state.errors.registrationMessage
export default combineReducers({
  loginMessage,
  registrationMessage,
});
