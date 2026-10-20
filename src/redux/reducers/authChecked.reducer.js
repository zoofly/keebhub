// false until the app has asked the server whether someone is logged in.
// Lets protected pages show a spinner instead of flashing the login form.
const authChecked = (state = false, action) => {
  switch (action.type) {
    case 'SET_USER':
    case 'UNSET_USER':
    case 'USER_FETCH_FAILED':
      return true;
    default:
      return state;
  }
};

export default authChecked;
