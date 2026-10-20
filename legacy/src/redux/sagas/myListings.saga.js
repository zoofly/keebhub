import { put, takeEvery } from 'redux-saga/effects';
import axios from 'axios';
import { loadErrorMessage } from '../../utils/apiErrors';
import { handleSessionExpired } from './postings.saga';

function* myListingsSaga() {
  yield takeEvery('GET_MY_LISTINGS', getListings);
}

function* getListings() {
  try {
    const response = yield axios.get('/mylistings');
    yield put({ type: 'SET_MY_LISTINGS', payload: response.data });
  } catch (error) {
    yield put({
      type: 'MY_LISTINGS_FAILED',
      payload: loadErrorMessage(error, 'your listings'),
    });
    yield* handleSessionExpired(error);
  }
}

export default myListingsSaga;
