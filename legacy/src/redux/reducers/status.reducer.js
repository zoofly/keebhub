import { combineReducers } from 'redux';

// Tracks loading / error state for each list the app fetches so
// pages can show a spinner, an error with a retry, or an empty state.
const initialState = { loading: true, error: '' };

const makeStatusReducer = (requestType, successType, failureType) => (
  state = initialState,
  action
) => {
  switch (action.type) {
    case requestType:
      return { loading: true, error: '' };
    case successType:
      return { loading: false, error: '' };
    case failureType:
      return { loading: false, error: action.payload };
    default:
      return state;
  }
};

export default combineReducers({
  postings: makeStatusReducer('GET_LISTINGS', 'SET_POSTINGS', 'POSTINGS_FAILED'),
  myListings: makeStatusReducer(
    'GET_MY_LISTINGS',
    'SET_MY_LISTINGS',
    'MY_LISTINGS_FAILED'
  ),
  switches: makeStatusReducer('GET_SWITCHES', 'SET_SWITCHES', 'SWITCHES_FAILED'),
});
