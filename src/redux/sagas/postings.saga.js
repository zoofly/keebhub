import { put, call, takeEvery } from 'redux-saga/effects';
import axios from 'axios';
import {
  listingErrorMessage,
  loadErrorMessage,
  statusOf,
} from '../../utils/apiErrors';

function* postingsSaga() {
  yield takeEvery('GET_LISTINGS', fetchPosts); //should match up on client sided sagas
  yield takeEvery('ADD_POST', addPost);
}

// If the session ran out, drop the client-side user so the login form shows
export function* handleSessionExpired(error) {
  const status = statusOf(error);
  if (status === 401 || status === 403) {
    yield put({ type: 'UNSET_USER' });
  }
}

function* fetchPosts() {
  try {
    const response = yield axios.get('/market');
    yield put({ type: 'SET_POSTINGS', payload: response.data });
  } catch (error) {
    yield put({
      type: 'POSTINGS_FAILED',
      payload: loadErrorMessage(error, 'listings'),
    });
    yield* handleSessionExpired(error);
  }
}

// Saga to add a Post that was created.
// action.resolve / action.reject let the form react to the real result.
function* addPost(action) {
  try {
    yield call(axios.post, '/market', action.payload);
    yield put({ type: 'GET_LISTINGS' });
    yield put({ type: 'GET_MY_LISTINGS' });
    if (action.resolve) action.resolve();
  } catch (error) {
    if (action.reject) action.reject(listingErrorMessage(error));
    yield* handleSessionExpired(error);
  }
}

export default postingsSaga;
