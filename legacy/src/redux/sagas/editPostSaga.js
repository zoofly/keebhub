import { put, call, takeEvery } from 'redux-saga/effects';
import axios from 'axios';
import { listingErrorMessage, statusOf } from '../../utils/apiErrors';
import { handleSessionExpired } from './postings.saga';

function* editPostSaga() {
  yield takeEvery('EDIT_ITEM', editItem);
}

// action.payload: { id, title, description, image, price }
// action.resolve / action.reject report the real result back to the form
function* editItem(action) {
  const { id, ...posting } = action.payload;
  try {
    yield call(axios.put, `/market/${id}`, posting);
    yield put({ type: 'GET_MY_LISTINGS' });
    yield put({ type: 'GET_LISTINGS' });
    if (action.resolve) action.resolve();
  } catch (error) {
    if (action.reject) action.reject(listingErrorMessage(error));
    if (statusOf(error) === 404) {
      // The listing is gone or not ours; refresh so the UI matches the server
      yield put({ type: 'GET_MY_LISTINGS' });
      yield put({ type: 'GET_LISTINGS' });
    }
    yield* handleSessionExpired(error);
  }
}

export default editPostSaga;
