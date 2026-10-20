import { put, call, takeEvery } from 'redux-saga/effects';
import axios from 'axios';
import { listingErrorMessage, statusOf } from '../../utils/apiErrors';
import { handleSessionExpired } from './postings.saga';

function* deleteSaga() {
  yield takeEvery('DELETE_POST', deleteItem);
}

// action.payload is the posting id
function* deleteItem(action) {
  try {
    yield call(axios.delete, `/market/${action.payload}`);
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

export default deleteSaga;
